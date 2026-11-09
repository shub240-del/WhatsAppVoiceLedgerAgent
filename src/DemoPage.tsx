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
  Phone,
  Play,
  RotateCcw,
  SendHorizontal,
  Smile,
  Square,
  Video,
} from "lucide-react";
import { DEMO_HELP, demoReply, demoStart, type DemoEvent, type DemoState } from "./lib/demo-bot";
import "@fontsource/mukta/400.css";
import "@fontsource/mukta/600.css";
import "@fontsource/mukta/700.css";
import "./demo.css";

/**
 * Full-screen demo of Udhaar on WhatsApp. Looks and behaves like a WhatsApp chat: type, tap a
 * suggestion, or speak (browser speech recognition where available). A pretend khata in this tab
 * updates live. Nothing is sent to Udhaar's server or saved.
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

const STEPS: { event: Exclude<DemoEvent, null>; label: string; say: string }[] = [
  { event: "credit", label: "Write an udhaar", say: "Ramesh ko 340 ka udhaar, do Maggi aur doodh" },
  { event: "payment", label: "Record a payment", say: "Sunita ne 200 diye" },
  { event: "new_customer", label: "Add a new customer", say: "Kishore ko 250 ka udhaar" },
  { event: "undo", label: "Fix a mistake", say: "GALAT" },
  { event: "balance", label: "Ask a balance", say: "Ramesh ka kitna baaki hai?" },
];
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

export default function DemoPage() {
  const [state, setState] = useState<DemoState>(demoStart);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [status, setStatus] = useState("online");
  const [options, setOptions] = useState<string[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [changed, setChanged] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<null | { started: number; heard: string }>(null);
  const [now, setNow] = useState(Date.now());
  const [autoplay, setAutoplay] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastConfirm = useRef<string>("");
  const chat = useRef<HTMLDivElement>(null);
  const recognizer = useRef<Recognition | null>(null);
  const stop = useRef(false);
  const id = useRef(0);

  useEffect(() => {
    document.title = "WhatsApp demo · Udhaar";
    const t = setTimeout(() => push({ from: "bot", kind: "text", text: DEMO_HELP }), reduced() ? 0 : 500);
    return () => {
      clearTimeout(t);
      stop.current = true;
      recognizer.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
  }, [bubbles, status]);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [recording]);

  function push(b: Omit<Bubble, "id" | "time">) {
    setBubbles((all) => [...all, { ...b, id: ++id.current, time: clock() }]);
  }

  async function send(message: string, voice: boolean) {
    const said = message.trim();
    if (!said || busy) return;
    setBusy(true);
    setOptions([]);
    // Like WhatsApp: "GALAT" is sent as a reply to the confirmation it corrects.
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
    if (result.event) setDone((d) => new Set(d).add(result.event!));
    setBusy(false);
  }

  const next = STEPS.find((s) => !done.has(s.event));
  const suggestions = options.length ? options : next ? [next.say] : [];

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
      // No speech recognition in this browser: send the suggested sentence as the voice note.
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

  async function playStory() {
    reset();
    setAutoplay(true);
    stop.current = false;
    await wait(900);
    for (const step of STEPS) {
      if (stop.current) break;
      await send(step.say, step.event !== "undo");
      if (step.event === "new_customer") {
        await wait(1200);
        if (stop.current) break;
        await send("1", false);
      }
      await wait(1400);
    }
    setAutoplay(false);
  }

  function reset() {
    stop.current = true;
    recognizer.current?.stop();
    setState(demoStart());
    setBubbles([]);
    setOptions([]);
    setDone(new Set());
    setChanged(null);
    setStatus("online");
    setRecording(null);
    setBusy(false);
    lastConfirm.current = "";
    setTimeout(() => push({ from: "bot", kind: "text", text: DEMO_HELP }), 200);
  }

  const total = state.customers.reduce((n, c) => n + Math.max(c.paise, 0), 0);
  const seconds = recording ? Math.floor((now - recording.started) / 1000) : 0;

  return (
    <div className="wd">
      <header className="wd-bar">
        <a href="#" className="wd-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Udhaar
        </a>
        <span className="wd-title">WhatsApp demo — nothing is saved</span>
        <a href="#/workspace" className="wd-cta">
          Open your free khata
        </a>
      </header>

      <main className="wd-main">
        <section className="wd-phone" aria-label="WhatsApp chat with the Udhaar bot (demo)">
          <div className="wd-status" aria-hidden="true">
            <span>{clock()}</span>
            <span className="wd-status-icons">
              <i />
              <i />
              <b />
            </span>
          </div>
          <div className="wd-head">
            <a href="#" aria-label="Back to Udhaar" className="wd-head-back">
              <ArrowLeft size={21} />
            </a>
            <span className="wd-avatar" aria-hidden="true">
              <AudioLines size={18} />
            </span>
            <span className="wd-who">
              <strong>Udhaar Khata</strong>
              <small aria-live="polite">{status}</small>
            </span>
            <span className="wd-head-icons" aria-hidden="true">
              <Video size={21} />
              <Phone size={19} />
              <MoreVertical size={19} />
            </span>
          </div>

          <div className="wd-chat" ref={chat} role="log" aria-label="Messages" tabIndex={0}>
            <span className="wd-day">Today</span>
            <p className="wd-system">This is a demo chat. Messages stay in this browser tab and are not sent to anyone.</p>
            {bubbles.map((b, i) => {
              const tail = i === 0 || bubbles[i - 1].from !== b.from;
              return (
                <div key={b.id} className={`wd-row ${b.from} ${tail ? "tail" : ""}`}>
                  {b.kind === "voice" ? (
                    <div className="wd-bubble wd-voice">
                      <span className="wd-voice-main">
                        <span className="wd-play" aria-hidden="true">
                          <Play size={17} fill="currentColor" />
                        </span>
                        <span className="wd-wave" aria-hidden="true">
                          {WAVE.map((h, k) => (
                            <i key={k} style={{ height: h }} />
                          ))}
                        </span>
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
            })}
          </div>

          {suggestions.length > 0 && !recording && (
            <div className="wd-suggest" role="group" aria-label="Suggested messages">
              {suggestions.map((s) => (
                <button key={s} type="button" disabled={busy} onClick={() => void send(s, !/^\d$/.test(s) && s !== "GALAT")}>
                  {/^\d$/.test(s) ? (s === "1" ? "1  Haan" : "2  Nahi") : s}
                </button>
              ))}
            </div>
          )}

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
        </section>

        <aside className="wd-side" aria-label="What this demo shows">
          <h1>Udhaar on WhatsApp</h1>
          <p className="wd-lead">
            A shopkeeper sends a voice note. Udhaar writes it in the khata and replies with the new balance. Try it:
            type, tap a suggestion, or tap the mic and speak.
          </p>

          <ol className="wd-steps">
            {STEPS.map((s, i) => (
              <li key={s.event} className={done.has(s.event) ? "done" : next === s ? "next" : ""}>
                <span className="wd-step-mark" aria-hidden="true">
                  {done.has(s.event) ? <Check size={13} /> : i + 1}
                </span>
                <span>
                  <strong>{s.label}</strong>
                  <small>“{s.say}”</small>
                </span>
                <span className="sr-only">{done.has(s.event) ? "Done" : "Not yet"}</span>
              </li>
            ))}
          </ol>

          <div className="wd-buttons">
            <button className="wd-btn wd-btn-primary" onClick={() => void playStory()} disabled={autoplay}>
              <Play size={15} />
              {autoplay ? "Playing…" : "Play the full story"}
            </button>
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
                  <span>{c.name}</span>
                  <strong className={c.paise > 0 ? "due" : c.paise < 0 ? "adv" : ""}>
                    {c.paise < 0 ? `${rupees(c.paise)} advance` : rupees(c.paise)}
                  </strong>
                </li>
              ))}
            </ul>
          </section>

          <p className="wd-note">
            This shows how Udhaar will work on WhatsApp. The same assistant, with the same replies, already works in
            the Udhaar app — by voice or typing.
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
      {bubble.from === "me" &&
        (bubble.read ? (
          <CheckCheck size={15} className="wd-read" aria-label="Read" />
        ) : (
          <CheckCheck size={15} className="wd-sent" aria-label="Delivered" />
        ))}
    </span>
  );
}
