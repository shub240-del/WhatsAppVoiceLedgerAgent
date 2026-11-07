import { useRef, useState, type FormEvent } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { api } from "../lib/api";
import { money, rupeesToPaise } from "../lib/money";
import type { Entry } from "../lib/useWorkspace";
import { Modal } from "./Modal";

export function EditEntry({ entry, customerName, close, done }: { entry: Entry; customerName: string; close(): void; done(balancePaise: number): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef<{ payload: string; key: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true); setError("");
    try {
      const payload = {
        type: String(data.get("type")), amountPaise: rupeesToPaise(String(data.get("amount"))), notes: String(data.get("notes")),
        reason: String(data.get("reason")), confirmAdvance: data.get("advance") === "on", confirmLargeAmount: data.get("large") === "on",
      };
      const serialized = JSON.stringify(payload);
      if (!operation.current || operation.current.payload !== serialized) operation.current = { payload: serialized, key: crypto.randomUUID() };
      const result = await api<{ balancePaise: number }>(`/api/entries/${entry.id}/edit`, payload, operation.current.key);
      done(result.balancePaise);
    } catch (err) { setError(err instanceof Error ? err.message : "Nothing was changed. Try again."); }
    finally { setBusy(false); }
  }
  const amount = (Math.abs(entry.signedAmountPaise) / 100).toFixed(2).replace(/\.00$/, "");
  return (
    <Modal title="Correct, with a full trail." eyebrow="EDIT ENTRY" close={() => !busy && close()}>
      <p className="modal-description">Editing the {money(Math.abs(entry.signedAmountPaise))} {entry.type} for <strong>{customerName}</strong> adds a reversal and a corrected entry. The original stays visible.</p>
      <form className="form" onSubmit={submit}>
        <div className="form-columns">
          <label>Entry type<select name="type" defaultValue={entry.type}><option value="credit">Credit given</option><option value="payment">Payment received</option></select></label>
          <label>Correct amount (₹)<input name="amount" inputMode="decimal" defaultValue={amount} pattern="[0-9]+(\.[0-9]{1,2})?" required /></label>
        </div>
        <label>Notes <span className="subtle">(optional)</span><input name="notes" maxLength={1000} defaultValue={entry.notes ?? ""} /></label>
        <label>Reason for correction<textarea name="reason" required minLength={3} maxLength={500} rows={2} placeholder="e.g. Amount was 430, not 340" /></label>
        <details className="advanced"><summary>Explicit confirmations for special cases</summary>
          <label className="checkbox-label"><input name="large" type="checkbox" />I confirm an amount above ₹1,00,000.</label>
          <label className="checkbox-label"><input name="advance" type="checkbox" />If payment exceeds the balance, record the extra as an advance.</label>
        </details>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary full" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Save correction</button>
      </form>
    </Modal>
  );
}
