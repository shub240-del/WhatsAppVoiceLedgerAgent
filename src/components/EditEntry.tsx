import { useRef, useState, type FormEvent } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { api } from "../lib/api";
import { money, rupeesToPaise } from "../lib/money";
import type { Entry } from "../lib/useWorkspace";
import { Modal } from "./Modal";

export function EditEntry({ entry, customerName, close, done }: { entry: Entry; customerName: string; close(): void; done(balancePaise: number): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("Wrong amount");
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
    <Modal title="Fix this entry" eyebrow="FIX A MISTAKE" close={() => !busy && close()}>
      <p className="modal-description">Fixing the {money(Math.abs(entry.signedAmountPaise))} {entry.type === "credit" ? "udhaar" : "payment"} for <strong>{customerName}</strong>. The old entry stays in history, marked as fixed.</p>
      <form className="form" onSubmit={submit}>
        <div className="form-columns">
          <label>Correct amount (₹)<input name="amount" inputMode="decimal" defaultValue={amount} required autoFocus /></label>
          <label>Type<select name="type" defaultValue={entry.type}><option value="credit">Udhaar diya</option><option value="payment">Paisa mila</option></select></label>
        </div>
        <label>Note <span className="subtle">(optional)</span><input name="notes" maxLength={1000} defaultValue={entry.notes ?? ""} /></label>
        <div className="reason-chips" role="group" aria-label="Why?">
          {["Wrong amount", "Wrong type", "Customer returned items"].map((r) => (
            <button type="button" key={r} aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>
          ))}
        </div>
        <label>Reason<input name="reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.currentTarget.value)} placeholder="e.g. Amount was 430, not 340" /></label>
        <details className="advanced"><summary>Very big amount, or paid more than owed?</summary>
          <label className="checkbox-label"><input name="large" type="checkbox" />Yes, this amount is above ₹1,00,000.</label>
          <label className="checkbox-label"><input name="advance" type="checkbox" />Keep any extra payment as advance.</label>
        </details>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary full" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Save fix</button>
      </form>
    </Modal>
  );
}
