import { useEffect, useState, type FormEvent } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, startAfter, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { BellOff, BellRing, Check, LoaderCircle, Pencil, Undo2 } from "lucide-react";
import { db } from "../lib/firebase";
import { api } from "../lib/api";
import { money } from "../lib/money";
import type { Entry } from "../lib/useWorkspace";
import { Modal } from "./Modal";

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
type Customer = { name: string; displayLabel: string; phone?: string | null; aliases?: string[]; balancePaise: number };

export function CustomerDetail({ shopId, customerId, close, onChanged, onReverse, onEdit }: {
  shopId: string; customerId: string; close(): void; onChanged(): void; onReverse(e: Entry): void; onEdit(e: Entry): void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [consent, setConsent] = useState("unknown");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reversed, setReversed] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState("");
  const [revision, setRevision] = useState(0);

  async function loadPage(after: QueryDocumentSnapshot | null, size: number) {
    const base = collection(db, "shops", shopId, "ledgerEntries");
    const q = after
      ? query(base, where("customerId", "==", customerId), orderBy("createdAt", "desc"), startAfter(after), limit(size + 1))
      : query(base, where("customerId", "==", customerId), orderBy("createdAt", "desc"), limit(size + 1));
    const snap = await getDocs(q);
    const page = snap.docs.slice(0, size);
    const rows = page.map((d) => ({ ...d.data(), id: d.id }) as Entry);
    const flags = await Promise.all(rows.map((r) => (r.type === "reversal" ? Promise.resolve(false) : getDoc(doc(db, "shops", shopId, "reversals", r.id)).then((s) => s.exists()))));
    return { rows, flags, last: page[page.length - 1] ?? null, more: snap.size > size };
  }

  useEffect(() => {
    let active = true;
    setLoadError("");
    (async () => {
      try {
        const [c, pref, page] = await Promise.all([
          getDoc(doc(db, "shops", shopId, "customers", customerId)),
          getDoc(doc(db, "shops", shopId, "reminderPreferences", customerId)),
          loadPage(null, 5),
        ]);
        if (!active) return;
        if (!c.exists()) throw new Error("This customer no longer exists in your shop.");
        setCustomer(c.data() as Customer);
        setConsent((pref.get("status") as string) ?? "unknown");
        setEntries(page.rows);
        setReversed(new Set(page.rows.filter((_, i) => page.flags[i]).map((r) => r.id)));
        setCursor(page.last);
        setHasMore(page.more);
      } catch (e) {
        if (active) setLoadError(e instanceof Error ? e.message : "Could not load this customer.");
      }
    })();
    return () => { active = false; };
  }, [shopId, customerId, revision]);

  async function loadMore() {
    setBusy(true);
    try {
      const page = await loadPage(cursor, 25);
      setEntries((prev) => [...prev, ...page.rows]);
      setReversed((prev) => new Set([...prev, ...page.rows.filter((_, i) => page.flags[i]).map((r) => r.id)]));
      setCursor(page.last);
      setHasMore(page.more);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load more entries.");
    } finally { setBusy(false); }
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const phone = String(data.get("phone")).trim();
    const aliases = String(data.get("aliases")).split(",").map((a) => a.trim()).filter(Boolean);
    setBusy(true); setError("");
    try {
      await api(`/api/customers/${customerId}`, { name: String(data.get("name")).trim(), displayLabel: String(data.get("label")).trim(), phone: phone || null, aliases }, undefined, "PATCH");
      setEditing(false); setSaved("Customer details saved."); setRevision((r) => r + 1); onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save."); }
    finally { setBusy(false); }
  }

  async function recordConsent(status: "opted_in" | "opted_out") {
    if (status === "opted_in" && !window.confirm("Confirm that this customer has told you they agree to receive balance reminders. Reminders stay disabled until policy approval.")) return;
    setBusy(true); setError("");
    try {
      await api(`/api/customers/${customerId}/reminder-consent`, { status }, undefined, "PUT");
      setConsent(status); setSaved(status === "opted_in" ? "Opt-in recorded with today's date." : "Opt-out recorded. No reminders will be sent.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not record consent."); }
    finally { setBusy(false); }
  }

  if (loadError) return <Modal title="Customer" close={close}><p className="form-error" role="alert">{loadError}</p></Modal>;
  if (!customer) return <Modal title="Opening customer…" close={close}><div className="loading-state"><LoaderCircle size={22} className="spin" /><span>Loading history…</span></div></Modal>;

  return (
    <Modal title={customer.name} eyebrow={customer.displayLabel ? customer.displayLabel.toUpperCase() : "CUSTOMER"} close={close} wide>
      <div className="detail-summary">
        <div><small>Outstanding</small><strong className={customer.balancePaise < 0 ? "advance" : ""}>{money(customer.balancePaise)}</strong>{customer.balancePaise < 0 && <span className="subtle">Advance held</span>}</div>
        <div><small>Phone</small><strong>{customer.phone || "Not added"}</strong></div>
        <div><small>Reminder consent</small><strong>{consent === "opted_in" ? "Opted in" : consent === "opted_out" ? "Opted out" : "Unknown"}</strong></div>
      </div>
      {saved && <p className="form-success" role="status"><Check size={14} />{saved}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {editing ? (
        <form className="form" onSubmit={save}>
          <div className="form-columns">
            <label>Name<input name="name" defaultValue={customer.name} required maxLength={100} /></label>
            <label>Landmark / label<input name="label" defaultValue={customer.displayLabel} maxLength={150} /></label>
          </div>
          <div className="form-columns">
            <label>Phone (E.164)<input name="phone" type="tel" defaultValue={customer.phone ?? ""} placeholder="+919876543210" pattern="\+[1-9][0-9]{7,14}" /></label>
            <label>Aliases <span className="subtle">(comma separated)</span><input name="aliases" defaultValue={(customer.aliases ?? []).join(", ")} placeholder="Pappu, रमेश" /></label>
          </div>
          <p className="form-note">Aliases help the voice agent recognise how you say this name. Balance can never be edited here.</p>
          <div className="button-row">
            <button type="button" className="button secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            <button className="button primary" disabled={busy}>{busy && <LoaderCircle size={14} className="spin" />}Save details</button>
          </div>
        </form>
      ) : (
        <div className="button-row detail-actions">
          <button className="button secondary small" onClick={() => { setSaved(""); setEditing(true); }}><Pencil size={13} />Edit details</button>
          {consent !== "opted_in" && <button className="button secondary small" disabled={busy || !customer.phone} title={customer.phone ? "" : "Add a phone number first"} onClick={() => recordConsent("opted_in")}><BellRing size={13} />Record opt-in</button>}
          {consent !== "opted_out" && <button className="button secondary small" disabled={busy} onClick={() => recordConsent("opted_out")}><BellOff size={13} />Record opt-out</button>}
        </div>
      )}
      {(customer.aliases ?? []).length > 0 && !editing && <p className="form-note">Also known as: {(customer.aliases ?? []).join(", ")}</p>}

      <h3 className="detail-heading">{entries.length <= 5 && !hasMore ? "History" : `History · ${entries.length} loaded`}</h3>
      {entries.length === 0 ? <p className="subtle">No entries yet.</p> : (
        <ul className="history-list">
          {entries.map((e) => (
            <li key={e.id} className={reversed.has(e.id) ? "is-reversed" : ""}>
              <div>
                <strong>{e.type === "credit" ? "Credit" : e.type === "payment" ? "Payment" : "Reversal"}{reversed.has(e.id) ? " · reversed" : ""}</strong>
                <small>{e.createdAt ? dateFormat.format(e.createdAt.toDate()) : "—"} · {e.source === "whatsapp" ? "WhatsApp" : "Dashboard"}{e.reason ? ` · ${e.reason}` : ""}{e.notes ? ` · ${e.notes}` : ""}</small>
              </div>
              <span className={`amount-cell ${reversed.has(e.id) ? "reversed-text" : ""}`}>{e.signedAmountPaise > 0 ? "+" : "−"}{money(Math.abs(e.signedAmountPaise))}</span>
              {e.type !== "reversal" && !reversed.has(e.id) && (
                <span className="row-actions">
                  <button className="text-button" onClick={() => onEdit(e)}><Pencil size={12} />Edit</button>
                  <button className="text-button reverse-button" onClick={() => onReverse(e)}><Undo2 size={12} />Reverse</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasMore && <button className="button secondary small full" onClick={loadMore} disabled={busy}>{busy ? <LoaderCircle size={14} className="spin" /> : null}Load full history</button>}
    </Modal>
  );
}
