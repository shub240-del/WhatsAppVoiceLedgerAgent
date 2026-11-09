import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { signOut } from "firebase/auth";
import {
  AudioLines,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  Home,
  LoaderCircle,
  LogOut,
  Mic,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Undo2,
  UsersRound,
  X,
} from "lucide-react";
import "./khata.css";
import { auth, projectId } from "./lib/firebase";
import { AuthDialog } from "./components/AuthDialog";
import { hasPending } from "./lib/pending";
import { api } from "./lib/api";
import { money, rupeesToPaise } from "./lib/money";
import { toCsv } from "./lib/csv";
import { useWorkspace, type Customer, type Entry } from "./lib/useWorkspace";
import { Modal } from "./components/Modal";
import { CustomerDetail } from "./components/CustomerDetail";
import { EditEntry } from "./components/EditEntry";
import { ActivityPanel, IntegrationsGrid, RemindersPanel, type Integration } from "./components/ShopPanels";
import { CreateShop } from "./components/CreateShop";
import { EntryForm } from "./components/EntryForm";
import { Assistant, requestListen } from "./components/Assistant";
import { ParserEval } from "./components/ParserEval";
import { displayPhone, toE164 } from "./lib/phone";
import { balanceWords } from "./lib/reminder";
import { authErrorMessage } from "./lib/auth-errors";

type Tab = "home" | "customers" | "entries" | "settings" | "advanced";
type Action = "add_credit" | "add_payment";
type Dialog = "customer" | "entry" | "help" | null;
type AuthAsk = { mode: "login" | "signup"; reason?: string; then?: Dialog };

const NAV = [
  { id: "home" as const, label: "Home", icon: Home },
  { id: "customers" as const, label: "Customers", icon: UsersRound },
  { id: "entries" as const, label: "Entries", icon: BookOpen },
  { id: "settings" as const, label: "Settings", icon: Settings2 },
];
const TITLES: Record<Tab, string> = {
  home: "Home",
  customers: "Customers",
  entries: "Entries",
  settings: "Settings",
  advanced: "Setup & status",
};
// Old links (#/workspace/overview, /ledger, /connections…) keep working.
const LEGACY: Record<string, Tab> = {
  overview: "home",
  ledger: "entries",
  connections: "advanced",
  activity: "advanced",
  reminders: "advanced",
};
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
function tabFromHash(): Tab {
  const slug = window.location.hash.split("/")[2]?.split("?")[0]?.toLowerCase() ?? "";
  if (slug in TITLES) return slug as Tab;
  return LEGACY[slug] ?? "home";
}
const initial = (name: string) => (name.trim()[0] || "?").toUpperCase();
const when = (e: Entry) => (e.createdAt ? dateFormat.format(e.createdAt.toDate()) : "—");

/** `useData` is swappable only so tests can render the real screens with fake shop data. */
export default function Dashboard({ useData = useWorkspace }: { useData?: typeof useWorkspace } = {}) {
  const workspace = useData();
  const { user, shop, customers, entries, totals, reversals, loading } = workspace;
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [dialog, setDialog] = useState<Dialog>(null);
  // Visitors use the app first; an account is asked for only when they try to save something.
  const [authAsk, setAuthAsk] = useState<AuthAsk | null>(null);
  const [afterAuth, setAfterAuth] = useState<Dialog>(null);
  const [entryAction, setEntryAction] = useState<Action>("add_credit");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  // Opened "Udhaar diya / Paisa mila" from a customer's page? Go back there afterwards.
  const [entryFrom, setEntryFrom] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [reversing, setReversing] = useState<Entry | null>(null);
  const [reason, setReason] = useState("");
  const [detailCustomer, setDetailCustomer] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [newName, setNewName] = useState("");
  const [connection, setConnection] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [integrations, setIntegrations] = useState<{ uid: string; list: Integration[] } | null>(null);
  const [gnaniCheck, setGnaniCheck] = useState<"checking" | { ok: boolean; detail: string } | null>(null);
  const operation = useRef<{ payload: string; key: string } | null>(null);
  const duplicateOf = newName.trim()
    ? customers.filter((c) => c.name.trim().toLowerCase() === newName.trim().toLowerCase())
    : [];

  useEffect(() => {
    if (!user) return;
    setDialog(null);
    setBusy(false);
    setError("");
  }, [user?.uid]);
  useEffect(() => {
    const sync = () => {
      setTab(tabFromHash());
      setSearch("");
      setFilter("all");
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    document.title = `${TITLES[tab]} · Udhaar`;
  }, [tab]);
  useEffect(() => {
    if (!afterAuth || !user || !shop || workspace.needsShop) return;
    setDialog(afterAuth);
    setAfterAuth(null);
  }, [afterAuth, user, shop, workspace.needsShop]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  function navigate(next: Tab) {
    setTab(next);
    setSearch("");
    setFilter("all");
    window.location.hash = `/workspace/${next}`;
    window.scrollTo(0, 0);
  }
  function open(next: Dialog) {
    setError("");
    setNewName("");
    operation.current = null;
    if (user || next === "help") setDialog(next);
    else
      setAuthAsk({
        mode: "signup",
        reason: next === "customer" ? "Create a free account to save your customers." : "Create a free account to save this entry.",
        then: next,
      });
  }
  function openEntry(action: Action, customerId = "", fromDetail = false) {
    setEntryAction(action);
    setSelectedCustomer(customerId);
    setEntryFrom(fromDetail ? customerId : null);
    setDetailCustomer(null);
    open("entry");
  }
  function closeEntry() {
    setDialog(null);
    if (entryFrom) setDetailCustomer(entryFrom);
    setEntryFrom(null);
  }
  function speak() {
    // Voice-first: one tap anywhere starts listening on the Home assistant.
    if (tab !== "home") navigate("home");
    requestListen();
  }
  function keyFor(payload: unknown) {
    const serialized = JSON.stringify(payload);
    if (!operation.current || operation.current.payload !== serialized)
      operation.current = { payload: serialized, key: crypto.randomUUID() };
    return operation.current.key;
  }
  const customerName = (id: string) =>
    customers.find((c) => c.id === id)?.name || `Customer ${id.slice(0, 8)}`;

  async function saveLanguage(language: string) {
    setBusy(true);
    try {
      await api("/api/shop", { language }, undefined, "PATCH");
      workspace.refresh();
      setToast("Language saved. The assistant listens for it from your next message.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not save the language.");
    } finally {
      setBusy(false);
    }
  }
  async function submitCustomer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    let phone: string | null;
    try {
      phone = toE164(String(data.get("phone") ?? ""));
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Check the phone number.");
      return;
    }
    const payload = {
      name: String(data.get("name")).trim(),
      displayLabel: String(data.get("label")).trim(),
      ...(phone ? { phone } : {}),
    };
    if (!payload.name) {
      setBusy(false);
      setError("Please enter the customer’s name.");
      return;
    }
    const sameName = customers.filter((c) => c.name.trim().toLowerCase() === payload.name.toLowerCase());
    if (
      sameName.length &&
      (!payload.displayLabel ||
        sameName.some((c) => c.displayLabel.trim().toLowerCase() === payload.displayLabel.toLowerCase()))
    ) {
      setBusy(false);
      setError(`You already have a ${payload.name}. Add a different landmark so you can tell them apart.`);
      return;
    }
    try {
      await api("/api/customers", payload, keyFor(payload));
      operation.current = null;
      setDialog(null);
      workspace.refresh();
      setToast(`${payload.name} added.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Customer could not be created.");
    } finally {
      setBusy(false);
    }
  }
  async function submitEntry(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const action = String(data.get("action"));
      const payload = {
        action,
        customerId: String(data.get("customer")),
        amountPaise: rupeesToPaise(String(data.get("amount"))),
        notes: String(data.get("notes")),
        confirmLargeAmount: data.get("large") === "on",
        ...(action === "add_payment" ? { confirmAdvance: data.get("advance") === "on" } : {}),
      };
      const result = await api<{ balancePaise: number }>("/api/ledger/actions", payload, keyFor(payload));
      operation.current = null;
      closeEntry();
      workspace.refresh();
      setToast(`Saved. ${balanceWords(customerName(payload.customerId), result.balancePaise)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nothing was saved. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function submitReversal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reversing) return;
    setBusy(true);
    setError("");
    const why = String(new FormData(e.currentTarget).get("reason")).trim();
    if (why.length < 3) {
      setBusy(false);
      setError("Tap a reason, or type one.");
      return;
    }
    const payload = { action: "undo_entry", entryId: reversing.id, reason: why };
    try {
      const result = await api<{ balancePaise: number }>("/api/ledger/actions", payload, keyFor(payload));
      operation.current = null;
      setReversing(null);
      workspace.refresh();
      setToast(`Entry cancelled. ${balanceWords(customerName(reversing.customerId), result.balancePaise)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reversal failed.");
    } finally {
      setBusy(false);
    }
  }
  function startReversal(e: Entry) {
    setDetailCustomer(null);
    setError("");
    setReason("");
    operation.current = null;
    setReversing(e);
  }
  async function logout() {
    try {
      await signOut(auth);
      setDetailCustomer(null);
      setEditingEntry(null);
      setReversing(null);
      setToast("Signed out.");
    } catch (e) {
      setToast(authErrorMessage(e));
    }
  }
  async function testGnani() {
    if (!user) return setAuthAsk({ mode: "login" });
    setGnaniCheck("checking");
    try {
      setGnaniCheck(await api<{ ok: boolean; detail: string }>("/api/integrations/gnani/verify", {}));
    } catch (e) {
      setGnaniCheck({ ok: false, detail: e instanceof Error ? e.message : "The check could not run." });
    }
  }
  async function checkConnection() {
    if (!user) return setAuthAsk({ mode: "login" });
    setConnection("checking");
    setConnectionMessage("");
    try {
      const result = await api<{ integrations: Integration[] }>("/api/connection");
      setIntegrations({ uid: user.uid, list: result.integrations });
      setConnection("ok");
      setConnectionMessage("Signed-in API and shop access verified.");
    } catch (e) {
      setIntegrations(null);
      setConnection("error");
      setConnectionMessage(e instanceof Error ? e.message : "Connection check failed.");
    }
  }

  const filteredCustomers = customers
    .filter((c) => `${c.name} ${c.displayLabel} ${c.phone || ""}`.toLowerCase().includes(search.toLowerCase()))
    .filter((c) => filter !== "due" || c.balancePaise > 0)
    .sort((a, b) => (filter === "highest" ? b.balancePaise - a.balancePaise : a.name.localeCompare(b.name)));
  const filteredEntries = entries
    .filter((e) => filter === "all" || (filter === "reversed" ? reversals.has(e.id) : e.type === filter))
    .filter((e) =>
      `${customerName(e.customerId)} ${e.notes || ""} ${e.id}`.toLowerCase().includes(search.toLowerCase()),
    );
  function exportLedger() {
    const rows = [
      ["Date (IST)", "Customer", "Type", "Amount (₹)", "Status", "Note", "Entry ID"],
      ...filteredEntries.map((e) => [
        when(e),
        customerName(e.customerId),
        e.type === "credit" ? "Udhaar" : e.type === "payment" ? "Payment" : "Correction",
        (e.signedAmountPaise / 100).toFixed(2),
        reversals.has(e.id) ? "Cancelled" : "Active",
        e.notes || e.reason || "",
        e.id,
      ]),
    ];
    // BOM so Excel shows ₹ and Hindi names correctly; cells are formula-safe.
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "udhaar-entries.csv";
    link.click();
    URL.revokeObjectURL(url);
    setToast(`Downloaded ${filteredEntries.length} entries.`);
  }

  const ready = Boolean(user && shop && !workspace.needsShop);
  const guest = workspace.authReady && !user;
  const canAct = ready || guest;
  const askToSave = () =>
    setAuthAsk({ mode: "signup", reason: "Create a free account to save this. I’ll save it right after you sign in." });
  const due = customers.filter((c) => c.balancePaise > 0).length;

  return (
    <div className="k-app">
      <a
        href="#/workspace"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("workspace-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="k-side" aria-label="Sidebar">
        <a className="k-brand" href="./" aria-label="Udhaar home">
          <span className="k-logo">
            <AudioLines size={16} />
          </span>
          <span>
            <strong>{shop?.name || "Udhaar"}</strong>
            <small>Voice khata</small>
          </span>
        </a>
        <nav className="k-nav" aria-label="Main navigation">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={tab === item.id || (item.id === "settings" && tab === "advanced") ? "active" : ""}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </nav>
        <button className="k-speak" onClick={speak}>
          <Mic size={16} />
          Speak an entry
        </button>
        <div className="k-side-foot">
          {user ? <span title={user.email ?? ""}>{user.email}</span> : <button onClick={() => setAuthAsk({ mode: "login" })}>Log in</button>}
        </div>
      </aside>

      <main className="k-main" id="workspace-content" tabIndex={-1}>
        <header className="k-head">
          <h1>{TITLES[tab]}</h1>
          {tab === "customers" && canAct && (
            <button className="k-btn k-btn-primary" onClick={() => open("customer")}>
              <Plus size={15} />
              Add customer
            </button>
          )}
          {tab === "entries" && ready && entries.length > 0 && (
            <button className="k-btn" disabled={!filteredEntries.length} onClick={exportLedger}>
              <Download size={15} />
              Download CSV
            </button>
          )}
        </header>

        {workspace.error && (
          <div className="k-alert" role="alert">
            {workspace.error}
            <button className="k-link" onClick={workspace.refresh}>Retry</button>
          </div>
        )}

        {guest && (
          <div className="k-guest" role="note">
            <span>
              <strong>You’re trying Udhaar.</strong> Nothing is saved until you sign up — it’s free.
            </span>
            <span className="k-guest-actions">
              <button className="k-link" onClick={() => setAuthAsk({ mode: "login" })}>Log in</button>
              <button className="k-btn k-btn-primary" onClick={() => setAuthAsk({ mode: "signup" })}>Sign up free</button>
            </span>
          </div>
        )}

        {!workspace.authReady || (user && !shop && !workspace.needsShop && !workspace.error) ? (
          <Loading />
        ) : workspace.needsShop ? (
          <section className="k-card">
            <CreateShop
              onCreated={() => {
                workspace.refresh();
                setToast("Your khata is ready. Add your first customer.");
              }}
            />
          </section>
        ) : (
          <>
            {tab === "home" && (
              <div className="k-stack">
                <section className="k-balance" aria-label="Total balance">
                  <div>
                    <small>You’ll get</small>
                    <strong className={totals.balance > 0 ? "k-due" : totals.balance < 0 ? "k-adv" : ""}>
                      {money(Math.max(totals.balance, 0))}
                    </strong>
                    <span className="k-muted">
                      {totals.customers ? `${due} of ${totals.customers} customers owe you` : "No customers yet"}
                    </span>
                  </div>
                  <div className="k-give-get">
                    <button className="k-btn k-btn-give" onClick={() => openEntry("add_credit")}>
                      Udhaar diya <small>You gave</small>
                    </button>
                    <button className="k-btn k-btn-got" onClick={() => openEntry("add_payment")}>
                      Paisa mila <small>You got</small>
                    </button>
                  </div>
                </section>

                <div id="assistant" className="k-assistant">
                  <Assistant onChanged={workspace.refresh} disabled={!canAct} onNeedAuth={guest ? askToSave : undefined} />
                </div>

                {totals.customers === 0 && !loading ? (
                  <section className="k-card k-row-card">
                    <div>
                      <h2>Add your first customer</h2>
                      <p className="k-muted">Or just say “Ramesh ko 340 ka udhaar” — I’ll offer to add Ramesh for you.</p>
                    </div>
                    <button className="k-btn k-btn-primary" onClick={() => open("customer")}>
                      <Plus size={15} />
                      Add customer
                    </button>
                  </section>
                ) : (
                  <section className="k-card k-flush">
                    <div className="k-card-head">
                      <h2>Recent</h2>
                      <button className="k-link" onClick={() => navigate("entries")}>
                        See all <ChevronRight size={14} />
                      </button>
                    </div>
                    {loading ? <Loading /> : <EntryList entries={entries.slice(0, 5)} reversals={reversals} name={customerName} />}
                  </section>
                )}
              </div>
            )}

            {tab === "customers" && (
              <section className="k-card k-flush">
                <Toolbar search={search} setSearch={setSearch} placeholder="Search customers">
                  <select aria-label="Sort customers" value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">A–Z</option>
                    <option value="highest">Highest due</option>
                    <option value="due">Only who owe</option>
                  </select>
                </Toolbar>
                {loading ? (
                  <Loading />
                ) : filteredCustomers.length ? (
                  <ul className="k-list">
                    {filteredCustomers.map((c) => (
                      <CustomerRow key={c.id} customer={c} onOpen={() => setDetailCustomer(c.id)} />
                    ))}
                  </ul>
                ) : (
                  <Empty
                    title={search ? "No matching customers" : "No customers yet"}
                    action={search ? undefined : "Add customer"}
                    onClick={() => open("customer")}
                  />
                )}
                {workspace.hasMoreCustomers && (
                  <button className="k-more" onClick={workspace.loadCustomers}>Show more</button>
                )}
              </section>
            )}

            {tab === "entries" && (
              <section className="k-card k-flush">
                <Toolbar search={search} setSearch={setSearch} placeholder="Search name or note">
                  <select aria-label="Filter entries" value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">All</option>
                    <option value="credit">Udhaar given</option>
                    <option value="payment">Payments got</option>
                    <option value="reversal">Corrections</option>
                    <option value="reversed">Cancelled</option>
                  </select>
                </Toolbar>
                {loading ? (
                  <Loading />
                ) : filteredEntries.length ? (
                  <EntryList
                    entries={filteredEntries}
                    reversals={reversals}
                    name={customerName}
                    onEdit={setEditingEntry}
                    onReverse={startReversal}
                  />
                ) : (
                  <Empty
                    title={search ? "No matching entries" : "No entries yet"}
                    action={search ? undefined : "Speak an entry"}
                    onClick={speak}
                  />
                )}
                {workspace.hasMoreEntries && (
                  <button className="k-more" onClick={workspace.loadEntries}>Show more</button>
                )}
              </section>
            )}

            {tab === "settings" && (
              <div className="k-stack">
                {user && <section className="k-card">
                  <h2>Your shop</h2>
                  <dl className="k-dl">
                    <div>
                      <dt>Shop</dt>
                      <dd>{shop?.name}</dd>
                    </div>
                    <div>
                      <dt>Signed in as</dt>
                      <dd>{user.email}</dd>
                    </div>
                  </dl>
                  <label className="k-field">
                    Language you speak in the shop
                    <select
                      value={shop?.language || "hinglish"}
                      disabled={busy}
                      onChange={(e) => void saveLanguage(e.currentTarget.value)}
                    >
                      <option value="hinglish">Hindi / Hinglish</option>
                      <option value="mr">मराठी Marathi (+ Hindi)</option>
                      <option value="gu">ગુજરાતી Gujarati (+ Hindi)</option>
                    </select>
                    <small className="k-muted">English words like “Surf” or “Maggi” always work.</small>
                  </label>
                </section>}
                <section className="k-card k-flush">
                  <button className="k-menu-row" onClick={() => open("help")}>
                    <ShieldCheck size={16} />
                    How it works & safety
                    <ChevronRight size={15} />
                  </button>
                  {user ? (
                    <>
                  <button className="k-menu-row" onClick={() => navigate("advanced")}>
                    <Settings2 size={16} />
                    Setup & status
                    <ChevronRight size={15} />
                  </button>
                  <button className="k-menu-row" onClick={() => void logout()}>
                    <LogOut size={16} />
                    Sign out
                  </button>
                    </>
                  ) : (
                    <button className="k-menu-row" onClick={() => setAuthAsk({ mode: "login" })}>
                      <LogOut size={16} />
                      Log in or create account
                      <ChevronRight size={15} />
                    </button>
                  )}
                </section>
              </div>
            )}

            {tab === "advanced" && shop && user && (
              <div className="k-stack k-advanced">
                <button className="k-link" onClick={() => navigate("settings")}>← Settings</button>
                <section className="k-card">
                  <h2>Connection</h2>
                  <p className="k-muted">Firebase project <code>{projectId}</code>. Admin keys stay on the server.</p>
                  <button className="k-btn" onClick={() => void checkConnection()} disabled={connection === "checking"}>
                    {connection === "checking" && <LoaderCircle size={14} className="spin" />}
                    Verify connection
                  </button>
                  {connectionMessage && (
                    <p role="status" className={connection === "error" ? "form-error" : "form-success"}>
                      {connectionMessage}
                    </p>
                  )}
                  <IntegrationsGrid integrations={integrations && integrations.uid === user?.uid ? integrations.list : null} />
                </section>
                <section className="k-card">
                  <h2>Gnani voice-to-text</h2>
                  <p className="k-muted">Sends one second of silence to check the server key.</p>
                  <button className="k-btn" onClick={() => void testGnani()} disabled={gnaniCheck === "checking"}>
                    {gnaniCheck === "checking" ? <LoaderCircle size={14} className="spin" /> : <AudioLines size={14} />}
                    Test Gnani key
                  </button>
                  {gnaniCheck && gnaniCheck !== "checking" && (
                    <p role="status" className={gnaniCheck.ok ? "form-success" : "form-error"}>{gnaniCheck.detail}</p>
                  )}
                </section>
                <ParserEval />
                <ActivityPanel shopId={shop.id} customerName={customerName} />
                <RemindersPanel shopId={shop.id} customerName={customerName} />
              </div>
            )}
          </>
        )}
      </main>

      <nav className="k-tabbar" aria-label="Main navigation (mobile)">
        {NAV.slice(0, 2).map((item) => (
          <TabButton key={item.id} item={item} active={tab === item.id} onClick={() => navigate(item.id)} />
        ))}
        <button className="k-fab" aria-label="Speak an entry" onClick={speak}>
          <Mic size={22} />
        </button>
        {NAV.slice(2).map((item) => (
          <TabButton
            key={item.id}
            item={item}
            active={tab === item.id || (item.id === "settings" && tab === "advanced")}
            onClick={() => navigate(item.id)}
          />
        ))}
      </nav>

      {authAsk && (
        <AuthDialog
          mode={authAsk.mode}
          reason={authAsk.reason}
          onModeChange={(mode) => setAuthAsk({ ...authAsk, mode })}
          close={() => setAuthAsk(null)}
          onSignedIn={() => {
            if (authAsk.then) setAfterAuth(authAsk.then);
            setAuthAsk(null);
            setToast(hasPending() ? "Signed in. Saving what you said…" : "Signed in. You’ll stay signed in on this device.");
          }}
        />
      )}
      {dialog === "customer" && (
        <Modal title="Add a customer" close={() => !busy && setDialog(null)}>
          <form className="form" onSubmit={submitCustomer}>
            <label>
              Name
              <input
                name="name"
                required
                maxLength={100}
                placeholder="e.g. Ramesh"
                autoFocus
                onChange={(e) => setNewName(e.currentTarget.value)}
              />
            </label>
            {duplicateOf.length > 0 && (
              <p className="form-warning" role="status">
                You already have {duplicateOf.map((c) => `${c.name}${c.displayLabel ? ` (${c.displayLabel})` : ""}`).join(", ")}.
                Add a landmark so you can tell them apart.
              </p>
            )}
            <label>
              Landmark {duplicateOf.length ? "" : <span className="subtle">(optional)</span>}
              <input name="label" maxLength={150} placeholder="e.g. Near the temple" required={duplicateOf.length > 0} />
            </label>
            <label>
              Phone <span className="subtle">(optional)</span>
              <input name="phone" type="tel" inputMode="tel" placeholder="98765 43210" />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button primary full" disabled={busy || !shop}>
              {busy && <LoaderCircle size={16} className="spin" />}Add customer
            </button>
          </form>
        </Modal>
      )}
      {dialog === "entry" && (
        <Modal
          title={entryAction === "add_credit" ? "Udhaar diya" : "Paisa mila"}
          eyebrow={entryAction === "add_credit" ? "YOU GAVE" : "YOU GOT"}
          close={() => !busy && closeEntry()}
        >
          {!customers.length ? (
            <Empty title="Add a customer first" action="Add customer" onClick={() => open("customer")} />
          ) : (
            <EntryForm
              customers={customers}
              initialCustomer={selectedCustomer}
              initialAction={entryAction}
              busy={busy}
              error={error}
              disabled={!shop}
              onSubmit={submitEntry}
            />
          )}
        </Modal>
      )}
      {reversing && (
        <Modal title="Cancel this entry?" eyebrow="FIX A MISTAKE" close={() => !busy && setReversing(null)}>
          <p className="modal-description">
            Cancel the {money(Math.abs(reversing.signedAmountPaise))}{" "}
            {reversing.type === "credit" ? "udhaar" : "payment"} for <strong>{customerName(reversing.customerId)}</strong>?
            The original stays in history, marked as cancelled.
          </p>
          <form className="form" onSubmit={submitReversal}>
            <div className="reason-chips" role="group" aria-label="Why?">
              {["Wrong amount", "Wrong customer", "Entered twice", "Customer returned items"].map((r) => (
                <button type="button" key={r} aria-pressed={reason === r} onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
            <label>
              Reason
              <input
                name="reason"
                required
                minLength={3}
                maxLength={500}
                placeholder="Tap a reason above, or type one"
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
              />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button danger full" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Undo2 size={16} />}Yes, cancel entry
            </button>
          </form>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title="How Udhaar works" close={() => setDialog(null)}>
          <div className="help-content">
            <h3>Speak like you talk</h3>
            <p>“Ramesh ko 340 ka udhaar likh do” · “Sunita ne 200 diye” · “Ramesh ka kitna baaki hai?”</p>
            <h3>It never guesses</h3>
            <p>If a name or amount is unclear, the assistant asks before saving anything.</p>
            <h3>Made a mistake?</h3>
            <p>Tap Undo on the reply, or open Entries and choose Fix or Cancel. History is always kept.</p>
          </div>
        </Modal>
      )}
      {detailCustomer && shop && (
        <CustomerDetail
          shopId={shop.id}
          shopName={shop.name}
          customerId={detailCustomer}
          close={() => setDetailCustomer(null)}
          onChanged={workspace.refresh}
          onReverse={startReversal}
          onEdit={(e) => {
            setDetailCustomer(null);
            setEditingEntry(e);
          }}
          onAdd={(action) => openEntry(action, detailCustomer, true)}
        />
      )}
      {editingEntry && (
        <EditEntry
          entry={editingEntry}
          customerName={customerName(editingEntry.customerId)}
          close={() => setEditingEntry(null)}
          done={(balance) => {
            setEditingEntry(null);
            workspace.refresh();
            setToast(`Fixed. ${balanceWords(customerName(editingEntry.customerId), balance)}`);
          }}
        />
      )}
      {toast && (
        <div className="k-toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function TabButton({
  item,
  active,
  onClick,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  onClick(): void;
}) {
  return (
    <button className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={onClick}>
      <item.icon size={19} />
      <span>{item.label}</span>
    </button>
  );
}

function Toolbar({
  search,
  setSearch,
  placeholder,
  children,
}: {
  search: string;
  setSearch(v: string): void;
  placeholder: string;
  children: ReactNode;
}) {
  return (
    <div className="k-toolbar">
      <label className="k-search">
        <Search size={15} />
        <input aria-label={placeholder} placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {children}
    </div>
  );
}

function CustomerRow({ customer: c, onOpen }: { customer: Customer; onOpen(): void }) {
  return (
    <li>
      <button className="k-row" onClick={onOpen}>
        <span className="k-avatar" aria-hidden="true">{initial(c.name)}</span>
        <span className="k-row-main">
          <strong>{c.name}</strong>
          <small>{[c.displayLabel, c.phone ? displayPhone(c.phone) : ""].filter(Boolean).join(" · ") || "No details"}</small>
        </span>
        <span className="k-row-amount">
          <strong className={c.balancePaise > 0 ? "k-due" : c.balancePaise < 0 ? "k-adv" : ""}>
            {money(Math.abs(c.balancePaise))}
          </strong>
          <small>{c.balancePaise > 0 ? "due" : c.balancePaise < 0 ? "advance" : "settled"}</small>
        </span>
      </button>
    </li>
  );
}

function EntryList({
  entries,
  reversals,
  name,
  onEdit,
  onReverse,
}: {
  entries: Entry[];
  reversals: Set<string>;
  name(id: string): string;
  onEdit?(e: Entry): void;
  onReverse?(e: Entry): void;
}) {
  if (!entries.length) return <Empty title="No entries yet" />;
  return (
    <ul className="k-list">
      {entries.map((e) => {
        const cancelled = reversals.has(e.id);
        const gave = e.signedAmountPaise > 0;
        const label = cancelled ? "Cancelled" : e.type === "reversal" ? "Correction" : gave ? "You gave" : "You got";
        return (
          <li key={e.id} className={`k-entry ${cancelled ? "is-cancelled" : ""}`}>
            <span className="k-avatar" aria-hidden="true">{initial(name(e.customerId))}</span>
            <span className="k-row-main">
              <strong>{name(e.customerId)}</strong>
              <small>
                {[when(e), e.notes || e.reason, e.source === "assistant" ? "by voice" : ""].filter(Boolean).join(" · ")}
              </small>
              {onEdit && onReverse && e.type !== "reversal" && !cancelled && (
                <span className="k-entry-actions">
                  <button className="k-link" onClick={() => onEdit(e)}>
                    <Pencil size={12} />
                    Fix amount
                  </button>
                  <button className="k-link" onClick={() => onReverse(e)}>
                    <Undo2 size={12} />
                    Cancel entry
                  </button>
                </span>
              )}
            </span>
            <span className="k-row-amount">
              <strong className={cancelled ? "k-struck" : gave ? "k-due" : "k-adv"}>
                {gave ? "+" : "−"}
                {money(Math.abs(e.signedAmountPaise))}
              </strong>
              <small>{label}</small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ title, action, onClick }: { title: string; action?: string; onClick?(): void }) {
  return (
    <div className="k-empty">
      <p>{title}</p>
      {action && onClick && (
        <button className="k-btn" onClick={onClick}>
          {action}
        </button>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="k-empty" role="status">
      <LoaderCircle size={18} className="spin" />
      <span className="k-muted">Loading…</span>
    </div>
  );
}
