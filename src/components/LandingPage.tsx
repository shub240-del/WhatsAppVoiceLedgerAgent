import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, Mic, Undo2 } from "lucide-react";
import { Modal } from "./Modal";
import "@fontsource/mukta/400.css";
import "@fontsource/mukta/600.css";
import "@fontsource/mukta/700.css";
import "@fontsource/mukta/800.css";
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

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

/* ---------- Live demo: a spoken entry becomes a line in the khata ---------- */

type Row = { name: string; paise: number };
type Line = { name: string; note: string; paise: number; struck?: boolean };
type Step =
  | { from: "owner"; text: string; voice?: boolean }
  | { from: "bot"; text: string; options?: string[]; undo?: boolean }
  | { from: "ledger"; rows: Row[]; line?: Line; focus: string };

const START: Row[] = [
  { name: "Ramesh", paise: 90000 },
  { name: "Sunita", paise: 65000 },
  { name: "Priya", paise: 12000 },
];

// Replies are the assistant's real wording; the amounts follow from START.
const SCENARIOS: { id: string; label: string; steps: Step[] }[] = [
  {
    id: "udhaar",
    label: "Udhaar diya",
    steps: [
      { from: "owner", text: "Ramesh ko 340 ka udhaar, do Maggi aur doodh", voice: true },
      { from: "bot", text: "Ramesh: +₹340 (Maggi, doodh). Total baaki: ₹1,240." },
      {
        from: "ledger",
        focus: "Ramesh",
        rows: [{ name: "Ramesh", paise: 124000 }, START[1], START[2]],
        line: { name: "Ramesh", note: "Maggi, doodh", paise: 34000 },
      },
    ],
  },
  {
    id: "payment",
    label: "Paisa mila",
    steps: [
      { from: "owner", text: "Sunita ne 200 diye", voice: true },
      { from: "bot", text: "Sunita: ₹200 mile. Total baaki: ₹450." },
      {
        from: "ledger",
        focus: "Sunita",
        rows: [START[0], { name: "Sunita", paise: 45000 }, START[2]],
        line: { name: "Sunita", note: "Payment", paise: -20000 },
      },
    ],
  },
  {
    id: "new",
    label: "New customer",
    steps: [
      { from: "owner", text: "Kishore ko 250 ka udhaar", voice: true },
      { from: "bot", text: "“Kishore” naam ka koi customer nahi hai. Naya customer banakar ₹250 udhaar likhun?", options: ["Haan, Kishore ko jodo", "Nahi"] },
      { from: "owner", text: "Haan, Kishore ko jodo" },
      { from: "bot", text: "Kishore naye customer jud gaye. Kishore: +₹250. Total baaki: ₹250." },
      {
        from: "ledger",
        focus: "Kishore",
        rows: [...START, { name: "Kishore", paise: 25000 }],
        line: { name: "Kishore", note: "New customer", paise: 25000 },
      },
    ],
  },
  {
    id: "balance",
    label: "Kitna baaki?",
    steps: [
      { from: "owner", text: "Ramesh ka kitna baaki hai?", voice: true },
      { from: "bot", text: "Ramesh ji ka baaki ₹900 hai." },
      { from: "ledger", focus: "Ramesh", rows: START },
    ],
  },
  {
    id: "undo",
    label: "Galti sudhaaro",
    steps: [
      { from: "owner", text: "Sunita ne 2000 diye", voice: true },
      { from: "bot", text: "₹2,000 baaki (₹650) se zyada hai. Advance maanein?", options: ["Haan", "Nahi"] },
      { from: "owner", text: "Nahi" },
      { from: "bot", text: "Theek hai, kuch save nahi kiya." },
      { from: "ledger", focus: "Sunita", rows: START },
    ],
  },
];

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Demo() {
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [shown, setShown] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false);
  const section = useRef<HTMLElement>(null);
  const chat = useRef<HTMLDivElement>(null);

  function play(next = scenario) {
    if (timer.current) clearTimeout(timer.current);
    setScenario(next);
    if (prefersReducedMotion()) {
      setShown(next.steps.length);
      return;
    }
    setShown(0);
    const tick = (n: number) => {
      setShown(n);
      if (n < next.steps.length) timer.current = setTimeout(() => tick(n + 1), n === 0 ? 300 : 1100);
    };
    tick(0);
  }
  // Starts the first time the demo scrolls into view, not before.
  useEffect(() => {
    const el = section.current;
    if (!el || !("IntersectionObserver" in window)) {
      play();
      return;
    }
    const io = new IntersectionObserver((items) => {
      if (items.some((i) => i.isIntersecting) && !started.current) {
        started.current = true;
        play();
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [shown, scenario]);

  const steps = scenario.steps.slice(0, shown);
  const ledger = [...steps].reverse().find((s): s is Extract<Step, { from: "ledger" }> => s.from === "ledger");
  const rows = ledger?.rows ?? START;
  const done = shown >= scenario.steps.length;

  return (
    <section className="l-section l-demo-section" id="demo" ref={section} aria-labelledby="demo-title">
      <div className="l-section-head">
        <h2 id="demo-title">Bolo, aur khata mein likh jaata hai</h2>
        <p>Pick a situation from your day. No sign-up, nothing is saved — this is a demo.</p>
      </div>
      <div className="l-tabs" role="tablist" aria-label="Demo situations">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={s.id === scenario.id}
            aria-controls="demo-stage"
            onClick={() => play(s)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="l-stage" id="demo-stage" role="tabpanel" aria-label={scenario.label}>
        <div className="l-phone" aria-label="Example conversation">
          <div className="l-phone-bar">
            <span className="l-dot" aria-hidden="true" />
            Udhaar assistant
          </div>
          <div className="l-chat" aria-live="polite" ref={chat} tabIndex={0} aria-label="Demo messages">
            {steps.map((s, i) =>
              s.from === "owner" ? (
                <p key={i} className="l-msg owner">
                  {s.voice && <Mic size={13} aria-label="Spoken" />}
                  {s.text}
                </p>
              ) : s.from === "bot" ? (
                <div key={i} className="l-msg bot">
                  <p>{s.text}</p>
                  {s.options && (
                    <span className="l-msg-options">
                      {s.options.map((o) => (
                        <span key={o}>{o}</span>
                      ))}
                    </span>
                  )}
                </div>
              ) : null,
            )}
            {!done && shown > 0 && steps[steps.length - 1]?.from === "owner" && (
              <p className="l-msg bot l-typing" aria-label="Assistant is replying">
                <i />
                <i />
                <i />
              </p>
            )}
          </div>
          <div className="l-phone-input" aria-hidden="true">
            <span className="l-mic">
              <Mic size={16} />
            </span>
            <span>Bolo ya likho…</span>
          </div>
        </div>

        <div className="l-khata" aria-label="Khata after this entry">
          <div className="l-khata-head">
            <span>Customer</span>
            <span>Baaki</span>
          </div>
          <ul>
            {rows.map((r) => (
              <li key={r.name} className={ledger?.focus === r.name ? "is-focus" : ""}>
                <span>{r.name}</span>
                <strong>{rupees(r.paise)}</strong>
              </li>
            ))}
          </ul>
          <div className="l-khata-foot">
            {ledger?.line ? (
              <p className="l-written" key={`${scenario.id}-line`}>
                <span>{ledger.line.name}</span>
                <span>{ledger.line.note}</span>
                <strong className={ledger.line.paise > 0 ? "due" : "got"}>
                  {ledger.line.paise > 0 ? "+" : "−"}
                  {rupees(Math.abs(ledger.line.paise))}
                </strong>
              </p>
            ) : (
              <p className="l-written-empty">
                {done ? "Nothing new written. The khata only changes when you confirm." : "Waiting for your words…"}
              </p>
            )}
          </div>
        </div>
      </div>
      <button className="l-btn l-btn-ghost l-replay" onClick={() => play()}>
        Play again
      </button>
    </section>
  );
}

/* ---------- Static product frame for the hero (the real app's Home screen) ---------- */

function ProductFrame() {
  return (
    <div className="l-frame" role="img" aria-label="Udhaar home screen: total to collect, Udhaar diya and Paisa mila buttons, the voice assistant and recent entries">
      <div className="l-frame-side" aria-hidden="true">
        <b>Sharma Kirana</b>
        <i className="on">Home</i>
        <i>Customers</i>
        <i>Entries</i>
        <i>Settings</i>
        <em>
          <Mic size={12} /> Speak an entry
        </em>
      </div>
      <div className="l-frame-main" aria-hidden="true">
        <div className="l-frame-card l-frame-balance">
          <div>
            <small>You’ll get</small>
            <b>₹1,490</b>
            <small>2 of 4 customers owe you</small>
          </div>
          <span className="give">Udhaar diya</span>
          <span className="got">Paisa mila</span>
        </div>
        <div className="l-frame-card l-frame-chat">
          <span className="owner">Ramesh ko 340 ka udhaar</span>
          <span className="bot">Ramesh: +₹340. Total baaki: ₹1,240.</span>
        </div>
        <div className="l-frame-card l-frame-rows">
          {[
            ["R", "Ramesh", "Maggi, doodh", "+₹340", "due"],
            ["S", "Sunita", "by voice", "−₹200", "got"],
            ["P", "Priya", "Atta 5kg", "+₹120", "due"],
          ].map(([i, n, d, a, c]) => (
            <span key={n}>
              <em>{i}</em>
              <b>{n}</b>
              <small>{d}</small>
              <strong className={c}>{a}</strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

const STEPS = [
  ["Bolo", "Tap the mic and say it the way you would to a helper: “Ramesh ko 340 ka udhaar.”"],
  ["Dekho", "Udhaar shows the customer, the amount and the new balance. If anything is unclear, it asks you."],
  ["Ho gaya", "It’s written in that customer’s khata. Said something wrong? Tap Undo."],
] as const;

const FEATURES = [
  ["Your language", "Hindi, Hinglish, Marathi and Gujarati, with English words like “Surf” and “Maggi” mixed in."],
  ["Never guesses", "Two Rameshes? An unclear amount? It asks before saving, so the khata stays right."],
  ["Reminders on WhatsApp", "One tap sends the exact amount due from your own WhatsApp. Udhaar never messages anyone itself."],
  ["Mistakes are easy to fix", "Undo the last entry, fix an amount, or cancel one. The old line stays in history."],
  ["No app to install", "Opens in your phone’s browser. Your khata is there on any phone you sign in on."],
  ["Only you can see it", "Your shop is private to your account. Download all entries as a spreadsheet any time."],
] as const;

const TRADES = ["Kirana", "Doodh dairy", "Medical store", "Hardware", "Sabzi mandi", "Stationery", "Mobile recharge", "Chai stall"];

const FAQS = [
  ["Is it really free?", "Yes. Udhaar is free while we’re in pilot, with no card needed. If that ever changes, you’ll be told well in advance and your khata stays yours."],
  ["Do I need to install anything?", "No. It works in Chrome or any phone browser. You can add it to your home screen like an app."],
  ["What if it hears the name or amount wrong?", "It shows you what it understood before saving. If it isn’t sure, it asks. Anything saved can be undone or fixed."],
  ["Will my customers get messages from Udhaar?", "No. Udhaar never messages your customers. The WhatsApp reminder button opens your own WhatsApp, and you decide whether to send it."],
  ["Which languages does it understand?", "Hindi and Hinglish, Marathi and Gujarati. You choose your language when you open your khata, and you can change it later."],
] as const;

export function LandingPage({ onStart, onLogin }: { onStart(): void; onLogin(): void }) {
  const [policy, setPolicy] = useState<"privacy" | "terms" | null>(null);
  return (
    <div className="l-page">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="l-header">
        <div className="l-wrap l-header-inner">
          <SiteLogo />
          <nav className="l-nav" aria-label="Website navigation">
            <a href="#demo">Demo</a>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="l-header-actions">
            <button className="l-btn l-btn-ghost" onClick={onLogin}>
              Log in
            </button>
            <button className="l-btn l-btn-primary" onClick={onStart}>
              Try it free
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="l-hero l-wrap">
          <p className="l-kicker">Voice khata for kirana shops</p>
          <h1>Bolo. Udhaar likh gaya.</h1>
          <p className="l-lead">
            Diary band karo. Say “Ramesh ko 340 ka udhaar” and Udhaar writes it in Ramesh’s khata, with the new
            balance — in your own language.
          </p>
          <div className="l-cta">
            <button className="l-btn l-btn-primary l-btn-lg" onClick={onStart}>
              Try it free
            </button>
            <a className="l-btn l-btn-ghost l-btn-lg" href="#demo">
              See the demo
            </a>
          </div>
          <p className="l-note">No sign-up to try. Works in your phone’s browser.</p>
          <ul className="l-langs" aria-label="Languages">
            <li lang="hi-Latn">Hinglish</li>
            <li lang="mr">मराठी</li>
            <li lang="gu">ગુજરાતી</li>
          </ul>
          <ProductFrame />
        </section>

        <section className="l-section l-wrap l-problem" aria-labelledby="problem-title">
          <h2 id="problem-title">Rush ke time diary kaun likhe?</h2>
          <div className="l-problem-grid">
            <p>
              <strong>Pages get lost.</strong> A torn page or a wet diary, and a month of udhaar is gone.
            </p>
            <p>
              <strong>Entries get missed.</strong> Five customers at the counter, and the 40 rupees of doodh never gets written.
            </p>
            <p>
              <strong>Totals start fights.</strong> “Itna kaise hua?” Adding up old pages takes time and trust.
            </p>
          </div>
          <p className="l-problem-answer">Udhaar fixes this with your voice. No typing, no diary, no app to install.</p>
        </section>

        <div className="l-wrap">
          <Demo />
        </div>

        <section className="l-section l-wrap" id="how" aria-labelledby="how-title">
          <div className="l-section-head">
            <h2 id="how-title">How it works</h2>
            <p>Three steps, about five seconds.</p>
          </div>
          <ol className="l-steps">
            {STEPS.map(([title, text], i) => (
              <li key={title}>
                <span className="l-fig">Step {i + 1}</span>
                <strong>{title}</strong>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="l-section l-wrap" id="features" aria-labelledby="features-title">
          <div className="l-section-head">
            <h2 id="features-title">Everything a khata needs. Nothing it doesn’t.</h2>
          </div>
          <div className="l-features">
            {FEATURES.map(([title, text]) => (
              <div key={title}>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="l-section l-wrap l-trades" aria-labelledby="trades-title">
          <h2 id="trades-title">Har dukaan ke liye</h2>
          <ul>
            {TRADES.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <section className="l-section l-wrap l-pricing" id="pricing" aria-labelledby="pricing-title">
          <div className="l-section-head">
            <h2 id="pricing-title">Free while we’re in pilot</h2>
            <p>No card. No setup fee. No commission on your sales.</p>
          </div>
          <div className="l-plan">
            <div>
              <strong>₹0</strong>
              <span>per month</span>
            </div>
            <ul>
              {["Unlimited customers and entries", "Voice in Hindi, Marathi and Gujarati", "WhatsApp reminders you send", "Download your khata any time"].map((f) => (
                <li key={f}>
                  <Check size={15} aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <button className="l-btn l-btn-primary l-btn-lg" onClick={onStart}>
              Try it free
            </button>
          </div>
        </section>

        <section className="l-section l-wrap l-about" aria-labelledby="about-title">
          <h2 id="about-title">Built for one job</h2>
          <p>
            Udhaar does one thing: keep the udhaar of a small shop right, by voice. It doesn’t hold your money or connect
            to your bank. Speech recognition is by <strong>Gnani.ai</strong>, built for Indian languages, and Google
            Gemini understands what was said. Amounts are always checked against your exact words before anything is saved.
          </p>
        </section>

        <section className="l-section l-wrap" id="faq" aria-labelledby="faq-title">
          <div className="l-section-head">
            <h2 id="faq-title">Questions shopkeepers ask</h2>
          </div>
          <div className="l-faq">
            {FAQS.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="l-final l-wrap" aria-labelledby="final-title">
          <h2 id="final-title">Aaj ki pehli entry bol ke dekho.</h2>
          <button className="l-btn l-btn-primary l-btn-lg" onClick={onStart}>
            Try it free
          </button>
          <p className="l-note">Takes a minute. Sign up only when you want to save.</p>
        </section>
      </main>

      <footer className="l-footer">
        <div className="l-wrap l-footer-grid">
          <div>
            <SiteLogo footer />
            <p>Voice khata for kirana shops.</p>
          </div>
          <nav aria-label="Product">
            <h3>Product</h3>
            <a href="#demo">Demo</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <nav aria-label="Account">
            <h3>Account</h3>
            <button onClick={onStart}>Try it free</button>
            <button onClick={onLogin}>Log in</button>
          </nav>
          <nav aria-label="Legal">
            <h3>Legal</h3>
            <button onClick={() => setPolicy("privacy")}>Privacy</button>
            <button onClick={() => setPolicy("terms")}>Terms</button>
          </nav>
        </div>
        <div className="l-wrap l-footer-base">Voice by Gnani.ai. Made in India for small shops.</div>
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
