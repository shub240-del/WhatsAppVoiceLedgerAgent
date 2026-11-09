// In-memory stand-in for the subset of firebase-admin Firestore that the server uses.
// Used only by tests when the Firestore emulator is unavailable (MEMORY_FIRESTORE=1).
// Fidelity rules it enforces on purpose, because they catch real bugs:
//  - create() fails if the document exists; update() fails if it does not.
//  - Inside a transaction, every read must happen before the first write.
//  - Transactions are optimistic: if a document read in the transaction was changed by
//    someone else before commit, the transaction body is retried (like Firestore).
//  - Queries skip documents missing an orderBy/inequality field, and order by that field.
import { FieldPath, Timestamp } from "firebase-admin/firestore";

type Data = Record<string, unknown>;
type Stored = { data: Data; version: number };

class FirestoreError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

function clone<T>(value: T): T {
  if (value instanceof Timestamp) return new Timestamp(value.seconds, value.nanoseconds) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === "object") {
    if (value instanceof Date) return new Date(value) as T;
    const out: Data = {};
    for (const [k, v] of Object.entries(value as Data)) if (v !== undefined) out[k] = clone(v);
    return out as T;
  }
  return value;
}

function getField(data: Data, path: string): unknown {
  return path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Data)[k] : undefined), data);
}
function setField(data: Data, path: string, value: unknown) {
  const keys = path.split(".");
  let target = data;
  for (const k of keys.slice(0, -1)) target = (target[k] ??= {}) as Data;
  target[keys[keys.length - 1]] = value;
}

function compare(a: unknown, b: unknown): number {
  if (a instanceof Timestamp && b instanceof Timestamp) return a.toMillis() - b.toMillis() || a.nanoseconds - b.nanoseconds;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (a === null && b === null) return 0;
  // Different types: Firestore orders null < boolean < number < timestamp < string. Good enough here.
  const rank = (v: unknown) => (v === null ? 0 : typeof v === "boolean" ? 1 : typeof v === "number" ? 2 : v instanceof Timestamp ? 3 : 4);
  return rank(a) - rank(b);
}
const equal = (a: unknown, b: unknown) =>
  a instanceof Timestamp && b instanceof Timestamp ? a.isEqual(b) : JSON.stringify(a) === JSON.stringify(b);

export class MemoryFirestore {
  store = new Map<string, Stored>();
  private autoId = 0;

  collection(path: string) {
    return new MemoryCollection(this, path);
  }
  doc(path: string) {
    const i = path.lastIndexOf("/");
    return new MemoryDoc(this, path.slice(0, i), path.slice(i + 1));
  }
  newId() {
    return `auto${String(++this.autoId).padStart(8, "0")}`;
  }
  batch() {
    return new MemoryBatch(this);
  }
  async runTransaction<T>(fn: (tx: MemoryTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const tx = new MemoryTransaction(this);
      const result = await fn(tx);
      if (tx.commit()) return result;
    }
    throw new FirestoreError(10, "ABORTED: too much contention");
  }
  async terminate() {}
  clear() {
    this.store.clear();
  }
}

export class MemoryDoc {
  constructor(public db: MemoryFirestore, public parentPath: string, public id: string) {}
  get path() {
    return `${this.parentPath}/${this.id}`;
  }
  get parent() {
    return new MemoryCollection(this.db, this.parentPath);
  }
  collection(name: string) {
    return new MemoryCollection(this.db, `${this.path}/${name}`);
  }
  async get() {
    return snapshot(this, this.db.store.get(this.path));
  }
  async create(data: Data) {
    const b = this.db.batch();
    b.create(this, data);
    await b.commit();
  }
  async set(data: Data, options?: { merge?: boolean }) {
    const b = this.db.batch();
    b.set(this, data, options);
    await b.commit();
  }
  async update(data: Data) {
    const b = this.db.batch();
    b.update(this, data);
    await b.commit();
  }
  async delete() {
    const b = this.db.batch();
    b.delete(this);
    await b.commit();
  }
  isEqual(other: MemoryDoc) {
    return other.path === this.path;
  }
}

type Filter = { field: string; op: string; value: unknown };
type Order = { field: string; dir: "asc" | "desc" };

export class MemoryQuery {
  constructor(
    public db: MemoryFirestore,
    public path: string,
    protected filters: Filter[] = [],
    protected orders: Order[] = [],
    protected max?: number,
    protected after?: unknown[],
  ) {}
  where(field: string | FieldPath, op: string, value: unknown) {
    return new MemoryQuery(this.db, this.path, [...this.filters, { field: String(field), op, value }], this.orders, this.max, this.after);
  }
  orderBy(field: string | FieldPath, dir: "asc" | "desc" = "asc") {
    return new MemoryQuery(this.db, this.path, this.filters, [...this.orders, { field: String(field), dir }], this.max, this.after);
  }
  limit(n: number) {
    return new MemoryQuery(this.db, this.path, this.filters, this.orders, n, this.after);
  }
  startAfter(...values: unknown[]) {
    const v = values.length === 1 && values[0] instanceof MemorySnapshot
      ? this.effectiveOrders().map((o) => (o.field === "__name__" ? (values[0] as MemorySnapshot).id : (values[0] as MemorySnapshot).get(o.field)))
      : values;
    return new MemoryQuery(this.db, this.path, this.filters, this.orders, this.max, v);
  }
  private effectiveOrders(): Order[] {
    const orders = [...this.orders];
    for (const f of this.filters)
      if (["<", "<=", ">", ">=", "!="].includes(f.op) && !orders.some((o) => o.field === f.field)) orders.unshift({ field: f.field, dir: "asc" });
    if (!orders.some((o) => o.field === "__name__")) orders.push({ field: "__name__", dir: orders.at(-1)?.dir ?? "asc" });
    return orders;
  }
  run() {
    const prefix = `${this.path}/`;
    const orders = this.effectiveOrders();
    let rows = [...this.db.store.entries()]
      .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
      .map(([p, s]) => ({ id: p.slice(prefix.length), path: p, stored: s }));
    const value = (row: { id: string; stored: Stored }, field: string) => (field === "__name__" ? row.id : getField(row.stored.data, field));
    rows = rows.filter((row) =>
      this.filters.every((f) => {
        const v = value(row, f.field);
        if (v === undefined) return false;
        switch (f.op) {
          case "==": return equal(v, f.value);
          case "!=": return !equal(v, f.value);
          case "<": return compare(v, f.value) < 0;
          case "<=": return compare(v, f.value) <= 0;
          case ">": return compare(v, f.value) > 0;
          case ">=": return compare(v, f.value) >= 0;
          case "in": return (f.value as unknown[]).some((x) => equal(v, x));
          case "array-contains": return Array.isArray(v) && v.some((x) => equal(x, f.value));
          default: throw new Error(`Unsupported operator ${f.op}`);
        }
      }),
    );
    rows = rows.filter((row) => orders.every((o) => value(row, o.field) !== undefined));
    rows.sort((a, b) => {
      for (const o of orders) {
        const c = compare(value(a, o.field), value(b, o.field));
        if (c) return o.dir === "asc" ? c : -c;
      }
      return 0;
    });
    if (this.after) {
      const cursor = this.after;
      rows = rows.filter((row) => {
        for (let i = 0; i < cursor.length; i++) {
          const c = compare(value(row, orders[i].field), cursor[i]);
          if (c) return orders[i].dir === "asc" ? c > 0 : c < 0;
        }
        return false;
      });
    }
    if (this.max !== undefined) rows = rows.slice(0, this.max);
    return rows.map((row) => {
      const i = row.path.lastIndexOf("/");
      return snapshot(new MemoryDoc(this.db, row.path.slice(0, i), row.path.slice(i + 1)), row.stored);
    });
  }
  async get() {
    return querySnapshot(this.run());
  }
}

export class MemoryCollection extends MemoryQuery {
  constructor(db: MemoryFirestore, path: string) {
    super(db, path);
  }
  get id() {
    return this.path.slice(this.path.lastIndexOf("/") + 1);
  }
  doc(id?: string) {
    return new MemoryDoc(this.db, this.path, id ?? this.db.newId());
  }
  async add(data: Data) {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
}

export class MemorySnapshot {
  constructor(public ref: MemoryDoc, private stored: Stored | undefined) {}
  get id() {
    return this.ref.id;
  }
  get exists() {
    return Boolean(this.stored);
  }
  data() {
    return this.stored ? clone(this.stored.data) : undefined;
  }
  get(field: string) {
    return this.stored ? clone(getField(this.stored.data, field)) : undefined;
  }
  get version() {
    return this.stored?.version ?? 0;
  }
}
const snapshot = (ref: MemoryDoc, stored: Stored | undefined) => new MemorySnapshot(ref, stored ? { data: clone(stored.data), version: stored.version } : undefined);
const querySnapshot = (docs: MemorySnapshot[]) => ({
  docs,
  size: docs.length,
  empty: docs.length === 0,
  forEach: (fn: (d: MemorySnapshot) => void) => docs.forEach(fn),
});

type Write = { kind: "create" | "set" | "merge" | "update" | "delete"; path: string; data?: Data };

function apply(db: MemoryFirestore, writes: Write[]) {
  // Validate everything first so a failed batch/transaction changes nothing (atomicity).
  const staged = new Map<string, Stored | undefined>();
  const current = (p: string) => (staged.has(p) ? staged.get(p) : db.store.get(p));
  for (const w of writes) {
    const existing = current(w.path);
    if (w.kind === "create" && existing) throw new FirestoreError(6, `ALREADY_EXISTS: ${w.path}`);
    if (w.kind === "update" && !existing) throw new FirestoreError(5, `NOT_FOUND: ${w.path}`);
    const version = (existing?.version ?? 0) + 1;
    if (w.kind === "delete") staged.set(w.path, undefined);
    else if (w.kind === "create" || w.kind === "set") staged.set(w.path, { data: clone(w.data!), version });
    else {
      const data = clone(existing?.data ?? {});
      for (const [k, v] of Object.entries(w.data!)) if (v !== undefined) w.kind === "update" ? setField(data, k, clone(v)) : (data[k] = clone(v));
      staged.set(w.path, { data, version });
    }
  }
  for (const [p, s] of staged) (s ? db.store.set(p, s) : db.store.delete(p));
}

export class MemoryBatch {
  private writes: Write[] = [];
  constructor(private db: MemoryFirestore) {}
  create(ref: MemoryDoc, data: Data) {
    this.writes.push({ kind: "create", path: ref.path, data });
    return this;
  }
  set(ref: MemoryDoc, data: Data, options?: { merge?: boolean }) {
    this.writes.push({ kind: options?.merge ? "merge" : "set", path: ref.path, data });
    return this;
  }
  update(ref: MemoryDoc, data: Data) {
    this.writes.push({ kind: "update", path: ref.path, data });
    return this;
  }
  delete(ref: MemoryDoc) {
    this.writes.push({ kind: "delete", path: ref.path });
    return this;
  }
  async commit() {
    apply(this.db, this.writes);
  }
}

export class MemoryTransaction {
  private writes: Write[] = [];
  private reads = new Map<string, number>();
  constructor(private db: MemoryFirestore) {}
  async get(target: MemoryDoc | MemoryQuery) {
    if (this.writes.length) throw new Error("Firestore transactions require all reads to be executed before all writes.");
    // Yield like a network round trip so concurrent transactions genuinely interleave.
    await new Promise((r) => setImmediate(r));
    if (target instanceof MemoryDoc) {
      const snap = await target.get();
      this.reads.set(target.path, snap.version);
      return snap;
    }
    const docs = target.run();
    for (const d of docs) this.reads.set(d.ref.path, d.version);
    return querySnapshot(docs);
  }
  create(ref: MemoryDoc, data: Data) {
    this.writes.push({ kind: "create", path: ref.path, data });
    return this;
  }
  set(ref: MemoryDoc, data: Data, options?: { merge?: boolean }) {
    this.writes.push({ kind: options?.merge ? "merge" : "set", path: ref.path, data });
    return this;
  }
  update(ref: MemoryDoc, data: Data) {
    this.writes.push({ kind: "update", path: ref.path, data });
    return this;
  }
  delete(ref: MemoryDoc) {
    this.writes.push({ kind: "delete", path: ref.path });
    return this;
  }
  /** Returns false when a document read by this transaction changed meanwhile (caller retries). */
  commit() {
    for (const [path, version] of this.reads) if ((this.db.store.get(path)?.version ?? 0) !== version) return false;
    apply(this.db, this.writes);
    return true;
  }
}
