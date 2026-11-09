import { useEffect, useState, type ReactNode } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { Activity, BellOff, CircleAlert, Clock3, LoaderCircle, MessageCircleQuestion, RefreshCw, ShieldCheck } from "lucide-react";
import { db } from "../lib/firebase";
import { money } from "../lib/money";

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
type Row = Record<string, any> & { id: string };
const fmt = (t?: { toDate(): Date } | null) => (t ? dateFormat.format(t.toDate()) : "—");

function useQueryRows(load: () => Promise<Row[]>, deps: unknown[]) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setRows(null); setError("");
    load().then((r) => active && setRows(r)).catch((e) => active && setError(e instanceof Error ? e.message : "Could not load."));
    return () => { active = false; };
    // eslint-disable-next-line
  }, [...deps, revision]);
  return { rows, error, refresh: () => setRevision((r) => r + 1) };
}
const rowsOf = async (q: ReturnType<typeof query>) => (await getDocs(q)).docs.map((d) => ({ ...(d.data() as object), id: d.id }) as Row);

function State({ rows, error, empty, children }: { rows: Row[] | null; error: string; empty: ReactNode; children: ReactNode }) {
  if (error) return <p className="form-error panel-pad" role="alert">{error}</p>;
  if (!rows) return <div className="loading-state"><LoaderCircle size={22} className="spin" /><span>Loading…</span></div>;
  if (!rows.length) return <div className="empty-state compact">{empty}</div>;
  return <>{children}</>;
}

const ACTION_LABELS: Record<string, string> = {
  add_credit: "Credit added", add_payment: "Payment recorded", undo_entry: "Entry reversed", undo_last: "Last entry reversed",
  edit_entry: "Entry corrected", create_customer: "Customer created", update_customer: "Customer updated", reminder_consent: "Reminder consent changed",
};

export function ActivityPanel({ shopId, customerName }: { shopId: string; customerName(id: string): string }) {
  const audit = useQueryRows(() => rowsOf(query(collection(db, "shops", shopId, "auditLogs"), orderBy("createdAt", "desc"), limit(50))), [shopId]);
  const pending = useQueryRows(() => rowsOf(query(collection(db, "shops", shopId, "pendingClarifications"), where("status", "==", "awaiting_owner"), limit(20))), [shopId]);
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-heading"><div><h2>Waiting for your answer</h2><p>Voice entries the agent paused on instead of guessing.</p></div><button className="icon-btn" aria-label="Refresh" onClick={pending.refresh}><RefreshCw size={16} /></button></div>
        <State rows={pending.rows} error={pending.error} empty={<><span className="empty-icon"><MessageCircleQuestion size={22} /></span><h3>No open questions</h3><p>When something you said was unclear, the assistant’s open question appears here.</p></>}>
          <ul className="history-list padded">
            {pending.rows?.map((p) => (
              <li key={p.id}><div><strong>{String(p.questionText).split("\n")[0]}</strong><small>“{String(p.originalTranscript).slice(0, 120)}” · expires {fmt(p.expiresAt)}</small></div><span className="entry-tag">{p.missingField}</span></li>
            ))}
          </ul>
        </State>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2>Audit log</h2><p>Every change, who made it, and the balance before and after.</p></div><button className="icon-btn" aria-label="Refresh" onClick={audit.refresh}><RefreshCw size={16} /></button></div>
        <State rows={audit.rows} error={audit.error} empty={<><span className="empty-icon"><Activity size={22} /></span><h3>No activity yet</h3><p>Ledger and customer changes will be recorded here permanently.</p></>}>
          <div className="table-scroll"><table><thead><tr><th>When · IST</th><th>Action</th><th>Customer</th><th>Balance change</th><th>Actor</th></tr></thead><tbody>
            {audit.rows?.map((a) => (
              <tr key={a.id}>
                <td>{fmt(a.createdAt)}</td>
                <td><strong>{ACTION_LABELS[a.action] ?? a.action}</strong>{a.reason && <small className="table-small">{a.reason}</small>}</td>
                <td>{a.customerId ? customerName(a.customerId) : "—"}</td>
                <td className="amount-cell">{typeof a.before?.balancePaise === "number" && typeof a.after?.balancePaise === "number" ? `${money(a.before.balancePaise)} → ${money(a.after.balancePaise)}` : "—"}</td>
                <td title={a.actorId}>{String(a.actorId).slice(0, 10)}</td>
              </tr>
            ))}
          </tbody></table></div>
        </State>
      </section>
    </div>
  );
}

const SKIP_LABELS: Record<string, string> = {
  policy_blocked: "Policy gate", zero_balance: "No balance", no_phone: "No phone", no_opt_in: "No opt-in", opted_out: "Opted out",
  shop_disabled: "Shop disabled", balance_cleared: "Cleared before send", sender_unavailable: "Sender unavailable",
};
export function RemindersPanel({ shopId, customerName }: { shopId: string; customerName(id: string): string }) {
  const jobs = useQueryRows(() => rowsOf(query(collection(db, "shops", shopId, "reminderJobs"), orderBy("createdAt", "desc"), limit(8))), [shopId]);
  const prefs = useQueryRows(() => rowsOf(query(collection(db, "shops", shopId, "reminderPreferences"), limit(500))), [shopId]);
  const latest = jobs.rows?.[0]?.id as string | undefined;
  const logs = useQueryRows(async () => (latest ? rowsOf(query(collection(db, "shops", shopId, "reminderLogs"), where("jobId", "==", latest), limit(200))) : []), [shopId, latest]);
  const counts = { opted_in: 0, opted_out: 0, unknown: 0 } as Record<string, number>;
  for (const p of prefs.rows ?? []) counts[p.status in counts ? p.status : "unknown"]++;
  return (
    <div className="stack">
      <div className="policy-note"><BellOff size={23} /><div><h3>Sending is disabled by policy.</h3><p>Every Sunday at 6 PM IST the scheduler checks each customer and records why a reminder would or would not go out. Nothing is sent until written Meta/BSP approval is recorded in a reviewed release. Consent is recorded per customer from their detail view.</p></div></div>
      <div className="stats-grid">
        {[["Opted in", counts.opted_in], ["Opted out", counts.opted_out], ["Consent unknown", counts.unknown]].map(([label, value]) => (
          <div className="stat-card" key={label as string}><div className="stat-top"><span>{label}</span><span className="stat-icon green"><ShieldCheck size={17} /></span></div><div className="stat-value">{prefs.rows ? value : "—"}</div><div className="stat-note"><span />From recorded preferences</div></div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading"><div><h2>Sunday runs</h2><p>{latest ? `Latest run ${latest} · gate ${jobs.rows?.[0]?.policyGateState}` : "The first run happens on Sunday at 6 PM IST once the worker is running."}</p></div><button className="icon-btn" aria-label="Refresh" onClick={() => { jobs.refresh(); prefs.refresh(); logs.refresh(); }}><RefreshCw size={16} /></button></div>
        <State rows={logs.rows} error={logs.error || jobs.error} empty={<><span className="empty-icon"><Clock3 size={22} /></span><h3>No runs yet</h3><p>Per-customer outcomes and skip reasons will be listed here.</p></>}>
          <div className="table-scroll"><table><thead><tr><th>Customer</th><th>Balance at run</th><th>Outcome</th></tr></thead><tbody>
            {logs.rows?.map((l) => (
              <tr key={l.id}><td><strong>{customerName(l.customerId)}</strong></td><td className="amount-cell">{money(l.balanceSnapshotPaise ?? 0)}</td><td><span className="entry-tag">{l.status === "sent" ? "Sent" : SKIP_LABELS[l.skipReason] ?? l.skipReason}</span></td></tr>
            ))}
          </tbody></table></div>
        </State>
      </section>
    </div>
  );
}

export type Integration = { provider: string; role: string; state: string; detail: string };
const STATE_LABELS: Record<string, string> = { CONFIGURED: "Configured", NOT_CONFIGURED: "Not configured", INVALID: "Invalid configuration", BLOCKED_EXTERNALLY: "Blocked externally", DISABLED_BY_POLICY: "Disabled by policy" };
const NAMES: Record<string, string> = { whatsapp: "WhatsApp", gemini: "Gemini · EVON", prisma: "PRISMA", timbre: "TIMBRE", gnani: "Gnani", nvidia: "NVIDIA NIM", reminders: "Reminders" };
export function IntegrationsGrid({ integrations }: { integrations: Integration[] | null }) {
  if (!integrations) return <div className="panel empty-state compact"><span className="empty-icon"><CircleAlert size={22} /></span><h3>Status not verified yet</h3><p>Sign in and choose “Verify API connection” to load the live configuration state from the server. Secret values are never shown.</p></div>;
  return (
    <div className="adapters-grid">
      {integrations.map((i) => (
        <div className="panel adapter-card" key={i.provider}>
          <h3>{NAMES[i.provider] ?? i.provider}</h3>
          <p>{i.role}</p>
          <span className={`adapter-status state-${i.state.toLowerCase()}`}><span />{STATE_LABELS[i.state] ?? i.state}</span>
          <small className="adapter-detail">{i.detail}</small>
        </div>
      ))}
    </div>
  );
}
