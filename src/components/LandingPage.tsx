import { useState } from "react";
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
    "What can I use today?",
    "The owner dashboard supports customer records, credits, payments, balances, full ledger history, and reason-required corrections. Access requires a Firebase owner account, a linked shop, and a configured secure API.",
  ],
  [
    "Does the WhatsApp voice agent work yet?",
    "The voice-first workflow is implemented and tested locally, but live WhatsApp, speech-to-text, and Gemini access require provider setup and verification. The examples on this website are interactive illustrations, not live AI responses.",
  ],
  [
    "How do I get my shop set up?",
    "Choose Get started to create your owner account. During the pilot, an onboarding administrator securely provisions and links your shop. The setup guide gives you your owner ID and lets you check when access is ready.",
  ],
  [
    "How are my customers and their balances organized?",
    "Keep each customer’s name, optional familiar landmark or alias, current balance, and ledger history together in your shop workspace.",
  ],
  [
    "What happens if I enter the wrong amount?",
    "You can reverse an entry with a reason, or correct it by creating a linked reversal and replacement. The original stays visible, so you have a clear record of what changed and why.",
  ],
  [
    "Can other shop owners see my customers?",
    "Access is designed around one authenticated owner and one shop. The API derives the shop from trusted membership, and Firestore rules deny cross-shop reads and direct financial writes. Production rules must be published before a live rollout.",
  ],
  [
    "Will my customers get automatic payment reminders?",
    "No. Outbound customer reminders are disabled by policy. They will not be enabled without written Meta/BSP approval, appropriate consent, and a separate reviewed release.",
  ],
  [
    "Do you collect payments or access my bank account?",
    "No. Udhaar keeps records; it does not hold funds or connect to your bank account. A recorded payment changes the ledger only when the owner submits it. Opening a UPI link is not proof of payment.",
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
  return (
    <div className="hero-product" aria-label="Illustrative voice-to-ledger workflow">
      <div className="hero-orbit orbit-outer" />
      <div className="hero-orbit orbit-inner" />
      <div className="hero-product-label">
        <span />A LITTLE PREVIEW OF A SIMPLER DAY
      </div>
      <div className="hero-chat">
        <div className="hero-chat-head">
          <span className="hero-bot">
            <AudioLines size={21} />
          </span>
          <div>
            <strong>Udhaar assistant</strong>
            <small>Your shop’s private khata</small>
          </div>
          <span className="hero-chat-sample">EXAMPLE</span>
        </div>
        <div className="hero-chat-body">
          <span className="chat-day">A day at your shop</span>
          <div className="hero-audio">
            <span className="audio-play">
              <Play size={16} fill="currentColor" />
            </span>
            <Wave />
            <span className="audio-time">0:08</span>
            <CheckCheck size={15} />
          </div>
          <div className="hero-transcript">
            <span>YOU SAY</span>
            <p>
              “Ramesh ko 340 rupaye
              <br />
              ka udhaar likh do.”
            </p>
            <small>One voice note. One clear entry.</small>
          </div>
          <div className="hero-reply">
            <span className="reply-check">
              <Check size={16} />
            </span>
            <div>
              <strong>Samajh gaya.</strong>
              <p>
                Ramesh ji ke khate mein ₹340 add.
                <br />
                Ab total baaki <b>₹1,260.</b>
              </p>
              <small>Galti ho toh “GALAT” likhein.</small>
            </div>
            <CheckCheck className="chat-checks" size={14} />
          </div>
        </div>
        <div className="hero-chat-foot">
          <LockKeyhole size={12} />
          <span>Illustrative example · Live setup required</span>
        </div>
      </div>
      <div className="hero-float">
        <span>
          <ShieldCheck size={19} />
        </span>
        <div>
          <strong>Every rupee, accounted for.</strong>
          <small>Clear records. Complete history.</small>
        </div>
      </div>
      <div className="hero-written-note">
        <span>
          Less typing,
          <br />
          more living.
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
    result: "Ramesh ji ke account mein ₹340 add kiye gaye. Ab total baaki ₹1,260 hai.",
    balance: "₹920 + ₹340 = ₹1,260",
    icon: ArrowUpRight,
  },
  {
    name: "Record a payment",
    action: "Payment received",
    text: "Ramesh ne 200 rupaye diye.",
    amount: "₹200",
    result: "Ramesh ji se ₹200 mile. Ab baaki ₹720 hai.",
    balance: "₹920 − ₹200 = ₹720",
    icon: ArrowDownLeft,
  },
  {
    name: "Check a balance",
    action: "Balance query",
    text: "Ramesh ka kitna baaki hai?",
    amount: "Read only",
    result: "Ramesh ji ka baaki ₹920 hai. Saath mein pichli entries ka hisaab.",
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
            01 / THE WORDS YOU SAY
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
              ? "Try this example"
              : stage === 1
                ? "Show example confirmation"
                : "Replay example"}
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="demo-outcome" aria-live="polite">
          <span className="site-kicker">
            {stage === 0
              ? "02 / A CLEARER PICTURE"
              : stage === 1
                ? "02 / CHECK BEFORE YOU COUNT"
                : "03 / AN EXACT CONFIRMATION"}
          </span>
          {stage === 0 ? (
            <div className="demo-waiting">
              <AudioLines size={40} strokeWidth={1.3} />
              <h3>Your words. A clear next step.</h3>
              <p>
                Try an example to see how the workflow is designed to turn a simple sentence into a
                checked entry.
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
                If a name or amount is unclear, ask. Never guess.
              </p>
            </div>
          ) : (
            <div className="demo-complete">
              <span>
                <Check size={24} />
              </span>
              <h3>Clear words. Clear hisaab.</h3>
              <p>{example.result}</p>
              <div>{example.balance}</div>
              <small>Example confirmation—not a saved transaction.</small>
            </div>
          )}
        </div>
      </div>
      <p className="demo-disclosure">
        <CircleCheck size={13} />
        Interactive illustration only. Nothing is sent to WhatsApp or written to a ledger.
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
          Your private Udhaar workspace
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
            <strong>Your khata, protected.</strong>
            <small>One shop. One private space.</small>
          </div>
        </aside>
        <div className="preview-main">
          <span className="site-kicker">EVERYTHING IN ITS RIGHT PLACE</span>
          <h3>
            {tab === "Overview"
              ? "Your khata, at a glance."
              : tab === "Customers"
                ? "People behind the numbers."
                : "Every entry. Every detail."}
          </h3>
          <p>Clarity for your shop. Room for your day.</p>
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
              Explore the workspace
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
              Get started
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
              Get started
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => {
                setMenu(false);
                onLogin();
              }}
            >
              Log in to your shop
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
              MADE FOR YOUR EVERYDAY DUKAAN
            </div>
            <h1>
              Less hisaab.
              <br />
              <em>More dukaan.</em>
            </h1>
            <p className="hero-description">
              You know your customers by name.
              <br />
              Your khata should feel just as simple.
            </p>
            <p className="hero-explainer">
              A clearer way to keep track of credit, payments, and the people behind them. A digital
              khata today. A WhatsApp-first voice workflow, built for what comes next.
            </p>
            <div className="hero-ctas">
              <button className="site-button site-button-green" onClick={onStart}>
                Get started
                <ArrowRight size={17} />
              </button>
              <a href="#demo" className="site-watch">
                <span>
                  <Play size={12} fill="currentColor" />
                </span>
                See it in action
              </a>
            </div>
            <div className="hero-assurance">
              <span>
                <ShieldCheck size={15} />
                Private to your shop
              </span>
              <i />
              <span>
                <Undo2 size={15} />
                Mistakes stay reversible
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
              <strong>Clarity starts with the dashboard.</strong>
              <span>
                {" "}
                Owner accounts and ledger tools are available for configured pilot shops.
              </span>
            </p>
          </div>
          <a href="#faq">
            Voice & WhatsApp setup details
            <ArrowUpRight size={14} />
          </a>
        </div>
        <section className="site-how site-section site-container" id="how-it-works">
          <div className="section-intro">
            <span className="site-kicker">FAMILIAR WORDS. A SIMPLER ROUTINE.</span>
            <h2>
              Your day is busy.
              <br />
              Your khata doesn’t have to be.
            </h2>
            <p>
              From your first customer to your last entry of the day,
              <br className="site-desktop-break" /> keep the important things clear.
            </p>
          </div>
          <div className="how-grid">
            {[
              {
                n: "01",
                title: "Speak naturally.",
                copy: "Say the customer’s name, amount, and whether it is credit or a payment. Voice is part of the connected pilot and requires setup.",
                icon: Mic,
                foot: "Your everyday words",
              },
              {
                n: "02",
                title: "AI understands your entry.",
                copy: "The workflow checks the customer, amount, and action. Unclear details should be reviewed, not guessed.",
                icon: AudioLines,
                foot: "Review before it counts",
              },
              {
                n: "03",
                title: "Your khata updates after validation.",
                copy: "Once confirmed, the entry updates the ledger. Review the history later and correct mistakes with a reason.",
                icon: BookOpen,
                foot: "A clear record, kept together",
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
                <span className="site-kicker">LESS CLUTTER. MORE CLARITY.</span>
                <h2>
                  Everything a good
                  <br />
                  khata should remember.
                </h2>
              </div>
              <p>
                Not an accounting course. Not another complicated app.
                <br />
                Just the essentials, thoughtfully kept together.
              </p>
            </div>
            <div className="feature-grid">
              <article className="feature-card feature-people">
                <span className="feature-icon">
                  <UsersRound size={23} />
                </span>
                <h3>People, not account numbers.</h3>
                <p>
                  Names, familiar landmarks, and aliases. Keep each customer’s balance and complete
                  history together.
                </p>
                <div className="feature-customer-visual" aria-hidden="true">
                  <div className="feature-person">
                    <span>R</span>
                    <div>
                      <strong>A familiar name</strong>
                      <small>A landmark you remember</small>
                    </div>
                    <Check size={15} />
                  </div>
                  <div className="feature-alias">
                    <span>ALSO KNOWN AS</span>
                    <i>The name you use every day</i>
                  </div>
                </div>
                <span className="feature-foot">CUSTOMER MANAGEMENT</span>
              </article>
              <article className="feature-card">
                <span className="feature-icon">
                  <Wallet size={23} />
                </span>
                <h3>Know what’s baaki.</h3>
                <p>
                  Credits, payments, and a running balance. A clear view of what’s owed, without the
                  mental maths.
                </p>
                <div className="feature-equation">
                  <span>Credit</span>
                  <Plus size={15} />
                  <span>Payment</span>
                  <ArrowRight size={15} />
                  <strong>Clarity</strong>
                </div>
                <span className="feature-foot">YOUR OWNER DASHBOARD</span>
              </article>
              <article className="feature-card">
                <span className="feature-icon">
                  <History size={23} />
                </span>
                <h3>A record, not a rewrite.</h3>
                <p>
                  Every correction has a reason. Every reversal keeps the original. Follow the story
                  behind each number.
                </p>
                <div className="feature-timeline">
                  <div>
                    <span />
                    <p>Original entry preserved</p>
                    <Check size={13} />
                  </div>
                  <div>
                    <span />
                    <p>Reason recorded</p>
                    <Check size={13} />
                  </div>
                  <div>
                    <span />
                    <p>Balance updated together</p>
                    <Check size={13} />
                  </div>
                </div>
                <span className="feature-foot">TRACEABLE CORRECTIONS</span>
              </article>
            </div>
          </div>
        </section>
        <section className="site-voice site-section site-container">
          <div className="section-intro">
            <span className="site-kicker">BUILT AROUND THE WAY YOU SPEAK</span>
            <h2>
              “Bas bol diya.
              <br />
              <em>Hisaab ho gaya.</em>”
            </h2>
            <p>
              See the voice-first workflow in a few simple examples.
              <br />A clear amount, a clear customer, and no guessing.
            </p>
          </div>
          <VoiceDemo />
          <div className="voice-pilot-note">
            <Mic size={16} />
            <p>
              <strong>Voice is a connected-pilot feature.</strong> WhatsApp, speech, and AI
              providers require setup and live verification. Until then, manage entries in the
              dashboard.
            </p>
          </div>
        </section>
        <section className="site-dashboard-section" id="workspace-preview">
          <div className="site-container dashboard-section-inner">
            <div className="dashboard-section-copy">
              <span className="site-kicker">THE BIG PICTURE. WITHOUT THE BIG EFFORT.</span>
              <h2>
                A little space
                <br />
                for a lot of clarity.
              </h2>
              <p>
                Open your dashboard. See who’s on your khata, what’s outstanding, and what changed.
                Nothing more complicated than it needs to be.
              </p>
              <ul>
                {[
                  "One view of your shop’s balances",
                  "Customer-wise history, always in reach",
                  "Reason-required corrections and audit logs",
                  "Search, review, and export loaded entries",
                ].map((text) => (
                  <li key={text}>
                    <Check size={15} />
                    {text}
                  </li>
                ))}
              </ul>
              <a className="site-button site-button-outline" href="#/workspace">
                Explore your workspace
                <ArrowUpRight size={16} />
              </a>
              <small>No sample data in your ledger. Ever.</small>
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
            <span className="site-kicker">FOR THE SHOPS THAT KNOW YOUR NAME</span>
            <h2>
              Your customers
              <br />
              aren’t strangers.
              <br />
              <em>Your khata gets it.</em>
            </h2>
            <p>The morning regular. The family next door. The person who says, “Kal de dunga.”</p>
            <p>
              Your shop runs on a kind of trust that a spreadsheet can’t explain. Udhaar is built to
              bring a little order to those everyday accounts—without losing the human part.
            </p>
            <div className="neighbourhood-sign">
              <AudioLines size={21} />
              <span>
                Built for kirana stores.
                <br />
                <strong>And the people who keep them going.</strong>
              </span>
            </div>
          </div>
        </section>
        <section className="site-security-section" id="security">
          <div className="site-container">
            <div className="section-intro">
              <span className="site-kicker">TRUST SHOULD NEVER BE AN AFTERTHOUGHT</span>
              <h2>
                Your shop. Your records.
                <br />
                <em>Thoughtfully protected.</em>
              </h2>
              <p>Simple on the surface. Deliberate about the details.</p>
            </div>
            <div className="security-grid">
              {[
                {
                  icon: LockKeyhole,
                  title: "A private shop boundary.",
                  copy: "Firebase authentication and shop-scoped access rules are designed to keep one owner’s records separate from another’s.",
                },
                {
                  icon: Fingerprint,
                  title: "The numbers don’t guess.",
                  copy: "Server-side validation and atomic ledger updates—not an AI-generated balance—decide what gets recorded.",
                },
                {
                  icon: Undo2,
                  title: "History stays history.",
                  copy: "Corrections add a reversal and a replacement. Original entries stay visible, with a reason and an actor.",
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
              Read our product privacy overview
              <ArrowUpRight size={14} />
            </button>
          </div>
        </section>
        <section className="site-faq site-section site-container" id="faq">
          <div className="faq-intro">
            <span className="site-kicker">A FEW THINGS WORTH KNOWING</span>
            <h2>
              Clear answers.
              <br />
              No small print.
            </h2>
            <p>
              Starting something new should feel familiar.
              <br />
              Here’s where things stand.
            </p>
            <span className="faq-note">
              <MessageCircle size={19} />
              <span>
                Need a hand getting started?
                <br />
                <strong>Your pilot administrator can help.</strong>
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
          <span className="site-kicker">A CLEARER KHATA. A LIGHTER DAY.</span>
          <h2>
            Your dukaan deserves
            <br />
            <em>a simpler khata.</em>
          </h2>
          <p>
            Keep the trust. Make the everyday hisaab a little simpler.
          </p>
          <button className="site-button site-button-light" onClick={onStart}>
            Get started
            <ArrowRight size={17} />
          </button>
          <small>Owner dashboard · Guided pilot onboarding</small>
          <div className="final-cta-circle" />
        </section>
      </main>
      <footer className="site-footer">
        <div className="site-container">
          <div className="footer-main">
            <div>
              <SiteLogo />
              <p>
                Apna udhaar ka hisaab.
                <br />A little simpler, every day.
              </p>
            </div>
            <div>
              <strong>Explore</strong>
              <a href="#how-it-works">How it works</a>
              <a href="#features">Features</a>
              <a href="#demo">Voice workflow</a>
            </div>
            <div>
              <strong>Your khata</strong>
              <button onClick={onStart}>Get started</button>
              <button onClick={onLogin}>Owner login</button>
              <a href="#/workspace">Open workspace</a>
            </div>
            <div>
              <strong>Good to know</strong>
              <a href="#faq">FAQs & pilot access</a>
              <button id="privacy" onClick={() => setPolicy("privacy")}>
                Privacy overview
              </button>
              <button onClick={() => setPolicy("terms")}>Pilot terms</button>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Udhaar. Made for the everyday dukaan.</span>
            <span>
              <ShieldCheck size={13} />
              Clarity, with care.
            </span>
          </div>
        </div>
      </footer>
      {policy && (
        <Modal
          title={
            policy === "privacy" ? "Your records deserve care." : "A clear start to the pilot."
          }
          eyebrow={policy === "privacy" ? "PRODUCT PRIVACY OVERVIEW" : "PILOT ACCESS & LIMITATIONS"}
          close={() => setPolicy(null)}
        >
          <div className="help-content">
            {policy === "privacy" ? (
              <>
                <h3>What the product uses</h3>
                <p>
                  Owner email and authentication details are managed by Firebase Authentication.
                  Customer names, optional phone numbers, ledger entries, consent preferences, and
                  audit records are stored in the shop’s Firestore workspace.
                </p>
                <h3>Access and AI</h3>
                <p>
                  The dashboard requires an authenticated account linked to a shop. Financial
                  changes go through the secure API. When voice providers are connected, the
                  necessary audio, transcript, and shop-scoped customer candidates may be sent to
                  those providers. Provider retention and privacy terms require review before live
                  use.
                </p>
                <h3>No silent tracking or reminders</h3>
                <p>
                  Analytics is not initialized. Customer reminders are disabled by policy. Adding a
                  phone number does not opt anyone into messaging.
                </p>
                <h3>Questions and requests</h3>
                <p>
                  Contact your onboarding administrator for account recovery, access, retention,
                  export, or deletion requests. This is a product overview, not a final legally
                  reviewed privacy policy. A public support contact and legal policy are required
                  before general launch.
                </p>
                <p className="photo-credit">Shop photograph: Zoshua Colah / Unsplash.</p>
              </>
            ) : (
              <>
                <h3>Who the pilot is for</h3>
                <p>
                  Udhaar is an owner-operated record-keeping tool for shops. Creating an account
                  does not create a shop or grant access to another shop. Your administrator must
                  provision and verify membership.
                </p>
                <h3>What is available</h3>
                <p>
                  Dashboard operations require a configured Firebase project and secure API. Voice,
                  WhatsApp, speech, and AI availability depends on approved provider setup. There
                  are no automatic customer reminder sends in this release.
                </p>
                <h3>Your responsibilities</h3>
                <p>
                  Only enter customer information you are authorized to use. Check amounts and
                  confirmations. Do not submit card numbers, bank credentials, or identity
                  documents. Keep your password private.
                </p>
                <h3>Not a payment or accounting service</h3>
                <p>
                  Udhaar does not hold funds, reconcile bank transactions, or replace financial or
                  legal advice. Public pricing and legally reviewed terms have not been finalized.
                  No paid plan is started by creating an account.
                </p>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
