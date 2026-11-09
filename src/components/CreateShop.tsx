import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Mic, Store } from "lucide-react";
import { api } from "../lib/api";

/** Self-serve step: a signed-in owner names their shop. */
export function CreateShop({ onCreated, compact = false }: { onCreated(): void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError("");
    const shopName = String(data.get("shopName")).trim();
    if (shopName.length < 2) {
      setError("Please enter your shop’s name.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/onboarding/shop", { shopName });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your shop could not be created. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={compact ? "create-shop compact" : "panel create-shop"}>
      {!compact && (
        <div className="create-shop-head">
          <span className="shop-icon">
            <Store size={20} />
          </span>
          <div>
            <h2>Name your shop to open your khata</h2>
            <p>Takes 10 seconds.</p>
          </div>
        </div>
      )}
      <form className="form" onSubmit={submit}>
        <label>
          Shop name
          <input name="shopName" required minLength={2} maxLength={80} placeholder="e.g. Sharma General Store" autoFocus />
        </label>
        <p className="form-note">
          <Mic size={14} />
          Next, just speak or type your entries to the assistant on the Home screen.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? <LoaderCircle size={16} className="spin" /> : null}
          Open my khata
          <ArrowRight size={15} />
        </button>
      </form>
    </section>
  );
}
