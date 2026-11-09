import { useEffect, useState } from "react";
import { ArrowRight, AudioLines, Check, Mic } from "lucide-react";
import { Modal } from "./Modal";
import "../landing.css";

export function SiteLogo({ footer = false }: { footer?: boolean }) {
  return (
    <a href="#" className={`l-logo ${footer ? "l-logo-light" : ""}`} aria-label="Udhaar home">
      <span>
        <AudioLines size={16} strokeWidth={2.2} />
      </span>
      udhaar
    </a>
  );
}

// One short scripted exchange, so a visitor understands the product in five seconds.
const DEMO = [
  { from: "owner", text: "Ramesh ko 340 ka udhaar likh do, do Maggi aur doodh" },
  { from: "bot", text: "Ramesh: +₹340 (Maggi, doodh). Total baaki: ₹1,240." },
  { from: "owner", text: "Sunita ne 200 diye" },
  { from: "bot", text: "Sunita: ₹200 mile. Total baaki: ₹450." },
] as const;

function Demo() {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(DEMO.length);
      return;
    }
    const t = setInterval(() => setShown((n) => (n >= DEMO.length ? 1 : n + 1)), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="l-demo" aria-label="Example conversation">
      <div className="l-demo-head">
        <span className="l-dot" />
        Udhaar assistant
      </div>
      <div className="l-demo-log">
        {DEMO.slice(0, shown).map((m, i) => (
          <p key={i} className={`l-bubble ${m.from}`}>
            {m.from === "owner" && <Mic size={12} />}
            {m.text}
          </p>
        ))}
      </div>
    </div>
  );
}

const STEPS = [
  ["Speak", "Say the entry the way you talk — Hinglish, Marathi or Gujarati."],
  ["Check", "Udhaar shows the customer, amount and new balance. Unclear? It asks."],
  ["Done", "Saved to the customer’s khata. Undo anytime."],
];

export function LandingPage({ onStart, onLogin }: { onStart(): void; onLogin(): void }) {
  const [policy, setPolicy] = useState<"privacy" | "terms" | null>(null);
  return (
    <div className="l-page">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="l-header">
        <SiteLogo />
        <div className="l-header-actions">
          <button className="l-btn l-btn-ghost" onClick={onLogin}>
            Log in
          </button>
          <button className="l-btn l-btn-primary" onClick={onStart}>
            Start free
          </button>
        </div>
      </header>

      <main id="main-content">
        <section className="l-hero">
          <div>
            <p className="l-kicker">Voice khata for kirana shops</p>
            <h1>Bolo. Udhaar likh gaya.</h1>
            <p className="l-lead">
              Speak an entry in your own language. Udhaar keeps every customer’s balance — no typing, no
              notebook.
            </p>
            <div className="l-cta">
              <button className="l-btn l-btn-primary l-btn-lg" onClick={onStart}>
                Open my khata
                <ArrowRight size={16} />
              </button>
              <span className="l-note">Free · Sign in with Google</span>
            </div>
            <ul className="l-langs" aria-label="Languages">
              <li>Hinglish</li>
              <li>मराठी</li>
              <li>ગુજરાતી</li>
            </ul>
          </div>
          <Demo />
        </section>

        <section className="l-steps" aria-labelledby="how">
          <h2 id="how">How it works</h2>
          <ol>
            {STEPS.map(([title, text], i) => (
              <li key={title}>
                <span>{i + 1}</span>
                <strong>{title}</strong>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="l-trust">
          {["Never guesses a name or amount", "Only you see your shop", "Every change kept in history"].map((t) => (
            <p key={t}>
              <Check size={15} />
              {t}
            </p>
          ))}
        </section>
      </main>

      <footer className="l-footer">
        <span>© Udhaar · Voice by Gnani.ai</span>
        <span>
          <button onClick={() => setPolicy("privacy")}>Privacy</button>
          <button onClick={() => setPolicy("terms")}>Terms</button>
        </span>
      </footer>

      {policy && (
        <Modal title={policy === "privacy" ? "How we handle your records" : "What to expect"} close={() => setPolicy(null)}>
          <div className="help-content">
            {policy === "privacy" ? (
              <>
                <h3>What you add</h3>
                <p>Your account uses your email address. Your shop stores customer names, optional phone numbers, entries and a history of changes.</p>
                <h3>Who can see it</h3>
                <p>Only the signed-in owner of the shop. Voice notes are sent to Gnani for speech-to-text and the text to Google Gemini to understand the entry.</p>
                <h3>Messages</h3>
                <p>Udhaar does not message your customers. Adding a phone number does not sign anyone up.</p>
                <p className="subtle">This overview is not a legally reviewed privacy policy.</p>
              </>
            ) : (
              <>
                <h3>What Udhaar does</h3>
                <p>Keeps track of customer credit and payments for one shop that only you can see.</p>
                <h3>What it doesn’t do</h3>
                <p>It does not hold money, connect to your bank, or replace accounting advice. Never enter bank or card details.</p>
                <h3>Your part</h3>
                <p>Only add customer details you are allowed to use, and check entries for accuracy.</p>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
