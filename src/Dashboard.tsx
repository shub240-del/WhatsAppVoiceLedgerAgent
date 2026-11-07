import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  BellRing,
  History,
  Pencil,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircleUserRound,
  Clock3,
  Download,
  FileText,
  Flame,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  Mic,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Undo2,
  UsersRound,
  Wallet,
  X,
  ArrowLeft,
  ListChecks,
  Store,
} from "lucide-react";
import { auth, projectId } from "./lib/firebase";
import { api } from "./lib/api";
import { money, rupeesToPaise } from "./lib/money";
import { useWorkspace, type Entry } from "./lib/useWorkspace";
import { Modal } from "./components/Modal";
import { CustomerDetail } from "./components/CustomerDetail";
import { EditEntry } from "./components/EditEntry";
import {
  ActivityPanel,
  IntegrationsGrid,
  RemindersPanel,
  type Integration,
} from "./components/ShopPanels";
import { SetupGuide } from "./components/SetupGuide";
import { authErrorMessage } from "./lib/auth-errors";

type Tab =
  | "Overview"
  | "Customers"
  | "Ledger"
  | "Activity"
  | "Reminders"
  | "Connections"
  | "Settings";
type Dialog = "login" | "customer" | "entry" | "help" | "voice" | null;
const nav = [
  { name: "Overview" as const, icon: LayoutDashboard },
  { name: "Customers" as const, icon: UsersRound },
  { name: "Ledger" as const, icon: BookOpen },
  { name: "Activity" as const, icon: History },
  { name: "Reminders" as const, icon: BellRing },
];
const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
function tabFromHash(): Tab {
  const slug = window.location.hash.split("/")[2]?.split("?")[0]?.toLowerCase();
  return (
    ([...nav.map((item) => item.name), "Connections", "Settings"].find(
      (name) => name.toLowerCase() === slug,
    ) as Tab) || "Overview"
  );
}

export default function Dashboard() {
  const workspace = useWorkspace();
  const { user, shop, customers, entries, totals, reversals, loading } = workspace;
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [compactNav, setCompactNav] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const navigationRef = useRef<HTMLElement>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [reversing, setReversing] = useState<Entry | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [connection, setConnection] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [integrations, setIntegrations] = useState<{ uid: string; list: Integration[] } | null>(
    null,
  );
  const [detailCustomer, setDetailCustomer] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [setup, setSetup] = useState(window.location.hash.includes("setup=1"));
  const operation = useRef<{ payload: string; key: string } | null>(null);
  const now = new Date();
  useEffect(() => {
    const syncTab = () => {
      setTab(tabFromHash());
      setSearch("");
      setFilter("all");
      setMobileNav(false);
    };
    window.addEventListener("hashchange", syncTab);
    return () => window.removeEventListener("hashchange", syncTab);
  }, []);
  useEffect(() => {
    document.title = `${tab} · Udhaar`;
  }, [tab]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => {
      setCompactNav(query.matches);
      if (!query.matches) setMobileNav(false);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobileNav) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNav(false);
    };
    window.addEventListener("keydown", escape);
    navigationRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", escape);
    };
  }, [mobileNav]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(next: Tab) {
    setTab(next);
    setSearch("");
    setFilter("all");
    setMobileNav(false);
    window.location.hash = `/workspace/${next.toLowerCase()}`;
    window.scrollTo(0, 0);
  }
  function open(next: Dialog) {
    setError("");
    operation.current = null;
    setDialog(next);
  }
  function notify(message: string) {
    setToast(message);
  }
  function requireOwner(next: Dialog) {
    open(user ? next : "login");
  }
  function keyFor(payload: unknown) {
    const serialized = JSON.stringify(payload);
    if (!operation.current || operation.current.payload !== serialized)
      operation.current = { payload: serialized, key: crypto.randomUUID() };
    return operation.current.key;
  }
  async function submitLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      await signInWithEmailAndPassword(
        auth,
        String(data.get("email")),
        String(data.get("password")),
      );
      setDialog(null);
      notify("Signed in. Your shop is being verified.");
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword() {
    const email = (document.querySelector("#owner-email") as HTMLInputElement | null)?.value;
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendPasswordResetEmail(auth, email);
      notify("If this account exists, a password reset email will be sent.");
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function submitCustomer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    const payload = {
      name: String(data.get("name")).trim(),
      displayLabel: String(data.get("label")).trim(),
      ...(data.get("phone") ? { phone: String(data.get("phone")).trim() } : {}),
    };
    if (!payload.name) {
      setBusy(false);
      setError("Please enter a customer name, not just spaces.");
      return;
    }
    try {
      await api("/api/customers", payload, keyFor(payload));
      operation.current = null;
      setDialog(null);
      workspace.refresh();
      notify("Customer created. Reminders remain off.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Customer could not be created.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await signOut(auth);
      setDetailCustomer(null);
      setEditingEntry(null);
      setReversing(null);
      setSetup(false);
      notify("Signed out securely.");
    } catch (e) {
      notify(authErrorMessage(e));
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
      const result = await api<{ balancePaise: number }>(
        "/api/ledger/actions",
        payload,
        keyFor(payload),
      );
      operation.current = null;
      setDialog(null);
      workspace.refresh();
      notify(`Entry recorded. Updated balance: ${money(result.balancePaise)}.`);
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
    const reason = String(new FormData(e.currentTarget).get("reason")).trim();
    if (reason.length < 3) {
      setBusy(false);
      setError("Please give a reason with at least 3 characters.");
      return;
    }
    const payload = {
      action: "undo_entry",
      entryId: reversing.id,
      reason,
    };
    try {
      const result = await api<{ balancePaise: number }>(
        "/api/ledger/actions",
        payload,
        keyFor(payload),
      );
      operation.current = null;
      setReversing(null);
      workspace.refresh();
      notify(`Reversal recorded. Updated balance: ${money(result.balancePaise)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reversal failed.");
    } finally {
      setBusy(false);
    }
  }
  async function checkConnection() {
    if (!user) {
      open("login");
      return;
    }
    setConnection("checking");
    setConnectionMessage("");
    try {
      const result = await api<{ integrations: Integration[] }>("/api/connection");
      setIntegrations({ uid: user.uid, list: result.integrations });
      setConnection("ok");
      setConnectionMessage("Authenticated API and Firestore owner membership verified.");
    } catch (e) {
      setIntegrations(null);
      setConnection("error");
      setConnectionMessage(e instanceof Error ? e.message : "Connection check failed.");
    }
  }
  const customerName = (id: string) =>
    customers.find((c) => c.id === id)?.name || `Customer ${id.slice(0, 8)}`;
  const filteredCustomers = customers
    .filter((c) =>
      `${c.name} ${c.displayLabel} ${c.phone || ""}`.toLowerCase().includes(search.toLowerCase()),
    )
    .filter((c) => filter !== "outstanding" || c.balancePaise > 0)
    .sort((a, b) =>
      filter === "highest" ? b.balancePaise - a.balancePaise : a.name.localeCompare(b.name),
    );
  const filteredEntries = entries
    .filter(
      (e) => filter === "all" || (filter === "reversed" ? reversals.has(e.id) : e.type === filter),
    )
    .filter((e) =>
      `${customerName(e.customerId)} ${e.notes || ""} ${e.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  function exportLedger() {
    const rows = [
      ["Entry ID", "Customer ID", "Type", "Signed amount (paise)", "Status", "Created (IST)"],
      ...filteredEntries.map((e) => [
        e.id,
        e.customerId,
        e.type,
        String(e.signedAmountPaise),
        reversals.has(e.id) ? "reversed" : "recorded",
        e.createdAt ? dateFormat.format(e.createdAt.toDate()) : "",
      ]),
    ];
    const blob = new Blob(
      [rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n")],
      { type: "text/csv" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "udhaar-ledger-loaded-entries.csv";
    link.click();
    URL.revokeObjectURL(url);
    notify("Exported the currently loaded ledger entries.");
  }
  const recent = entries.slice(0, 5);
  return (
    <div className="app-shell">
      <a
        href="#/workspace"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("workspace-content")?.focus();
        }}
      >
        Skip to workspace
      </a>
      {mobileNav && (
        <button
          aria-label="Close navigation"
          className="nav-backdrop"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        ref={navigationRef}
        className={`sidebar ${mobileNav ? "mobile-open" : ""}`}
        inert={compactNav && !mobileNav}
        aria-label="Workspace navigation"
      >
        <a href="#" className="workspace-home">
          <ArrowLeft size={12} />
          Back to Udhaar
        </a>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <span className="brand-mark">
            <AudioLines size={23} strokeWidth={2.3} />
          </span>
          <span>
            udhaar<span className="brand-dot">.</span>
            <small>YOUR VOICE. YOUR KHATA.</small>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <button
          className="shop-switch"
          onClick={() => (user ? navigate("Settings") : open("login"))}
        >
          <span className="shop-icon">
            <Wallet size={18} />
          </span>
          <span>
            {shop?.name || "Your shop"}
            <small>{shop ? "Owner workspace" : "Sign in to your workspace"}</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="workspace-label menu-label">MANAGE</div>
        <nav aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${tab === item.name ? "active" : ""}`}
              aria-current={tab === item.name ? "page" : undefined}
              onClick={() => navigate(item.name)}
            >
              <item.icon size={18} />
              <span>{item.name}</span>
              {tab === item.name && <span className="nav-active-dot" />}
            </button>
          ))}
          <div className="nav-divider" />
          <button
            className={`nav-item ${tab === "Connections" ? "active" : ""}`}
            aria-current={tab === "Connections" ? "page" : undefined}
            onClick={() => navigate("Connections")}
          >
            <Link2 size={18} />
            <span>Connections</span>
            <span className="tiny-dot" />
          </button>
          <button
            className={`nav-item ${tab === "Settings" ? "active" : ""}`}
            aria-current={tab === "Settings" ? "page" : undefined}
            onClick={() => navigate("Settings")}
          >
            <Settings2 size={18} />
            <span>Settings</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="trust-note">
            <span className="trust-icon">
              <ShieldCheck size={19} />
            </span>
            <strong>Your khata, protected.</strong>
            <p>
              Every entry has a history.
              <br />
              Every change is traceable.
            </p>
            <button onClick={() => open("help")}>
              How it works <ArrowUpRight size={13} />
            </button>
          </div>
          <button className="nav-item help-link" onClick={() => open("help")}>
            <CircleHelp size={18} />
            <span>Help & support</span>
            <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <div className="avatar">
              {user?.email?.slice(0, 1).toUpperCase() || <CircleUserRound size={22} />}
            </div>
            <span>
              {user?.email?.split("@")[0] || "Shop owner"}
              <small>{user ? "Owner account" : "Not signed in"}</small>
            </span>
            <button
              className="icon-btn"
              aria-label={user ? "Sign out" : "Sign in"}
              onClick={() => (user ? void logout() : open("login"))}
            >
              {user ? <LogOut size={17} /> : <ArrowRight size={17} />}
            </button>
          </div>
        </div>
      </aside>

      <main className="main" id="workspace-content" tabIndex={-1} inert={compactNav && mobileNav}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{tab}</strong>
          </div>
          <div className="topbar-right">
            {user && (
              <button
                className="icon-btn"
                aria-label="Open setup guide"
                title="Shop setup guide"
                onClick={() => setSetup(true)}
              >
                <ListChecks size={19} />
              </button>
            )}
            <span className="private-label">
              <LockKeyhole size={13} /> Private workspace
            </span>
            <span className="topbar-divider" />
            <button className="icon-btn" aria-label="Help" onClick={() => open("help")}>
              <CircleHelp size={18} />
            </button>
            <button
              className="mini-avatar"
              aria-label="Owner account"
              onClick={() => (user ? navigate("Settings") : open("login"))}
            >
              {user?.email?.[0].toUpperCase() || "S"}
            </button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {tab === "Overview" ? "A LITTLE CLARITY, EVERY DAY" : "YOUR SHOP, ALL IN ONE PLACE"}
              </div>
              <h1>
                {tab === "Overview"
                  ? "Your khata, at a glance."
                  : tab === "Connections"
                    ? "Connected with care."
                    : tab === "Settings"
                      ? "Your workspace settings."
                      : tab === "Customers"
                        ? "People behind the numbers."
                        : tab === "Activity"
                          ? "Every change, on the record."
                          : tab === "Reminders"
                            ? "Reminders, held until approved."
                            : "Every entry. Every detail."}
              </h1>
              <p>
                {tab === "Overview"
                  ? "Less time keeping accounts. More time running your shop."
                  : tab === "Connections"
                    ? "Only verified services get access to your workspace."
                    : tab === "Settings"
                      ? "A private, owner-only space for your shop’s records."
                      : tab === "Customers"
                        ? "A clear view of your customers and their running balances."
                        : tab === "Activity"
                          ? "The audit trail and any voice entries waiting on your answer."
                          : tab === "Reminders"
                            ? "Consent, eligibility and skip reasons for the Sunday run."
                            : "A complete, traceable record. Nothing silently changed or deleted."}
              </p>
            </div>
            <div className="heading-actions">
              {tab === "Overview" && (
                <span className="date-label">
                  <Clock3 size={14} />
                  {now.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Kolkata",
                  })}
                </span>
              )}
              {(tab === "Overview" || tab === "Ledger") && (
                <button className="button primary" onClick={() => requireOwner("entry")}>
                  <Plus size={17} />
                  Add entry
                </button>
              )}
              {tab === "Customers" && (
                <button className="button primary" onClick={() => requireOwner("customer")}>
                  <Plus size={17} />
                  Add customer
                </button>
              )}
            </div>
          </div>

          {!user && (
            <div className="connection-banner">
              <div className="banner-icon">
                <Flame size={19} />
              </div>
              <div>
                <strong>A fresh start for your shop.</strong>
                <span>Firebase is configured. Sign in to securely open your own khata.</span>
              </div>
              <button onClick={() => open("login")}>
                Sign in as owner <ArrowRight size={15} />
              </button>
            </div>
          )}
          {workspace.error && (
            <div className="error-banner" role="alert">
              {workspace.error}
              <button onClick={workspace.refresh}>Retry</button>
              {user && <button onClick={() => setSetup(true)}>Open setup guide</button>}
            </div>
          )}
          {user && !shop && !loading && !workspace.error && (
            <div className="page-loading" role="status">
              <LoaderCircle size={16} className="spin" />
              Verifying your shop access…
            </div>
          )}
          {user && shop && !import.meta.env.VITE_API_BASE_URL && (
            <div className="readonly-notice">
              <LockKeyhole size={16} />
              <span>
                Your Firestore records are available to view. The secure ledger API must be
                configured before you can add or change records.
              </span>
            </div>
          )}
          {tab === "Overview" && user && shop && totals.customers === 0 && !loading && (
            <section className="onboarding-banner">
              <div>
                <span>
                  <Store size={20} />
                </span>
                <div>
                  <strong>Your shop is linked. Let’s make it your khata.</strong>
                  <p>
                    Add your first customer, then record a credit or payment. We won’t add any
                    sample data.
                  </p>
                </div>
              </div>
              <button className="button primary small" onClick={() => open("customer")}>
                Add first customer
                <Plus size={14} />
              </button>
            </section>
          )}

          {tab === "Overview" && (
            <>
              <div className="stats-grid">
                <Stat
                  label="Total outstanding"
                  value={shop ? money(totals.balance) : "₹ —"}
                  icon={<Wallet size={19} />}
                  note="Positive customer balances only"
                  color="green"
                />
                <Stat
                  label="Customers in your khata"
                  value={shop ? String(totals.customers) : "—"}
                  icon={<UsersRound size={19} />}
                  note="People, not just numbers"
                  color="blue"
                />
                <Stat
                  label="Entries recorded"
                  value={shop ? String(totals.entries) : "—"}
                  icon={<BookOpen size={19} />}
                  note="Including complete reversal history"
                  color="orange"
                />
              </div>
              <div className="overview-columns">
                <div className="overview-left">
                  <section className="voice-card">
                    <div className="voice-copy">
                      <span className="pill light">
                        <span className="tiny-dot" />
                        VOICE-FIRST. HASSLE-FREE.
                      </span>
                      <h2>
                        Bas bolo.
                        <br />
                        Hisaab ho gaya.
                      </h2>
                      <p>
                        A voice note is all it takes to keep
                        <br className="desktop-break" /> your udhaar in order.
                      </p>
                      <button className="button dark" onClick={() => open("voice")}>
                        <MessageCircle size={16} />
                        Explore voice commands
                        <ArrowUpRight size={15} />
                      </button>
                      <span className="voice-disclaimer">
                        <LockKeyhole size={11} />
                        WhatsApp connection pending verification
                      </span>
                    </div>
                    <div className="voice-visual">
                      <div className="voice-orbit orbit-one" />
                      <div className="voice-orbit orbit-two" />
                      <div className="microphone">
                        <Mic size={36} strokeWidth={1.6} />
                      </div>
                      <div className="speech-bubble">
                        <div className="voice-wave">
                          {[10, 20, 14, 28, 36, 23, 17, 30, 20, 12, 25, 16, 9].map((h, i) => (
                            <i key={i} style={{ height: h }} />
                          ))}
                        </div>
                        <span>0:08</span>
                        <CheckCheck size={13} />
                      </div>
                      <div className="transcript-card">
                        <span>
                          “Ramesh ko 340 rupaye
                          <br />
                          ka udhaar likh do.”
                        </span>
                        <small>
                          Example voice command <AudioLines size={12} />
                        </small>
                      </div>
                    </div>
                  </section>
                  <section className="panel recent-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          Recent activity <span className="section-dot" />
                        </h2>
                        <p>Your latest entries, with the full picture.</p>
                      </div>
                      <button className="text-button" onClick={() => navigate("Ledger")}>
                        View ledger <ArrowRight size={14} />
                      </button>
                    </div>
                    {loading ? (
                      <Loading />
                    ) : recent.length ? (
                      <div className="activity-list">
                        {recent.map((e) => (
                          <div className="activity-row" key={e.id}>
                            <span className={`activity-icon ${e.type}`}>
                              {e.type === "payment" ? (
                                <ArrowDownLeft size={18} />
                              ) : e.type === "reversal" ? (
                                <Undo2 size={17} />
                              ) : (
                                <ArrowUpRight size={18} />
                              )}
                            </span>
                            <div>
                              <strong>{customerName(e.customerId)}</strong>
                              <small>
                                {e.type === "credit"
                                  ? "Credit added"
                                  : e.type === "payment"
                                    ? "Payment received"
                                    : "Entry reversed"}{" "}
                                ·{" "}
                                {e.createdAt
                                  ? dateFormat.format(e.createdAt.toDate())
                                  : "Pending timestamp"}
                              </small>
                            </div>
                            <span
                              className={`activity-amount ${reversals.has(e.id) ? "reversed-text" : ""}`}
                            >
                              {e.signedAmountPaise > 0 ? "+" : "−"}
                              {money(Math.abs(e.signedAmountPaise))}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        icon={<BookOpen size={23} />}
                        title="A clean page. A clear start."
                        description={
                          user
                            ? "Your first ledger entry will appear here with its complete history."
                            : "Sign in to see your shop’s activity. Your records stay private."
                        }
                        action={user ? "Add your first entry" : "Open your khata"}
                        onClick={() => requireOwner("entry")}
                      />
                    )}
                    <div className="panel-footer">
                      <ShieldCheck size={13} />
                      All entries are recorded with an immutable history.
                    </div>
                  </section>
                </div>
                <div className="overview-right">
                  <section className="panel setup-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Make it your khata</h2>
                        <p>A few small steps. A simpler day.</p>
                      </div>
                      <span className="setup-count">
                        {1 + (user ? 1 : 0) + (shop ? 1 : 0) + (totals.customers > 0 ? 1 : 0)}/4
                      </span>
                    </div>
                    <div className="progress-track">
                      <div
                        style={{
                          width: `${(1 + (user ? 1 : 0) + (shop ? 1 : 0) + (totals.customers > 0 ? 1 : 0)) * 25}%`,
                        }}
                      />
                    </div>
                    <SetupStep
                      done
                      title="Connect Firebase"
                      detail="Your secure foundation is configured"
                    />
                    <SetupStep
                      done={Boolean(user)}
                      title="Sign in as an owner"
                      detail="Only you can access your shop"
                      onClick={() => open("login")}
                    />
                    <SetupStep
                      done={Boolean(shop)}
                      title="Link your shop"
                      detail="An administrator verifies membership"
                      onClick={() => navigate("Settings")}
                    />
                    <SetupStep
                      done={totals.customers > 0}
                      title="Add your first customer"
                      detail="A name, a landmark, a familiar face"
                      onClick={() => requireOwner("customer")}
                    />
                  </section>
                  <section className="reminder-card">
                    <div className="reminder-top">
                      <span className="reminder-icon">
                        <Clock3 size={19} />
                      </span>
                      <span className="pill muted">OFF BY DEFAULT</span>
                    </div>
                    <h3>
                      A thoughtful pause
                      <br />
                      on reminders.
                    </h3>
                    <p>
                      Customer reminders stay off until Meta policy approval. Your ledger works
                      independently.
                    </p>
                    <button className="text-button" onClick={() => navigate("Connections")}>
                      View policy & connections <ArrowRight size={14} />
                    </button>
                  </section>
                  <div className="assurance">
                    <ShieldCheck size={17} />
                    <span>
                      Built for trust.
                      <br />
                      <strong>One shop. One private khata.</strong>
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "Customers" && (
            <section className="panel data-panel">
              <div className="table-toolbar">
                <div className="search-field">
                  <Search size={16} />
                  <input
                    aria-label="Search loaded customers"
                    placeholder="Search loaded customers…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Customer filter and sort"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Name: A to Z</option>
                  <option value="highest">Highest balance</option>
                  <option value="outstanding">Outstanding only</option>
                </select>
                <button
                  className="icon-btn"
                  aria-label="Refresh customers"
                  onClick={workspace.refresh}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              {loading ? (
                <Loading />
              ) : filteredCustomers.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Landmark / label</th>
                        <th>Contact</th>
                        <th>Outstanding</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomers.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <button
                              className="customer-name link-cell"
                              onClick={() => setDetailCustomer(c.id)}
                              aria-label={`Open ${c.name}`}
                            >
                              <span className="table-avatar">{c.name[0].toUpperCase()}</span>
                              <strong>{c.name}</strong>
                            </button>
                          </td>
                          <td>{c.displayLabel || "Not added"}</td>
                          <td>{c.phone || <span className="subtle">No phone added</span>}</td>
                          <td className="amount-cell">{money(c.balancePaise)}</td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() => {
                                setSelectedCustomer(c.id);
                                open("entry");
                              }}
                            >
                              Add entry
                              <Plus size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  icon={<UsersRound size={25} />}
                  title={search ? "No matching customers" : "Your regulars belong here."}
                  description={
                    search
                      ? "Try a different name or load more customers."
                      : "Add a customer to start keeping a clear, reliable account."
                  }
                  action="Add customer"
                  onClick={() => requireOwner("customer")}
                />
              )}
              <div className="table-bottom">
                <span>{customers.length} customers loaded · Search applies to loaded records</span>
                {workspace.hasMoreCustomers && (
                  <button className="text-button" onClick={workspace.loadCustomers}>
                    Load 50 more
                    <ChevronDown size={14} />
                  </button>
                )}
              </div>
            </section>
          )}

          {tab === "Ledger" && (
            <section className="panel data-panel">
              <div className="table-toolbar">
                <div className="search-field">
                  <Search size={16} />
                  <input
                    aria-label="Search loaded ledger"
                    placeholder="Search loaded entries…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter ledger"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All entries</option>
                  <option value="credit">Credit</option>
                  <option value="payment">Payment</option>
                  <option value="reversal">Reversals</option>
                  <option value="reversed">Reversed originals</option>
                </select>
                <button
                  className="button secondary small"
                  disabled={!filteredEntries.length}
                  onClick={exportLedger}
                >
                  <Download size={14} />
                  Export loaded
                </button>
                <button
                  className="icon-btn"
                  aria-label="Refresh ledger"
                  onClick={workspace.refresh}
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              {loading ? (
                <Loading />
              ) : filteredEntries.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer & entry</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Date · IST</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map((e) => (
                        <tr key={e.id}>
                          <td>
                            <strong>{customerName(e.customerId)}</strong>
                            <small className="table-small">
                              {e.notes || e.reason || e.source} · {e.id.slice(0, 8)}
                            </small>
                            <small className="table-small" title={e.createdBy}>
                              Actor: {e.createdBy.slice(0, 12)}
                            </small>
                            {e.reversesEntryId && (
                              <small className="table-small">
                                Reverses: {e.reversesEntryId.slice(0, 8)}
                              </small>
                            )}
                          </td>
                          <td>
                            <span className={`entry-tag ${e.type}`}>
                              {reversals.has(e.id) ? "Reversed" : e.type}
                            </span>
                          </td>
                          <td
                            className={`amount-cell ${reversals.has(e.id) ? "reversed-text" : ""}`}
                          >
                            {e.signedAmountPaise > 0 ? "+" : "−"}
                            {money(Math.abs(e.signedAmountPaise))}
                          </td>
                          <td>{e.createdAt ? dateFormat.format(e.createdAt.toDate()) : "—"}</td>
                          <td>
                            {e.type !== "reversal" && !reversals.has(e.id) ? (
                              <span className="row-actions">
                                <button className="text-button" onClick={() => setEditingEntry(e)}>
                                  <Pencil size={13} />
                                  Edit
                                </button>
                                <button
                                  className="text-button reverse-button"
                                  onClick={() => {
                                    setError("");
                                    operation.current = null;
                                    setReversing(e);
                                  }}
                                >
                                  <Undo2 size={13} />
                                  Reverse
                                </button>
                              </span>
                            ) : (
                              <span className="subtle">Preserved</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  icon={<BookOpen size={25} />}
                  title={search ? "No matching entries" : "Nothing recorded. Nothing guessed."}
                  description="Your credits, payments, and reversals will appear here. Original entries are never deleted."
                  action="Add entry"
                  onClick={() => requireOwner("entry")}
                />
              )}
              <div className="table-bottom">
                <span>
                  {entries.length} entries loaded · Every amount is stored in integer paise
                </span>
                {workspace.hasMoreEntries && (
                  <button className="text-button" onClick={workspace.loadEntries}>
                    Load 50 more
                    <ChevronDown size={14} />
                  </button>
                )}
              </div>
            </section>
          )}

          {tab === "Connections" && (
            <>
              <div className="panel firebase-panel">
                <div className="firebase-heading">
                  <span className="firebase-symbol">
                    <Flame size={27} />
                  </span>
                  <div>
                    <h2>Firebase</h2>
                    <p>Your primary backend infrastructure</p>
                  </div>
                  <span className="pill green">
                    <span className="tiny-dot" />
                    WEB SDK CONFIGURED
                  </span>
                </div>
                <div className="connection-details">
                  <div>
                    <small>PROJECT</small>
                    <strong>{projectId}</strong>
                  </div>
                  <div>
                    <small>AUTHENTICATION</small>
                    <strong>{user ? "Signed in" : "Email & password · not verified"}</strong>
                  </div>
                  <div>
                    <small>CLOUD FIRESTORE</small>
                    <strong>{shop ? "Shop read verified" : "Awaiting owner sign-in"}</strong>
                  </div>
                </div>
                <div className="connection-foot">
                  <span>
                    <ShieldCheck size={15} />
                    Admin credentials stay on the server.
                  </span>
                  <button
                    className="button secondary small"
                    onClick={checkConnection}
                    disabled={connection === "checking"}
                  >
                    {connection === "checking" ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    Verify API connection
                  </button>
                </div>
                {connectionMessage && (
                  <p
                    role="status"
                    className={`connection-result ${connection === "error" ? "error-text" : ""}`}
                  >
                    {connectionMessage}
                  </p>
                )}
              </div>
              <div className="section-heading">
                <h2>Integrations</h2>
                <p>Live state reported by the server. Never connected by assumption.</p>
              </div>
              <IntegrationsGrid
                integrations={
                  integrations && integrations.uid === user?.uid ? integrations.list : null
                }
              />
              <div className="policy-note">
                <ShieldCheck size={23} />
                <div>
                  <h3>Reminders are intentionally disabled.</h3>
                  <p>
                    There is no reminder sender in this release. Written Meta/BSP approval, verified
                    opt-in, and a separate implementation review are required before customer
                    reminders can be enabled. No billing or deployment has been initiated.
                  </p>
                </div>
              </div>
            </>
          )}

          {(tab === "Activity" || tab === "Reminders") &&
            (shop ? (
              tab === "Activity" ? (
                <ActivityPanel shopId={shop.id} customerName={customerName} />
              ) : (
                <RemindersPanel shopId={shop.id} customerName={customerName} />
              )
            ) : (
              <section className="panel">
                <Empty
                  icon={<ShieldCheck size={24} />}
                  title="Sign in to see your shop."
                  description="Activity and reminder records are private to the shop owner."
                  action="Sign in as owner"
                  onClick={() => open("login")}
                />
              </section>
            ))}

          {tab === "Settings" && (
            <div className="settings-grid">
              <section className="panel settings-card">
                <h2>Shop & owner</h2>
                <p>Membership is provisioned by a trusted administrator.</p>
                <dl>
                  <div>
                    <dt>Shop</dt>
                    <dd>{shop?.name || "Not linked"}</dd>
                  </div>
                  <div>
                    <dt>Owner</dt>
                    <dd>{user?.email || "Not signed in"}</dd>
                  </div>
                  <div>
                    <dt>Role</dt>
                    <dd>{shop ? "Verified owner" : "Awaiting verification"}</dd>
                  </div>
                  <div>
                    <dt>Timezone</dt>
                    <dd>Asia/Kolkata</dd>
                  </div>
                  <div>
                    <dt>Ledger currency</dt>
                    <dd>INR · integer paise</dd>
                  </div>
                </dl>
                {user ? (
                  <button className="button secondary" onClick={() => void logout()}>
                    <LogOut size={15} />
                    Sign out securely
                  </button>
                ) : (
                  <button className="button primary" onClick={() => open("login")}>
                    Sign in as owner
                    <ArrowRight size={15} />
                  </button>
                )}
              </section>
              <section className="panel settings-card">
                <h2>Safety, by design</h2>
                <p>These protections are not optional toggles.</p>
                {[
                  "Shop-scoped reads and server transactions",
                  "Original entries are never overwritten",
                  "Mandatory reasons for every reversal",
                  "Duplicate request protection",
                  "Customer reminders disabled",
                  "No analytics initialized",
                ].map((item) => (
                  <div className="safety-row" key={item}>
                    <ShieldCheck size={17} />
                    {item}
                  </div>
                ))}
                <div className="setup-hint">
                  <strong>Setting up your first shop?</strong>
                  <p>
                    Your owner account needs to be linked by your pilot administrator. The setup
                    guide explains what’s done, what’s next, and how to share your owner ID safely.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => (user ? setSetup(true) : open("login"))}
                  >
                    Open your setup guide
                    <ArrowRight size={13} />
                  </button>
                </div>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <span className="footer-dot" />
              Made for the way your shop works.
            </span>
            <span>Speak simply. Keep clearly.</span>
          </footer>
        </div>
      </main>

      {dialog === "login" && (
        <Modal
          title="Welcome to your khata."
          eyebrow="OWNER SIGN-IN"
          close={() => !busy && setDialog(null)}
        >
          <p className="modal-description">
            Sign in with the owner account linked to your shop. Your records are visible only to
            you.
          </p>
          <form onSubmit={submitLogin} className="form">
            <label>
              Email address
              <input
                id="owner-email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@yourshop.com"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                required
              />
            </label>
            <button
              className="text-button reset-password"
              type="button"
              disabled={busy}
              onClick={resetPassword}
            >
              Forgot password?
            </button>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <LockKeyhole size={15} />}Sign
              in securely
            </button>
            <div className="form-note">
              <ShieldCheck size={15} />
              Protected by Firebase Authentication. Access requires verified shop membership.
            </div>
          </form>
        </Modal>
      )}
      {dialog === "customer" && (
        <Modal
          title="A familiar face, a clear account."
          eyebrow="NEW CUSTOMER"
          close={() => !busy && setDialog(null)}
        >
          <form className="form" onSubmit={submitCustomer}>
            <label>
              Customer name
              <input name="name" required maxLength={100} placeholder="e.g. Ramesh" />
            </label>
            <label>
              Landmark or display label
              <input name="label" maxLength={150} placeholder="e.g. Near the temple" />
            </label>
            <label>
              Phone number <span className="subtle">(optional)</span>
              <input
                name="phone"
                type="tel"
                placeholder="+919876543210"
                pattern="\+[1-9][0-9]{7,14}"
              />
            </label>
            <p className="form-note">Adding a phone number does not opt anyone into reminders.</p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy || !shop}>
              {busy && <LoaderCircle size={16} className="spin" />}Add customer
            </button>
            {!shop && <p className="form-error">Link your shop before adding customers.</p>}
          </form>
        </Modal>
      )}
      {dialog === "entry" && (
        <Modal
          title="Keep the numbers clear."
          eyebrow="NEW LEDGER ENTRY"
          close={() => !busy && setDialog(null)}
        >
          {!customers.length ? (
            <Empty
              icon={<UsersRound size={24} />}
              title="Start with a customer."
              description="Create a customer before recording a credit or payment."
              action="Add customer"
              onClick={() => open("customer")}
            />
          ) : (
            <form className="form" onSubmit={submitEntry}>
              <label>
                Customer
                <select
                  name="customer"
                  defaultValue={selectedCustomer || customers[0]?.id}
                  required
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.displayLabel ? ` · ${c.displayLabel}` : ""} · {money(c.balancePaise)}{" "}
                      outstanding
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-columns">
                <label>
                  Entry type
                  <select name="action">
                    <option value="add_credit">Credit given</option>
                    <option value="add_payment">Payment received</option>
                  </select>
                </label>
                <label>
                  Amount (₹)
                  <input
                    name="amount"
                    inputMode="decimal"
                    placeholder="340.00"
                    pattern="[0-9]+(\.[0-9]{1,2})?"
                    required
                  />
                </label>
              </div>
              <label>
                Notes <span className="subtle">(optional)</span>
                <input name="notes" maxLength={1000} placeholder="What was this for?" />
              </label>
              <details className="advanced">
                <summary>Explicit confirmations for special cases</summary>
                <label className="checkbox-label">
                  <input name="large" type="checkbox" />I confirm an amount above ₹1,00,000.
                </label>
                <label className="checkbox-label">
                  <input name="advance" type="checkbox" />
                  If payment exceeds the balance, record the extra as an advance.
                </label>
              </details>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button primary full" disabled={busy || !shop}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Record
                entry
              </button>
              <p className="form-note">
                <ShieldCheck size={14} />
                Saved atomically with its audit record. Reversible, never deleted.
              </p>
            </form>
          )}
        </Modal>
      )}
      {reversing && (
        <Modal
          title="Reverse, don’t erase."
          eyebrow="CONFIRM REVERSAL"
          close={() => !busy && setReversing(null)}
        >
          <p className="modal-description">
            Reverse the {money(Math.abs(reversing.signedAmountPaise))} {reversing.type} for{" "}
            <strong>{customerName(reversing.customerId)}</strong>? The original stays visible and a
            balancing reversal is added.
          </p>
          <form className="form" onSubmit={submitReversal}>
            <label>
              Reason for reversal
              <textarea
                name="reason"
                required
                minLength={3}
                maxLength={500}
                placeholder="Tell us what needs correcting…"
                rows={3}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button danger full" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Undo2 size={16} />}Confirm
              reversal
            </button>
          </form>
        </Modal>
      )}
      {dialog === "voice" && (
        <Modal
          title="Your voice. One clear action."
          eyebrow="VOICE COMMANDS · PREVIEW"
          close={() => setDialog(null)}
        >
          <p className="modal-description">
            These are examples, not processed messages. WhatsApp and speech adapters are not
            connected yet.
          </p>
          <div className="command-examples">
            {[
              ["Add credit", "“Ramesh ko 340 rupaye ka udhaar likh do.”"],
              ["Record a payment", "“Sunita ne 200 rupaye diye.”"],
              ["Check a balance", "“Ramesh ka kitna baaki hai?”"],
              ["Correct a mistake", "Reply “GALAT” to the confirmation."],
            ].map(([label, text]) => (
              <div key={label}>
                <small>{label}</small>
                <p>{text}</p>
              </div>
            ))}
          </div>
          <p className="form-note">
            <ShieldCheck size={15} />
            If a name or amount is unclear, the agent must ask—not guess.
          </p>
          <button
            className="button primary full"
            onClick={() => {
              setDialog(null);
              navigate("Connections");
            }}
          >
            View connections
            <ArrowRight size={15} />
          </button>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title="A khata you can trust." eyebrow="HELP & SAFETY" close={() => setDialog(null)}>
          <div className="help-content">
            <h3>How entries work</h3>
            <p>
              Credit increases a customer’s balance. Payment reduces it. All money is stored as
              integer paise to avoid decimal rounding errors.
            </p>
            <h3>Made a mistake?</h3>
            <p>
              Find the entry in Ledger and choose Reverse. A reason is required, and the original
              entry is kept. Then add a corrected entry if needed.
            </p>
            <h3>Can’t access your shop?</h3>
            <p>
              Ask your project administrator to enable Email/Password in Firebase Authentication,
              create your account, and provision its shop membership. See{" "}
              <code>docs/FIREBASE_SETUP.md</code>.
            </p>
            <h3>Need human help?</h3>
            <p>
              Contact your shop’s onboarding administrator. A public support contact must be
              configured before WhatsApp launch.
            </p>
          </div>
        </Modal>
      )}
      {detailCustomer && shop && (
        <CustomerDetail
          shopId={shop.id}
          customerId={detailCustomer}
          close={() => setDetailCustomer(null)}
          onChanged={workspace.refresh}
          onReverse={(e) => {
            setDetailCustomer(null);
            setError("");
            operation.current = null;
            setReversing(e);
          }}
          onEdit={(e) => {
            setDetailCustomer(null);
            setEditingEntry(e);
          }}
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
            notify(`Correction recorded. Updated balance: ${money(balance)}.`);
          }}
        />
      )}
      {setup && user && (
        <SetupGuide
          user={user}
          shopName={shop?.name}
          hasCustomers={totals.customers > 0}
          close={() => setSetup(false)}
          refresh={workspace.refresh}
          addCustomer={() => {
            setSetup(false);
            open("customer");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  note,
  color,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  note: string;
  color: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">
        <span />
        {note}
      </div>
    </div>
  );
}
function SetupStep({
  done,
  title,
  detail,
  onClick,
}: {
  done?: boolean;
  title: string;
  detail: string;
  onClick?(): void;
}) {
  return (
    <button
      className={`setup-step ${done ? "done" : ""}`}
      disabled={done || !onClick}
      onClick={onClick}
    >
      <span className="step-check">{done && <Check size={12} strokeWidth={3} />}</span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {!done && <ChevronRight size={14} />}
    </button>
  );
}
function Empty({
  icon,
  title,
  description,
  action,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: string;
  onClick(): void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="text-button" onClick={onClick}>
        {action}
        <ArrowRight size={14} />
      </button>
    </div>
  );
}
function Loading() {
  return (
    <div className="loading-state">
      <LoaderCircle size={22} className="spin" />
      <span>Opening your khata…</span>
    </div>
  );
}
