import { useState, useEffect } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  CircleCheck,
  ClipboardList,
  Fingerprint,
  History,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MessageCircle,
  Mic,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  Undo2,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { Modal } from "./Modal";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#security", label: "Why Udhaar" },
  { href: "#faq", label: "FAQs" },
];
const faqs = [
  [
    "What can I do with Udhaar?",
    "Keep customer names, credit, payments, balances, and entry history together in your shop dashboard. You’ll need an owner account and a shop linked through pilot onboarding.",
  ],
  [
    "Can I add entries by WhatsApp voice today?",
    "Not yet. The voice examples here are demos. Live WhatsApp voice needs provider setup and testing before it can be offered.",
  ],
  [
    "How do I get started?",
    "Choose Create account to sign up. During the pilot, an onboarding administrator links your shop. The setup guide shows your next step.",
  ],
  [
    "How do I find a customer’s balance?",
    "Open a customer in your dashboard to see their balance and past entries. Add a familiar landmark to tell customers with similar names apart.",
  ],
  [
    "What if I enter the wrong amount?",
    "Correct the entry with a reason. The original stays in the history, so you can see what changed.",
  ],
  [
    "Can another shop see my records?",
    "Each owner account is linked to a shop, and access controls are designed to keep shop records separate. Ask your onboarding administrator about your pilot’s setup.",
  ],
  [
    "Will Udhaar message my customers?",
    "No. Automatic customer reminders are not available. Adding a phone number does not sign a customer up for messages.",
  ],
  [
    "Can I pay or connect my bank through Udhaar?",
    "No. Udhaar keeps shop records; it does not hold money or connect to your bank. You record a payment after you receive it.",
  ],
];

export function SiteLogo({ footer = false }: { footer?: boolean }) {
  return (
    <a href="#" className={`site-logo ${footer ? "site-logo-light" : ""}`} aria-label="Udhaar home">
      <span>
        <AudioLines size={23} strokeWidth={2.1} />
      </span>
      <strong>
        udhaar<span>.</span>
      </strong>
    </a>
  );
}

function Wave({ playing = false }: { playing?: boolean }) {
  return (
    <div className={`site-wave ${playing ? "is-playing" : ""}`} aria-hidden="true">
      {[
        8, 16, 12, 24, 34, 19, 40, 28, 13, 32, 22, 43, 31, 16, 27, 36, 21, 10, 24, 17, 30, 14, 23,
        9,
      ].map((h, i) => (
        <i key={i} style={{ height: h, animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

function HeroConversation() {
  const [step, setStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(4);
      return;
    }
    if (isPaused) return;

    let timer: NodeJS.Timeout;
    if (step === 0) {
      // Step 0: Voice note appears and waveform plays
      timer = setTimeout(() => setStep(1), 2400);
    } else if (step === 1) {
      // Step 1: Processing "Samajh raha hoon..." indicator
      timer = setTimeout(() => setStep(2), 1700);
    } else if (step === 2) {
      // Step 2: AI response appears
      timer = setTimeout(() => setStep(3), 2000);
    } else if (step === 3) {
      // Step 3: Ledger confirmation card appears
      timer = setTimeout(() => setStep(4), 2200);
    } else if (step === 4) {
      // Step 4: Owner replies "Shukriya!" (pause to read full convo)
      timer = setTimeout(() => setStep(5), 4800);
    } else if (step === 5) {
      // Step 5: Smooth loop restart back to step 0
      timer = setTimeout(() => setStep(0), 500);
    }

    return () => clearTimeout(timer);
  }, [step, isPaused]);

  return (
    <div
      className="hero-product"
      aria-label="Illustrative voice-to-ledger workflow"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="hero-orbit orbit-outer" />
      <div className="hero-orbit orbit-inner" />
      <div className="hero-product-label">
        <span />A quick look at your Khata
      </div>

      <div className="hero-chat whatsapp-window">
        {/* Header */}
        <div className="hero-chat-head whatsapp-header">
          <div className="hero-bot whatsapp-avatar">
            <AudioLines size={20} />
          </div>
          <div className="whatsapp-header-info">
            <div className="whatsapp-title-row">
              <strong>Udhaar Assistant</strong>
              <span className="whatsapp-verified-badge" title="Verified Assistant">✓</span>
            </div>
            <small className="whatsapp-status">
              <span className="status-dot" />
              Your shop’s private khata · Online
            </small>
          </div>
          <button
            className="whatsapp-replay-btn"
            onClick={() => setStep(0)}
            title="Replay conversation loop"
            aria-label="Replay conversation"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* WhatsApp Conversation Stream */}
        <div className="hero-chat-body whatsapp-body">
          <span className="chat-day">TODAY</span>

          {/* MESSAGE 1 — SHOP OWNER (Voice Message Bubble + Transcript) */}
          <div className="whatsapp-msg-row msg-outgoing">
            <div className="whatsapp-bubble bubble-outgoing voice-bubble">
              <div className="hero-audio whatsapp-audio">
                <span className="audio-play">
                  <Play size={15} fill="currentColor" />
                </span>
                <Wave playing={step === 0} />
                <span className="audio-time">0:08</span>
              </div>
              <div className="voice-transcript-box">
                <span className="transcript-label">VOICE TRANSCRIPT</span>
                <p className="transcript-text">“Ramesh ko 340 rupaye ka udhaar likh do.”</p>
                <small className="transcript-sub">“Add ₹340 credit for Ramesh.”</small>
              </div>
              <div className="bubble-meta">
                <span className="bubble-time">10:42 AM</span>
                <CheckCheck size={14} className="msg-check-read" />
              </div>
            </div>
          </div>

          {/* MESSAGE 2 — UDHAAR AI (Processing Indicator then Confirmed Text) */}
          {step === 1 && (
            <div className="whatsapp-msg-row msg-incoming whatsapp-msg-appear">
              <div className="whatsapp-bubble bubble-incoming typing-bubble">
                <div className="typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="typing-text">Samajh raha hoon...</span>
              </div>
            </div>
          )}

          {step >= 2 && (
            <div className="whatsapp-msg-row msg-incoming whatsapp-msg-appear">
              <div className="whatsapp-bubble bubble-incoming ai-text-bubble">
                <p>Samajh gaya! Ramesh ji ke khate mein <strong>₹340</strong> add kar diye gaye hain.</p>
                <div className="bubble-meta">
                  <span className="bubble-time">10:42 AM</span>
                </div>
              </div>
            </div>
          )}

          {/* MESSAGE 3 — LEDGER CONFIRMATION CARD */}
          {step >= 3 && (
            <div className="whatsapp-msg-row msg-incoming whatsapp-msg-appear">
              <div className="whatsapp-bubble bubble-incoming ledger-card-bubble">
                <div className="ledger-card-header">
                  <span className="ledger-card-icon">
                    <CircleCheck size={16} />
                  </span>
                  <div className="ledger-card-title-group">
                    <strong>Ramesh — Transaction recorded</strong>
                    <span className="ledger-card-badge">CREDIT</span>
                  </div>
                </div>
                <div className="ledger-card-grid">
                  <div className="ledger-card-row">
                    <span>Credit added:</span>
                    <strong className="text-credit">+₹340</strong>
                  </div>
                  <div className="ledger-card-row">
                    <span>Previous balance:</span>
                    <span>₹920</span>
                  </div>
                  <div className="ledger-card-row total-row">
                    <span>New outstanding:</span>
                    <strong>₹1,260</strong>
                  </div>
                </div>
                <div className="ledger-card-footer">
                  <span className="ledger-status-tag">
                    <Check size={12} strokeWidth={2.5} />
                    Status: Successfully recorded
                  </span>
                  <span className="bubble-time">10:42 AM</span>
                </div>
              </div>
            </div>
          )}

          {/* MESSAGE 4 — OWNER REPLY */}
          {step >= 4 && (
            <div className="whatsapp-msg-row msg-outgoing whatsapp-msg-appear">
              <div className="whatsapp-bubble bubble-outgoing text-bubble">
                <p>Shukriya! 🙏</p>
                <div className="bubble-meta">
                  <span className="bubble-time">10:43 AM</span>
                  <CheckCheck size={14} className="msg-check-read" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Disclaimer */}
        <div className="hero-chat-foot">
          <LockKeyhole size={12} />
          <span>Example only · Not a live entry</span>
        </div>
      </div>



      <div className="hero-written-note">
        <span>
          Instant voice khata,
          <br />
          zero typing.
        </span>
        <svg width="51" height="34" viewBox="0 0 51 34" aria-hidden="true">
          <path
            d="M2 3C15 28 32 29 47 17M38 15l10 1-1 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

const examples = [
  {
    name: "Add credit",
    action: "Credit given",
    text: "Ramesh ko 340 rupaye ka udhaar likh do.",
    amount: "₹340",
    result: "₹340 credit added for Ramesh. The example balance is now ₹1,260.",
    balance: "₹920 + ₹340 = ₹1,260",
    icon: ArrowUpRight,
  },
  {
    name: "Record a payment",
    action: "Payment received",
    text: "Ramesh ne 200 rupaye diye.",
    amount: "₹200",
    result: "₹200 payment recorded for Ramesh. The example balance is now ₹720.",
    balance: "₹920 − ₹200 = ₹720",
    icon: ArrowDownLeft,
  },
  {
    name: "Check a balance",
    action: "Balance query",
    text: "Ramesh ka kitna baaki hai?",
    amount: "Read only",
    result: "Ramesh’s example balance is ₹920. No entry is added.",
    balance: "₹920 · no ledger change",
    icon: Wallet,
  },
];

function VoiceDemo() {
  const [selected, setSelected] = useState(0);
  const [stage, setStage] = useState(0);
  const example = examples[selected];
  return (
    <div className="site-demo" id="demo">
      <div className="demo-nav" role="group" aria-label="Choose a voice example">
        {examples.map((item, index) => (
          <button
            key={item.name}
            aria-pressed={selected === index}
            onClick={() => {
              setSelected(index);
              setStage(0);
            }}
          >
            <item.icon size={15} />
            {item.name}
          </button>
        ))}
      </div>
      <div className="demo-content">
        <div className="demo-speech">
          <span className="site-kicker">
            <Mic size={14} />
            01 / SAY IT YOUR WAY
          </span>
          <blockquote>“{example.text}”</blockquote>
          <div className="demo-wave">
            <span className="demo-mic">
              <Mic size={18} />
            </span>
            <Wave playing={stage === 1} />
            <span>Hindi / Hinglish</span>
          </div>
          <button
            className="site-button site-button-green"
            onClick={() => setStage((s) => (s === 2 ? 0 : s + 1))}
          >
            {stage === 2 ? <RefreshCw size={15} /> : <Play size={14} />}
            {stage === 0
              ? "Show this example"
              : stage === 1
                ? "Review this entry"
                : "Start again"}
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="demo-outcome" aria-live="polite">
          <span className="site-kicker">
            {stage === 0
              ? "02 / WHAT UDHAAR PICKS UP"
              : stage === 1
                ? "02 / CHECK THE DETAILS"
                : "03 / SEE THE RESULT"}
          </span>
          {stage === 0 ? (
            <div className="demo-waiting">
              <AudioLines size={40} strokeWidth={1.3} />
              <h3>Say it. Check it. Record it.</h3>
              <p>
                Choose an example to see how a voice entry could look. Nothing here changes a real
                khata.
              </p>
            </div>
          ) : stage === 1 ? (
            <div className="demo-fields">
              <div>
                <span>Customer</span>
                <strong>Ramesh · Near the temple</strong>
              </div>
              <div>
                <span>Action</span>
                <strong>{example.action}</strong>
              </div>
              <div>
                <span>Amount</span>
                <strong>{example.amount}</strong>
              </div>
              <p>
                <ShieldCheck size={15} />
                Check the name and amount before saving.
              </p>
            </div>
          ) : (
            <div className="demo-complete">
              <span>
                <Check size={24} />
              </span>
              <h3>Here’s what would be recorded.</h3>
              <p>{example.result}</p>
              <div>{example.balance}</div>
              <small>Example only. No transaction was saved.</small>
            </div>
          )}
        </div>
      </div>
      <p className="demo-disclosure">
        <CircleCheck size={13} />
        Demo only. Nothing is sent to WhatsApp or added to a real khata.
      </p>
    </div>
  );
}

function DashboardPreview() {
  const [tab, setTab] = useState("Overview");
  return (
    <div
      className="site-workspace-preview"
      aria-label="Dashboard interface preview with no account data"
    >
      <div className="preview-browser">
        <span />
        <span />
        <span />
        <div>
          <LockKeyhole size={10} />
          Udhaar dashboard preview
        </div>
        <span className="preview-label">INTERFACE PREVIEW</span>
      </div>
      <div className="preview-layout">
        <aside>
          <div className="preview-brand">
            <AudioLines size={17} />
            udhaar.
          </div>
          {[
            { label: "Overview", icon: LayoutDashboard },
            { label: "Customers", icon: UsersRound },
            { label: "Ledger", icon: BookOpen },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => setTab(item.label)}
              className={tab === item.label ? "selected" : ""}
              aria-pressed={tab === item.label}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
          <div className="preview-aside-note">
            <ShieldCheck size={21} />
            <strong>Your shop’s records.</strong>
            <small>Only linked shop data appears here.</small>
          </div>
        </aside>
        <div className="preview-main">
          <span className="site-kicker">A CLEAR VIEW OF YOUR SHOP</span>
          <h3>
            {tab === "Overview"
              ? "Your khata, at a glance."
              : tab === "Customers"
                ? "People behind the numbers."
                : "Every entry. Every detail."}
          </h3>
          <p>See balances and entries at a glance.</p>
          <div className="preview-stats">
            {["Outstanding", "Customers", "Ledger entries"].map((label, i) => (
              <div key={label}>
                <small>{label}</small>
                <strong>{i === 0 ? "₹ —" : "—"}</strong>
              </div>
            ))}
          </div>
          <div className="preview-empty">
            <span>
              {tab === "Overview" ? (
                <ClipboardList size={23} />
              ) : tab === "Customers" ? (
                <UsersRound size={23} />
              ) : (
                <BookOpen size={23} />
              )}
            </span>
            <h4>
              {tab === "Customers"
                ? "Your regulars belong here."
                : tab === "Ledger"
                  ? "A story behind every entry."
                  : "A clean page. A clear start."}
            </h4>
            <p>
              Your real records appear after you sign in
              <br />
              and link your shop.
            </p>
            <a href="#/workspace">
              Open dashboard
              <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ onStart, onLogin }: { onStart(): void; onLogin(): void }) {
  const [menu, setMenu] = useState(false);
  const [policy, setPolicy] = useState<"privacy" | "terms" | null>(null);
  return (
    <div className="landing">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <div className="site-container site-header-inner">
          <SiteLogo />
          <nav className="site-desktop-nav" aria-label="Website navigation">
            {links.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className="site-header-actions">
            <button className="site-login" onClick={onLogin}>
              Log in
              <ArrowUpRight size={14} />
            </button>
            <button className="site-button site-button-green site-button-small" onClick={onStart}>
              Create account
              <ArrowRight size={15} />
            </button>
            <button
              className="site-menu-button"
              aria-label={menu ? "Close menu" : "Open menu"}
              aria-expanded={menu}
              aria-controls="site-mobile-menu"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
        {menu && (
          <nav
            id="site-mobile-menu"
            className="site-mobile-nav"
            aria-label="Mobile website navigation"
          >
            {links.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setMenu(false)}>
                {link.label}
                <ArrowRight size={16} />
              </a>
            ))}
            <button
              className="site-mobile-start"
              onClick={() => {
                setMenu(false);
                onStart();
              }}
            >
              Create account
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => {
                setMenu(false);
                onLogin();
              }}
            >
              Log in
              <ArrowRight size={16} />
            </button>
          </nav>
        )}
      </header>
      <main id="main-content">
        <section className="site-hero site-container">
          <div className="hero-copy">
            <div className="site-pilot-tag">
              <span />
              DIGITAL KHATA FOR MODERN SHOPS
            </div>
            <h1>
              Less hisaab.
              <br />
              <em>More dukaan.</em>
            </h1>
            <p className="hero-description">
              Track customer credit, payments, and balances in real time.
            </p>
            <p className="hero-explainer">
              Clean ledger, clear history, and instant balances in one place. Voice entry available in pilot.
            </p>
            <div className="hero-ctas">
              <button className="site-button site-button-green" onClick={onStart}>
                Create account
                <ArrowRight size={17} />
              </button>
              <a href="#demo" className="site-watch">
                <span>
                  <Play size={12} fill="currentColor" />
                </span>
                See a voice example
              </a>
            </div>
            <div className="hero-assurance">
              <span>
                <ShieldCheck size={16} />
                Isolated shop records
              </span>
              <i />
              <span>
                <Undo2 size={16} />
                Full audit trail with reasons
              </span>
            </div>
          </div>
          <HeroConversation />
        </section>
        <div className="site-availability site-container">
          <div>
            <span className="availability-icon">
              <BookOpen size={17} />
            </span>
            <p>
              <strong>Start with your shop dashboard.</strong>
              <span>
                Create an account, then ask your onboarding administrator to link your shop.
              </span>
            </p>
          </div>
          <a href="#faq">
            How voice setup works
            <ArrowUpRight size={14} />
          </a>
        </div>
        <section className="site-how site-section site-container" id="how-it-works">
          <div className="section-intro">
            <span className="site-kicker">THREE SIMPLE STEPS</span>
            <h2>
              Keep your khata clear.
              <br />
              Keep your day moving.
            </h2>
            <p>
              Record each sale on credit and each payment in one place.
            </p>
          </div>
          <div className="how-grid">
            {[
              {
                n: "01",
                title: "Record credit or payment.",
                copy: "Add transactions quickly through your dashboard, or via voice note in supported pilot shops.",
                icon: Mic,
                foot: "Fast and straightforward",
              },
              {
                n: "02",
                title: "Verify customer & amount.",
                copy: "Review the matched customer name, amount, and notes before finalizing to ensure zero errors.",
                icon: AudioLines,
                foot: "You stay in full control",
              },
              {
                n: "03",
                title: "Instant balance updates.",
                copy: "Balances recalculate in real-time in exact paise. Reversals preserve full audit history.",
                icon: BookOpen,
                foot: "Transparent customer ledger",
              },
            ].map((step) => (
              <article key={step.n}>
                <div className="how-top">
                  <span className="how-icon">
                    <step.icon size={25} strokeWidth={1.5} />
                  </span>
                  <span className="how-number">{step.n}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
                <small>
                  <Check size={12} />
                  {step.foot}
                </small>
              </article>
            ))}
          </div>
        </section>
        <section className="site-feature-section" id="features">
          <div className="site-container">
            <div className="section-intro split-intro">
              <div>
                <span className="site-kicker">THE EVERYDAY SHOP RECORDS</span>
                <h2>
                  The essentials,
                  <br />
                  all in one place.
                </h2>
              </div>
              <p>
                No accounting jargon. Just customers, balances, payments, and history.
              </p>
            </div>
            <div className="feature-grid">
              <article className="feature-card feature-people">
                <span className="feature-icon">
                  <UsersRound size={23} />
                </span>
                <h3>Organized customer profiles.</h3>
                <p>
                  Find each customer by name, phone, or landmark. View complete credit history and contact details in seconds.
                </p>
                <div className="feature-customer-visual" aria-hidden="true">
                  <div className="feature-person">
                    <span>R</span>
                    <div>
                      <strong>Ramesh</strong>
                      <small>Near the temple</small>
                    </div>
                    <Check size={15} />
                  </div>
                  <div className="feature-alias">
                    <span>LANDMARK</span>
                    <i>Near the temple</i>
                  </div>
                </div>
                <span className="feature-foot">CUSTOMER PROFILES</span>
              </article>
              <article className="feature-card">
                <span className="feature-icon">
                  <Wallet size={23} />
                </span>
                <h3>Real-time balance totals.</h3>
                <p>
                  Instant paise-accurate calculations for every credit and payment. Know who owes what with zero manual math.
                </p>
                <div className="feature-equation">
                  <span>Credit</span>
                  <Plus size={15} />
                  <span>Payment</span>
                  <ArrowRight size={15} />
                  <strong>Clarity</strong>
                </div>
                <span className="feature-foot">PRECISE KHATA</span>
              </article>
              <article className="feature-card">
                <span className="feature-icon">
                  <History size={23} />
                </span>
                <h3>Audit-logged corrections.</h3>
                <p>
                  Correct any entry with a recorded reason. The original stays in history so your ledger remains completely trustworthy.
                </p>
                <div className="feature-timeline">
                  <div>
                    <span />
                    <p>Original entry kept</p>
                    <Check size={13} />
                  </div>
                  <div>
                    <span />
                    <p>Reason recorded</p>
                    <Check size={13} />
                  </div>
                  <div>
                    <span />
                    <p>Balance recalculated</p>
                    <Check size={13} />
                  </div>
                </div>
                <span className="feature-foot">AUDIT HISTORY</span>
              </article>
            </div>
          </div>
        </section>
        <section className="site-voice site-section site-container">
          <div className="section-intro">
            <span className="site-kicker">A VOICE ENTRY, STEP BY STEP</span>
            <h2>
              Say it once.
              <br />
              <em>Check it before it counts.</em>
            </h2>
            <p>
              See an example of adding credit, recording a payment, or checking a balance.
            </p>
          </div>
          <VoiceDemo />
          <div className="voice-pilot-note">
            <Mic size={16} />
            <p>
              <strong>Voice entry is not live yet.</strong> WhatsApp and voice services need setup
              and testing. For now, pilot shops can record entries in the dashboard.
            </p>
          </div>
        </section>
        <section className="site-dashboard-section" id="workspace-preview">
          <div className="site-container dashboard-section-inner">
            <div className="dashboard-section-copy">
              <span className="site-kicker">YOUR SHOP AT A GLANCE</span>
              <h2>
                Know what’s
                <br />
                happening in your khata.
              </h2>
              <p>
                See outstanding balances, customer histories, and recent changes from your
                dashboard.
              </p>
              <ul>
                {[
                  "See balances across your shop",
                  "Check one customer’s entry history",
                  "Correct mistakes with a reason",
                  "Search and export available records",
                ].map((text) => (
                  <li key={text}>
                    <Check size={15} />
                    {text}
                  </li>
                ))}
              </ul>
              <a className="site-button site-button-outline" href="#/workspace">
                Open dashboard
                <ArrowUpRight size={16} />
              </a>
              <small>Your real records appear after your shop is linked.</small>
            </div>
            <DashboardPreview />
          </div>
        </section>
        <section className="site-neighbourhood site-section site-container">
          <div className="neighbourhood-photo">
            <img
              src={`${import.meta.env.BASE_URL}images/neighbourhood-shop.jpg`}
              alt="A neighbourhood Indian general store, filled with everyday essentials"
              width={1000}
              height={1500}
              loading="lazy"
            />
            <span>SMALL SHOPS. BIG RELATIONSHIPS.</span>
          </div>
          <div className="neighbourhood-copy">
            <span className="site-kicker">MADE FOR LOCAL SHOPS</span>
            <h2>
              You know your
              <br />
              customers.
              <br />
              <em>Keep their khata close.</em>
            </h2>
            <p>The regular from around the corner. The neighbour who’ll pay tomorrow.</p>
            <p>
              Keep everyday credit and payments organized without turning your shop into an
              accounting office.
            </p>
            <div className="neighbourhood-sign">
              <AudioLines size={21} />
              <span>
                Made for everyday shops.
                <br />
                <strong>And the customers they know.</strong>
              </span>
            </div>
          </div>
        </section>
        <section className="site-security-section" id="security">
          <div className="site-container">
            <div className="section-intro">
              <span className="site-kicker">YOUR RECORDS, WITH CARE</span>
              <h2>
                Know what gets recorded.
                <br />
                <em>Keep a clear history.</em>
              </h2>
              <p>See how shop access and corrections work.</p>
            </div>
            <div className="security-grid">
              {[
                {
                  icon: LockKeyhole,
                  title: "Strict shop isolation.",
                  copy: "Each owner account is linked to their own shop. Server-side security rules ensure your records remain private.",
                },
                {
                  icon: Fingerprint,
                  title: "Deterministic math.",
                  copy: "All amounts are calculated in exact integer paise. Balances are derived from verified entries, never AI estimates.",
                },
                {
                  icon: Undo2,
                  title: "Immutable audit trail.",
                  copy: "Every correction records who made it, when, and the reason. Originals remain permanently in history.",
                },
              ].map((item) => (
                <article key={item.title}>
                  <item.icon size={28} strokeWidth={1.4} />
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </article>
              ))}
            </div>
            <button className="site-privacy-link" onClick={() => setPolicy("privacy")}>
              How we handle your records
              <ArrowUpRight size={14} />
            </button>
          </div>
        </section>
        <section className="site-faq site-section site-container" id="faq">
          <div className="faq-intro">
            <span className="site-kicker">QUICK ANSWERS</span>
            <h2>
              Before you
              <br />
              get started.
            </h2>
            <p>
              The important details, in plain language.
            </p>
            <span className="faq-note">
              <MessageCircle size={19} />
              <span>
                Need help getting set up?
                <br />
                <strong>Contact your onboarding administrator.</strong>
              </span>
            </span>
          </div>
          <div className="faq-list">
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <Plus size={18} />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="site-final-cta site-container">
          <div className="final-cta-mark">
            <AudioLines size={36} />
          </div>
          <span className="site-kicker">START WITH A CLEARER KHATA</span>
          <h2>
            Keep your shop’s
            <br />
            <em>hisaab simple.</em>
          </h2>
          <p>
            Create an owner account. We’ll guide you through linking your shop.
          </p>
          <button className="site-button site-button-light" onClick={onStart}>
            Create account
            <ArrowRight size={17} />
          </button>
          <small>Shop access is set up during the pilot.</small>
          <div className="final-cta-circle" />
        </section>
      </main>
      <footer className="site-footer">
        <div className="site-container">
          <div className="footer-main">
            <div>
              <SiteLogo />
              <p>
                A simpler way to keep
                <br />
                your shop’s khata.
              </p>
            </div>
            <div>
              <strong>Explore</strong>
              <a href="#how-it-works">How it works</a>
              <a href="#features">Features</a>
              <a href="#demo">Voice entry example</a>
            </div>
            <div>
              <strong>Your account</strong>
              <button onClick={onStart}>Create account</button>
              <button onClick={onLogin}>Log in</button>
              <a href="#/workspace">Open dashboard</a>
            </div>
            <div>
              <strong>Help & information</strong>
              <a href="#faq">FAQs and pilot setup</a>
              <button id="privacy" onClick={() => setPolicy("privacy")}>
                How we handle your records
              </button>
              <button onClick={() => setPolicy("terms")}>About the pilot</button>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Udhaar. Made for local shops.</span>
            <span>
              <ShieldCheck size={13} />
              Your records, handled with care.
            </span>
          </div>
        </div>
      </footer>
      {policy && (
        <Modal
          title={policy === "privacy" ? "How we handle your records." : "What to expect from the pilot."}
          eyebrow={policy === "privacy" ? "YOUR DATA" : "GETTING STARTED"}
          close={() => setPolicy(null)}
        >
          <div className="help-content">
            {policy === "privacy" ? (
              <>
                <h3>What you add</h3>
                <p>
                  Your account uses your email address. Your shop workspace can store customer
                  names, optional phone numbers, entries, and records of changes.
                </p>
                <h3>Who can access it</h3>
                <p>
                  You need to sign in and have a shop linked to your account to use the dashboard.
                  Voice features are not live yet. If they are enabled in the future, audio or
                  transcripts may be sent to the providers needed to process them.
                </p>
                <h3>Messages and tracking</h3>
                <p>
                  Automatic customer reminders are off. Adding a phone number does not sign a
                  customer up for messages. Product analytics is not set up.
                </p>
                <h3>Need help?</h3>
                <p>
                  Contact your onboarding administrator about account access or your records. This
                  overview is not a legally reviewed privacy policy.
                </p>
                <p className="photo-credit">Shop photograph: Zoshua Colah / Unsplash.</p>
              </>
            ) : (
              <>
                <h3>Creating an account</h3>
                <p>
                  Udhaar helps shop owners keep track of customer credit and payments. Creating an
                  account does not create a shop or give you access to one. An administrator must
                  link your shop.
                </p>
                <h3>What’s available</h3>
                <p>
                  Dashboard access depends on your shop being set up. WhatsApp voice entry is not
                  live yet. Udhaar does not send automatic customer reminders.
                </p>
                <h3>Keep your account safe</h3>
                <p>
                  Only add customer details you are allowed to use. Check entries for accuracy.
                  Never share your password or enter bank credentials or card numbers.
                </p>
                <h3>What Udhaar doesn’t do</h3>
                <p>
                  Udhaar records shop entries; it does not hold money, connect to your bank, or
                  replace accounting or financial advice. Creating an account does not start a paid
                  plan.
                </p>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
