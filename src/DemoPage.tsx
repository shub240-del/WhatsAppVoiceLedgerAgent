import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  AudioLines,
  Camera,
  Check,
  CheckCheck,
  Mic,
  MoreVertical,
  Paperclip,
  Pause,
  Phone,
  Play,
  RotateCcw,
  SendHorizontal,
  Smile,
  Square,
  Store,
  Video,
  X,
} from "lucide-react";
import { DEMO_HELP, demoReminder, demoReply, demoStart, type DemoCustomer, type DemoState } from "./lib/demo-bot";
import "@fontsource/mukta/400.css";
import "@fontsource/mukta/600.css";
import "@fontsource/mukta/700.css";
import "./demo.css";

/**
 * Full-screen demo of the whole Udhaar idea on WhatsApp:
 *  1. the shop owner speaks three entries and the khata updates,
 *  2. on Sunday each customer gets a voice note in their own language with the amount and a UPI link.
 * Everything runs in this tab (src/lib/demo-bot.ts); nothing reaches the server or moves money.
 */
type Bubble = {
  id: number;
  from: "me" | "bot";
  kind: "text" | "voice";
  text: string;
  time: string;
  secs?: number;
  quote?: string;
  read?: boolean;
};
type StepId = "entry1" | "payment" | "entry2" | "reminder";
const STEPS: { id: StepId; label: string; say?: string }[] = [
  { id: "entry1", label: "Speak an udhaar", say: "Ramesh ne do kilo chawal aur ek Surf liya, udhaar mein" },
  { id: "payment", label: "Speak a payment", say: "Sunita ne 200 diye" },
  { id: "entry2", label: "Speak another udhaar", say: "Priya ko 150 ka udhaar, doodh aur bread" },
  { id: "reminder", label: "Send the Sunday reminders" },
];
const AMOUNT_ANSWER = "230";
const SHOP = "Sharma Kirana";
const WAVE = [6, 12, 9, 16, 20, 11, 18, 24, 14, 8, 17, 22, 13, 19, 10, 15, 21, 12, 7, 14, 18, 9, 13, 6];
const rupees = (paise: number) => `₹${(Math.abs(paise) / 100).toLocaleString("en-IN")}`;
const clock = () => new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
const SpeechRecognitionCtor = (): (new () => Recognition) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Reads the reminder aloud with the phone's own voice for that language (Gnani makes the real one). */
function speakReminder(text: string, lang: string, onEnd: () => void): boolean {
  if (!("speechSynthesis" in window)) return false;
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang.slice(0, 2)));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  if (voice) u.voice = voice;
  u.rate = 0.95;
  u.onend = onEnd;
  u.onerror = onEnd;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return true;
}

export default function DemoPage() {
  const [state, setState] = useState<DemoState>(demoStart);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [status, setStatus] = useState("online");
  const [options, setOptions] = useState<string[]>([]);
  const [done, setDone] = useState<Set<StepId>>(new Set());
  const [changed, setChanged] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<null | { started: number; heard: string }>(null);
  const [now, setNow] = useState(Date.now());
  const [autoplay, setAutoplay] = useState(false);
  // Reminders: a snapshot of who got what on "Sunday", and whose phone we're looking at.
  const [sent, setSent] = useState<DemoCustomer[]>([]);
  const [view, setView] = useState<"owner" | string>("owner");
  const [playing, setPlaying] = useState<string | null>(null);
  const [paying, setPaying] = useState<DemoCustomer | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const doneRef = useRef(done);
  doneRef.current = done;
  const lastConfirm = useRef("");
  const chat = useRef<HTMLDivElement>(null);
  const recognizer = useRef<Recognition | null>(null);
  const stop = useRef(false);
  const id = useRef(0);

  useEffect(() => {
    document.title = "WhatsApp demo · Udhaar";
    // Some browsers load their voice list late; asking early warms it up.
    window.speechSynthesis?.getVoices();
    const t = setTimeout(() => push({ from: "bot", kind: "text", text: DEMO_HELP }), reduced() ? 0 : 500);
    return () => {
      clearTimeout(t);
      stop.current = true;
      recognizer.current?.stop();
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
  }, [bubbles, status, view]);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [recording]);

  function push(b: Omit<Bubble, "id" | "time">) {
    setBubbles((all) => [...all, { ...b, id: ++id.current, time: clock() }]);
  }
  function markStep(event: string | null) {
    if (!event) return;
    const step = STEPS.find(
      (s) => !doneRef.current.has(s.id) && ((event === "credit" && s.id !== "payment" && s.id !== "reminder") || (event === "payment" && s.id === "payment")),
    );
    if (step) setDone((d) => new Set(d).add(step.id));
  }

  async function send(message: string, voice: boolean) {
    const said = message.trim();
    if (!said || busy) return;
    setView("owner");
    setBusy(true);
    setOptions([]);
    const quote = /^(galat|galti|undo)$/i.test(said) && lastConfirm.current ? lastConfirm.current : undefined;
    if (voice && !reduced()) {
      setRecording({ started: Date.now(), heard: said });
      await wait(Math.min(2600, 700 + said.length * 35));
      setRecording(null);
    }
    push({ from: "me", kind: voice ? "voice" : "text", text: said, secs: Math.max(1, Math.round(said.length / 9)), quote });
    await wait(reduced() ? 0 : 450);
    setStatus("typing…");
    await wait(reduced() ? 0 : 1000);
    const result = demoReply(stateRef.current, said);
    setState(result.state);
    setStatus("online");
    setBubbles((all) => all.map((b) => (b.from === "me" ? { ...b, read: true } : b)));
    push({ from: "bot", kind: "text", text: result.reply });
    if (/Total baaki/.test(result.reply)) lastConfirm.current = result.reply.split(". Galat")[0].replace(/^.*naye customer jud gaye\. /, "") + ".";
    setOptions(result.options);
    setChanged(result.changed);
    markStep(result.event);
    setBusy(false);
  }

  async function sendReminders() {
    if (busy) return;
    setView("owner");
    setBusy(true);
    const due = stateRef.current.customers.filter((c) => c.paise > 0);
    setStatus("typing…");
    await wait(reduced() ? 0 : 900);
    setStatus("online");
    push({
      from: "bot",
      kind: "text",
      text:
        `Ravivaar ke reminder bhej diye (${due.length}):\n` +
        due.map((c) => `- ${c.name} ${rupees(c.paise)} · ${demoReminder(c).label}`).join("\n") +
        "\nHar customer ko unki bhasha mein voice note aur UPI link gaya.",
    });
    setSent(due);
    setDone((d) => new Set(d).add("reminder"));
    setBusy(false);
    await wait(reduced() ? 0 : 1600);
    if (due[0]) setView(due[0].name);
  }

  const next = STEPS.find((s) => !done.has(s.id));
  const pendingAmount = state.pending?.kind === "amount";
  const suggestions = options.length ? options : pendingAmount ? [AMOUNT_ANSWER] : next?.say ? [next.say] : [];

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = text;
    setText("");
    void send(value, false);
  }

  function mic() {
    if (busy && !recording) return;
    const Ctor = SpeechRecognitionCtor();
    if (recording && recognizer.current) {
      recognizer.current.stop();
      return;
    }
    if (!Ctor) {
      if (suggestions[0]) void send(suggestions[0], true);
      return;
    }
    const r = new Ctor();
    r.lang = "hi-IN";
    r.interimResults = true;
    let heard = "";
    r.onresult = (e) => {
      heard = Array.from(e.results).map((x) => x[0].transcript).join(" ");
      setRecording((cur) => (cur ? { ...cur, heard } : cur));
    };
    r.onerror = () => setRecording(null);
    r.onend = () => {
      recognizer.current = null;
      setRecording(null);
      if (heard.trim()) void send(heard, true);
    };
    recognizer.current = r;
    setRecording({ started: Date.now(), heard: "" });
    setNow(Date.now());
    r.start();
  }

  function togglePlay(c: DemoCustomer) {
    if (playing === c.name) {
      window.speechSynthesis?.cancel();
      setPlaying(null);
      return;
    }
    const r = demoReminder(c);
    setPlaying(c.name);
    if (!speakReminder(r.speech, r.lang, () => setPlaying(null))) setTimeout(() => setPlaying(null), 4000);
  }

  async function playStory() {
    reset();
    setAutoplay(true);
    stop.current = false;
    await wait(900);
    const script: [string, boolean][] = [
      [STEPS[0].say!, true],
      [AMOUNT_ANSWER, true],
      [STEPS[1].say!, true],
      [STEPS[2].say!, true],
    ];
    for (const [line, voice] of script) {
      if (stop.current) break;
      await send(line, voice);
      await wait(1300);
    }
    if (!stop.current) await sendReminders();
    setAutoplay(false);
  }

  function reset() {
    stop.current = true;
    recognizer.current?.stop();
    window.speechSynthesis?.cancel();
    setState(demoStart());
    setBubbles([]);
    setOptions([]);
    setDone(new Set());
    setChanged(null);
    setStatus("online");
    setRecording(null);
    setBusy(false);
    setSent([]);
    setView("owner");
    setPlaying(null);
    setPaying(null);
    lastConfirm.current = "";
    setTimeout(() => push({ from: "bot", kind: "text", text: DEMO_HELP }), 200);
  }

  const total = state.customers.reduce((n, c) => n + Math.max(c.paise, 0), 0);
  const seconds = recording ? Math.floor((now - recording.started) / 1000) : 0;
  const customer = view === "owner" ? null : sent.find((c) => c.name === view) ?? null;
  const entriesDone = (["entry1", "payment", "entry2"] as StepId[]).every((s) => done.has(s));

  return (
    <div className="wd">
      <header className="wd-bar">
        <a href="#" className="wd-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Udhaar
        </a>
        <span className="wd-title">WhatsApp demo — nothing is saved, no money moves</span>
        <a href="#/workspace" className="wd-cta">
          Open your free khata
        </a>
      </header>

      <main className="wd-main">
        <div className="wd-phone-col">
          {sent.length > 0 && (
            <div className="wd-views" role="tablist" aria-label="Whose phone">
              <button role="tab" aria-selected={view === "owner"} onClick={() => setView("owner")}>
                Shop owner
              </button>
              {sent.map((c) => (
                <button key={c.name} role="tab" aria-selected={view === c.name} onClick={() => setView(c.name)}>
                  {c.name}’s phone
                </button>
              ))}
            </div>
          )}

          <section
            className="wd-phone"
            aria-label={customer ? `${customer.name}’s WhatsApp: reminder from ${SHOP} (demo)` : "WhatsApp chat with the Udhaar bot (demo)"}
          >
            <div className="wd-status" aria-hidden="true">
              <span>{clock()}</span>
              <span className="wd-status-icons">
                <i />
                <i />
                <b />
              </span>
            </div>
            <div className="wd-head">
              <span className="wd-head-back" aria-hidden="true">
                <ArrowLeft size={21} />
              </span>
              <span className={`wd-avatar ${customer ? "shop" : ""}`} aria-hidden="true">
                {customer ? <Store size={18} /> : <AudioLines size={18} />}
              </span>
              <span className="wd-who">
                <strong>{customer ? SHOP : "Udhaar Khata"}</strong>
                <small aria-live="polite">{customer ? "Business account" : status}</small>
              </span>
              <span className="wd-head-icons" aria-hidden="true">
                <Video size={21} />
                <Phone size={19} />
                <MoreVertical size={19} />
              </span>
            </div>

            {customer ? (
              <CustomerChat
                key={customer.name}
                customer={customer}
                playing={playing === customer.name}
                onPlay={() => togglePlay(customer)}
                onPay={() => setPaying(customer)}
                chatRef={chat}
              />
            ) : (
              <div className="wd-chat" ref={chat} role="log" aria-label="Messages" tabIndex={0}>
                <span className="wd-day">Today</span>
                <p className="wd-system">This is a demo chat. Messages stay in this browser tab and are not sent to anyone.</p>
                {bubbles.map((b, i) => (
                  <OwnerBubble key={b.id} bubble={b} tail={i === 0 || bubbles[i - 1].from !== b.from} />
                ))}
              </div>
            )}

            {!customer && suggestions.length > 0 && !recording && (
              <div className="wd-suggest" role="group" aria-label="Suggested messages">
                {suggestions.map((s) => (
                  <button key={s} type="button" disabled={busy} onClick={() => void send(s, !/^[12]$/.test(s))}>
                    {s === "1" ? "1  Haan" : s === "2" ? "2  Nahi" : s === AMOUNT_ANSWER && pendingAmount ? `₹${s}` : s}
                  </button>
                ))}
              </div>
            )}
            {!customer && entriesDone && !done.has("reminder") && !recording && (
              <div className="wd-suggest wd-suggest-action">
                <button type="button" disabled={busy} onClick={() => void sendReminders()}>
                  It’s Sunday — send reminders
                </button>
              </div>
            )}

            {customer ? (
              <div className="wd-input" aria-hidden="true">
                <span className="wd-field">
                  <Smile size={21} />
                  <span className="wd-placeholder">Message</span>
                  <Paperclip size={20} />
                  <Camera size={20} />
                </span>
                <span className="wd-round">
                  <Mic size={21} />
                </span>
              </div>
            ) : (
              <form className="wd-input" onSubmit={submit}>
                {recording ? (
                  <div className="wd-recording" role="status">
                    <span className="wd-rec-dot" aria-hidden="true" />
                    <span className="wd-rec-time">0:{String(seconds).padStart(2, "0")}</span>
                    <span className="wd-rec-heard">{recording.heard || "Bol rahe hain…"}</span>
                  </div>
                ) : (
                  <label className="wd-field">
                    <Smile size={21} aria-hidden="true" />
                    <input
                      value={text}
                      onChange={(e) => setText(e.currentTarget.value)}
                      placeholder="Message"
                      aria-label="Type a message"
                      disabled={busy}
                      maxLength={200}
                    />
                    <Paperclip size={20} aria-hidden="true" />
                    {!text && <Camera size={20} aria-hidden="true" />}
                  </label>
                )}
                {text.trim() && !recording ? (
                  <button className="wd-round" aria-label="Send" disabled={busy}>
                    <SendHorizontal size={20} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`wd-round ${recording ? "is-recording" : ""}`}
                    aria-label={recording ? "Stop and send voice note" : "Record a voice note"}
                    onClick={mic}
                    disabled={busy && !recording}
                  >
                    {recording ? <Square size={18} fill="currentColor" /> : <Mic size={21} />}
                  </button>
                )}
              </form>
            )}

            {paying && <PaySheet customer={paying} close={() => setPaying(null)} />}
          </section>
        </div>

        <aside className="wd-side" aria-label="What this demo shows">
          <h1>Bolo, likho, Sunday ko yaad dilao</h1>
          <p className="wd-lead">
            The owner speaks entries on WhatsApp and the khata updates. Every Sunday, each customer gets a short voice note
            in their own language with the amount due and a UPI link.
          </p>

          <ol className="wd-steps">
            {STEPS.map((s, i) => (
              <li key={s.id} className={done.has(s.id) ? "done" : next === s ? "next" : ""}>
                <span className="wd-step-mark" aria-hidden="true">
                  {done.has(s.id) ? <Check size={13} /> : i + 1}
                </span>
                <span>
                  <strong>{s.label}</strong>
                  <small>{s.say ? `“${s.say}”` : "Voice note + UPI link, in each customer’s language"}</small>
                </span>
                <span className="sr-only">{done.has(s.id) ? "Done" : "Not yet"}</span>
              </li>
            ))}
          </ol>

          <div className="wd-buttons">
            <button className="wd-btn wd-btn-primary" onClick={() => void playStory()} disabled={autoplay}>
              <Play size={15} />
              {autoplay ? "Playing…" : "Play the full story"}
            </button>
            {!done.has("reminder") && (
              <button className="wd-btn" onClick={() => void sendReminders()} disabled={busy}>
                Send Sunday reminders
              </button>
            )}
            <button className="wd-btn" onClick={reset}>
              <RotateCcw size={15} />
              Start over
            </button>
          </div>

          <section className="wd-khata" aria-labelledby="wd-khata-title">
            <div className="wd-khata-head">
              <h2 id="wd-khata-title">The khata, live</h2>
              <span>
                You’ll get <strong>{rupees(total)}</strong>
              </span>
            </div>
            <ul aria-live="polite">
              {state.customers.map((c) => (
                <li key={c.name} className={changed === c.name ? "is-changed" : ""}>
                  <span>
                    {c.name} <small lang={c.lang}>{demoReminder(c).label}</small>
                  </span>
                  <strong className={c.paise > 0 ? "due" : c.paise < 0 ? "adv" : ""}>
                    {c.paise < 0 ? `${rupees(c.paise)} advance` : rupees(c.paise)}
                  </strong>
                </li>
              ))}
            </ul>
          </section>

          <p className="wd-note">
            The language next to each name is the one their reminder is sent in. In this demo your browser reads the voice
            note aloud; in Udhaar the voice is made with Gnani’s Indian-language text-to-speech. Entries by voice already
            work in the Udhaar app today.
          </p>
        </aside>
      </main>
    </div>
  );
}

function Ticks({ bubble }: { bubble: Bubble }) {
  return (
    <span className="wd-time">
      {bubble.time}
      {bubble.from === "me" && <CheckCheck size={15} className={bubble.read ? "wd-read" : "wd-sent"} aria-label={bubble.read ? "Read" : "Delivered"} />}
    </span>
  );
}

function Wave({ progress = false }: { progress?: boolean }) {
  return (
    <span className={`wd-wave ${progress ? "is-playing" : ""}`} aria-hidden="true">
      {WAVE.map((h, k) => (
        <i key={k} style={{ height: h, animationDelay: `${k * 90}ms` }} />
      ))}
    </span>
  );
}

function OwnerBubble({ bubble: b, tail }: { bubble: Bubble; tail: boolean }) {
  return (
    <div className={`wd-row ${b.from} ${tail ? "tail" : ""}`}>
      {b.kind === "voice" ? (
        <div className="wd-bubble wd-voice">
          <span className="wd-voice-main">
            <span className="wd-play" aria-hidden="true">
              <Play size={17} fill="currentColor" />
            </span>
            <Wave />
            <span className="wd-me" aria-hidden="true">
              <Mic size={14} />
            </span>
          </span>
          <span className="wd-meta">
            <span>0:{String(b.secs ?? 2).padStart(2, "0")}</span>
            <Ticks bubble={b} />
          </span>
          <span className="wd-transcript">
            <span className="sr-only">Voice note: </span>
            {b.text}
          </span>
        </div>
      ) : (
        <div className="wd-bubble">
          {b.quote && (
            <span className="wd-quote">
              <b>Udhaar Khata</b>
              {b.quote}
            </span>
          )}
          <span className="wd-text">{b.text}</span>
          <Ticks bubble={b} />
        </div>
      )}
    </div>
  );
}

/** What the customer sees on Sunday: a voice note, the message in their language, and a UPI link. */
function CustomerChat({
  customer,
  playing,
  onPlay,
  onPay,
  chatRef,
}: {
  customer: DemoCustomer;
  playing: boolean;
  onPlay(): void;
  onPay(): void;
  chatRef: React.RefObject<HTMLDivElement | null>;
}) {
  const r = demoReminder(customer);
  const slug = customer.name.toLowerCase();
  return (
    <div className="wd-chat" ref={chatRef} role="log" aria-label={`Messages from ${SHOP}`} tabIndex={0}>
      <span className="wd-day">Sunday</span>
      <div className="wd-row bot tail">
        <div className="wd-bubble wd-voice">
          <span className="wd-voice-main">
            <button className="wd-play wd-play-btn" onClick={onPlay} aria-label={playing ? "Pause voice note" : `Play voice note in ${r.label}`}>
              {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
            <Wave progress={playing} />
            <span className="wd-me shop" aria-hidden="true">
              <Store size={14} />
            </span>
          </span>
          <span className="wd-meta">
            <span>0:09</span>
            <span className="wd-time">10:00</span>
          </span>
          <span className="wd-transcript" lang={r.lang}>
            <span className="sr-only">Voice note: </span>
            {r.speech}
          </span>
        </div>
      </div>
      <div className="wd-row bot">
        <div className="wd-bubble">
          <span className="wd-text" lang={r.lang}>
            {r.text}
          </span>
          <button className="wd-linkcard" onClick={onPay}>
            <b>Pay {rupees(customer.paise)} to {SHOP}</b>
            <small>UPI · any app: GPay, PhonePe, Paytm, BHIM</small>
            <u>udhaar-flax.vercel.app/pay/{slug}-demo</u>
          </button>
          <span className="wd-time">10:00</span>
        </div>
      </div>
    </div>
  );
}

function PaySheet({ customer, close }: { customer: DemoCustomer; close(): void }) {
  return (
    <div className="wd-sheet" role="dialog" aria-modal="false" aria-labelledby="wd-pay-title">
      <div className="wd-sheet-card">
        <button className="wd-sheet-close" onClick={close} aria-label="Close payment page">
          <X size={18} />
        </button>
        <span className="wd-sheet-shop" aria-hidden="true">
          <Store size={22} />
        </span>
        <h2 id="wd-pay-title">Pay {SHOP}</h2>
        <p className="wd-sheet-amount">{rupees(customer.paise)}</p>
        <p className="wd-sheet-sub">Udhaar baaki for {customer.name}</p>
        <div className="wd-qr" role="img" aria-label="UPI QR code (demo, not scannable)">
          {Array.from({ length: 49 }, (_, i) => (
            <i key={i} className={(i * 7 + (i % 5) * 3) % 4 === 0 || [0, 1, 7, 8, 5, 6, 12, 13, 35, 36, 42, 43].includes(i) ? "on" : ""} />
          ))}
        </div>
        <button className="wd-sheet-pay" onClick={close}>
          Pay with any UPI app
        </button>
        <p className="wd-sheet-note">
          Demo only — no money moves. In Udhaar this opens the customer’s UPI app with the shop’s UPI ID and the amount
          already filled in.
        </p>
      </div>
    </div>
  );
}
