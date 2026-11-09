import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { api } from "../lib/api";

const LANGUAGES = [
  { id: "hinglish", label: "Hindi / Hinglish", sample: "Ramesh ko 340 ka udhaar" },
  { id: "mr", label: "मराठी Marathi", sample: "रमेशला ३४० उधार" },
  { id: "gu", label: "ગુજરાતી Gujarati", sample: "રમેશને ૩૪૦ ઉધાર" },
] as const;

/** First and only onboarding step: shop name and the language the owner speaks. */
export function CreateShop({ onCreated }: { onCreated(): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<(typeof LANGUAGES)[number]["id"]>("hinglish");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const shopName = String(new FormData(e.currentTarget).get("shopName")).trim();
    setError("");
    if (shopName.length < 2) {
      setError("Please enter your shop’s name.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/onboarding/shop", { shopName, language });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your shop could not be created. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="k-onboard" onSubmit={submit}>
      <div>
        <h2>Open your khata</h2>
        <p className="k-muted">Two quick questions. You can change both later.</p>
      </div>
      <label className="k-field">
        Shop name
        <input name="shopName" required minLength={2} maxLength={80} placeholder="e.g. Sharma General Store" autoFocus />
      </label>
      <fieldset className="k-field k-lang">
        <legend>Which language do you speak in the shop?</legend>
        {LANGUAGES.map((l) => (
          <label key={l.id} className={language === l.id ? "on" : ""}>
            <input type="radio" name="language" value={l.id} checked={language === l.id} onChange={() => setLanguage(l.id)} />
            <strong>{l.label}</strong>
            <small>“{l.sample}”</small>
          </label>
        ))}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="k-btn k-btn-primary k-btn-block" disabled={busy}>
        {busy && <LoaderCircle size={16} className="spin" />}
        Open my khata
        <ArrowRight size={15} />
      </button>
    </form>
  );
}
