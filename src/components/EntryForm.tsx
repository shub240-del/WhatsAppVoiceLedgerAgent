import { useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { money, rupeesToPaise } from "../lib/money";
import type { Customer } from "../lib/useWorkspace";

/**
 * Manual entry, built around flow 02: never guess the customer, make the direction obvious,
 * and show the exact resulting balance before saving.
 */
export function EntryForm({
  customers,
  initialCustomer,
  busy,
  error,
  disabled,
  onSubmit,
}: {
  customers: Customer[];
  initialCustomer: string;
  busy: boolean;
  error: string;
  disabled: boolean;
  onSubmit(e: FormEvent<HTMLFormElement>): void;
}) {
  const [customerId, setCustomerId] = useState(initialCustomer);
  const [action, setAction] = useState<"add_credit" | "add_payment">("add_credit");
  const [amount, setAmount] = useState("");
  const customer = customers.find((c) => c.id === customerId);
  let paise: number | null = null;
  try {
    paise = amount ? rupeesToPaise(amount) : null;
  } catch {
    paise = null;
  }
  const next =
    customer && paise !== null
      ? customer.balancePaise + (action === "add_credit" ? paise : -paise)
      : null;
  const sameNames = (name: string) =>
    customers.filter((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase()).length > 1;
  return (
    <form className="form" onSubmit={onSubmit}>
      <label>
        Customer
        <select
          name="customer"
          value={customerId}
          onChange={(e) => setCustomerId(e.currentTarget.value)}
          required
        >
          <option value="" disabled>
            Choose a customer…
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.displayLabel || sameNames(c.name) ? ` · ${c.displayLabel || "no landmark"}` : ""} ·
              baaki {money(c.balancePaise)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="choice-row" aria-label="What happened?">
        <label>
          <input
            type="radio"
            name="action"
            value="add_credit"
            checked={action === "add_credit"}
            onChange={() => setAction("add_credit")}
          />
          <ArrowUpRight size={17} />
          Udhaar diya
        </label>
        <label>
          <input
            type="radio"
            name="action"
            value="add_payment"
            checked={action === "add_payment"}
            onChange={() => setAction("add_payment")}
          />
          <ArrowDownLeft size={17} />
          Paisa mila
        </label>
      </fieldset>
      <label>
        Amount (₹)
        <input
          name="amount"
          inputMode="decimal"
          placeholder="e.g. 340"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.currentTarget.value)}
          required
        />
      </label>
      {customer && (
        <p className="balance-preview" role="status">
          {next === null ? (
            <>
              {customer.name} owes you <strong>{money(customer.balancePaise)}</strong> now.
            </>
          ) : (
            <>
              {customer.name}: {money(customer.balancePaise)} → <strong>{money(next)}</strong>
              {next < 0 ? " (paid in advance)" : ""}
            </>
          )}
        </p>
      )}
      <label>
        Note <span className="subtle">(optional)</span>
        <input name="notes" maxLength={1000} placeholder="e.g. Atta, chawal" />
      </label>
      <details className="advanced">
        <summary>Very big amount, or paid more than owed?</summary>
        <label className="checkbox-label">
          <input name="large" type="checkbox" />
          Yes, this amount is above ₹1,00,000.
        </label>
        <label className="checkbox-label">
          <input name="advance" type="checkbox" />
          Keep any extra payment as advance.
        </label>
      </details>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary full" disabled={busy || disabled}>
        {busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
        Save entry
      </button>
      <p className="form-note">
        <ShieldCheck size={14} />
        Made a mistake later? You can fix it, and the history stays.
      </p>
    </form>
  );
}
