import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  AudioLines,
  Camera,
  CheckCheck,
  Mic,
  MoreVertical,
  Paperclip,
  Pause,
  Phone,
  Play,
  RotateCcw,
  Smile,
  Video,
} from "lucide-react";

/**
 * A scripted WhatsApp chat with the Udhaar bot: the whole product in about 40 seconds.
 * Bot replies are the exact text the WhatsApp agent sends (server/agent/messages.ts).
 */
type Msg =
  | { kind: "voice"; secs: number; transcript: string }
  | { kind: "out"; text: string; quote?: string }
  | { kind: "in"; text: string };
type Beat = { chapter: number; msg: Msg; time: string };

const HINT = "Galat ho to 'GALAT' likhein (10 minute ke andar).";
const CHAPTERS = ["Voice udhaar", "Payment", "New customer", "Fix a mistake", "Check balance"];
const SCRIPT: Beat[] = [
  { chapter: 0, time: "10:02", msg: { kind: "voice", secs: 5, transcript: "Ramesh ko 340 ka udhaar, do Maggi aur doodh" } },
  { chapter: 0, time: "10:02", msg: { kind: "in", text: `Ramesh: +₹340 (Maggi, doodh). Total baaki: ₹1,240. ${HINT}` } },
  { chapter: 1, time: "10:15", msg: { kind: "out", text: "Sunita ne 200 diye" } },
  { chapter: 1, time: "10:15", msg: { kind: "in", text: `Sunita: ₹200 mile. Total baaki: ₹450. ${HINT}` } },
  { chapter: 2, time: "11:40", msg: { kind: "voice", secs: 3, transcript: "Kishore ko 250 ka udhaar" } },
  { chapter: 2, time: "11:40", msg: { kind: "in", text: "“Kishore” naam ka koi customer nahi hai. Naya customer “Kishore” banakar ₹250 udhaar likhun?\n1) Haan\n2) Nahi" } },
  { chapter: 2, time: "11:41", msg: { kind: "out", text: "1" } },
  { chapter: 2, time: "11:41", msg: { kind: "in", text: `Kishore naye customer jud gaye. Kishore: +₹250. Total baaki: ₹250. ${HINT}` } },
  { chapter: 3, time: "11:43", msg: { kind: "out", text: "GALAT", quote: "Kishore: +₹250. Total baaki: ₹250." } },
  { chapter: 3, time: "11:43", msg: { kind: "in", text: "₹250 ka entry hata diya (reversal darj hua). Kishore ji ka baaki ab ₹0 hai." } },
  { chapter: 4, time: "12:10", msg: { kind: "voice", secs: 2, transcript: "Ramesh ka kitna baaki hai?" } },
  { chapter: 4, time: "12:10", msg: { kind: "in", text: "Ramesh ji ka baaki ₹1,240 hai.\nPichli entries:\n1) Udhaar ₹340\n2) Udhaar ₹900" } },
];

const WAVE = [6, 12, 9, 16, 20, 11, 18, 24, 14, 8, 17, 22, 13, 19, 10, 15, 21, 12, 7, 14, 18, 9, 13, 6];
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function WhatsAppPreview() {
  const [shown, setShown] = useState(0);
  const [status, setStatus] = useState<"online" | "typing…" | "recording audio…">("online");
  const [playing, setPlaying] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chat = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const visible = useRef(false);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  function playFrom(start: number) {
    clear();
    setShown(start);
    setPlaying(true);
    const step = (n: number) => {
      if (n >= SCRIPT.length) {
        setStatus("online");
        later(() => step(0), 14000); // hold the full chat, then loop
        return;
      }
      if (n === 0) setShown(0);
      const next = SCRIPT[n].msg;
      // The owner's side: show "recording" for voice notes; the bot's side: "typing…".
      setStatus(next.kind === "in" ? "typing…" : next.kind === "voice" ? "recording audio…" : "online");
      const wait = next.kind === "in" ? 1300 : next.kind === "voice" ? 1200 : 700;
      later(() => {
        setShown(n + 1);
        setStatus("online");
        later(() => step(n + 1), next.kind === "in" ? 1700 : 500);
      }, wait);
    };
    step(start);
  }
  function pause() {
    clear();
    setPlaying(false);
    setStatus("online");
  }
  function jump(chapter: number) {
    const start = SCRIPT.findIndex((b) => b.chapter === chapter);
    if (reduced()) {
      setShown(SCRIPT.length);
      chat.current?.querySelector(`[data-chapter="${chapter}"]`)?.scrollIntoView({ block: "nearest" });
      return;
    }
    playFrom(start);
  }

  // Plays only while on screen; reduced motion shows the whole chat at once.
  useEffect(() => {
    if (reduced()) {
      setShown(SCRIPT.length);
      return;
    }
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) {
      playFrom(0);
      return clear;
    }
    let started = false;
    const io = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
      if (e.isIntersecting && !started) {
        started = true;
        playFrom(0);
      }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
  }, [shown, status]);

  const chapter = shown ? SCRIPT[Math.min(shown, SCRIPT.length) - 1].chapter : 0;

  return (
    <figure className="wa" ref={root} aria-label="WhatsApp preview: the Udhaar bot in a WhatsApp chat">
      <div className="wa-phone">
        <div className="wa-status" aria-hidden="true">
          <span>9:41</span>
          <span className="wa-status-icons">
            <i />
            <i />
            <b />
          </span>
        </div>
        <header className="wa-head">
          <ArrowLeft size={20} aria-hidden="true" />
          <span className="wa-avatar" aria-hidden="true">
            <AudioLines size={17} />
          </span>
          <span className="wa-who">
            <strong>Udhaar Khata</strong>
            <small aria-live="polite">{status}</small>
          </span>
          <span className="wa-head-icons" aria-hidden="true">
            <Video size={20} />
            <Phone size={18} />
            <MoreVertical size={18} />
          </span>
        </header>

        <div className="wa-chat" role="log" ref={chat} tabIndex={0} aria-label="Chat messages">
          <span className="wa-day">Today</span>
          <p className="wa-system">Messages are end-to-end encrypted between you and your khata bot.</p>
          {SCRIPT.slice(0, shown).map((b, i) => {
            const m = b.msg;
            const first = i === 0 || SCRIPT[i - 1].chapter !== b.chapter;
            return (
              <div key={i} data-chapter={first ? b.chapter : undefined} className={`wa-row ${m.kind === "in" ? "in" : "out"}`}>
                {m.kind === "voice" ? (
                  <div className="wa-bubble wa-voice">
                    <span className="wa-voice-main">
                      <span className="wa-play" aria-hidden="true">
                        <Play size={16} fill="currentColor" />
                      </span>
                      <span className="wa-wave" aria-hidden="true">
                        {WAVE.map((h, k) => (
                          <i key={k} style={{ height: h }} />
                        ))}
                      </span>
                      <span className="wa-me" aria-hidden="true">
                        <Mic size={13} />
                      </span>
                    </span>
                    <span className="wa-meta">
                      <span>0:0{m.secs}</span>
                      <span>
                        {b.time} <CheckCheck size={15} className="wa-read" aria-label="Read" />
                      </span>
                    </span>
                    <span className="wa-transcript">
                      <span className="sr-only">Voice note: </span>“{m.transcript}”
                    </span>
                  </div>
                ) : (
                  <div className="wa-bubble">
                    {m.kind === "out" && m.quote && (
                      <span className="wa-quote">
                        <b>Udhaar Khata</b>
                        {m.quote}
                      </span>
                    )}
                    <span className="wa-text">{m.text}</span>
                    <span className="wa-time">
                      {b.time}
                      {m.kind !== "in" && <CheckCheck size={15} className="wa-read" aria-label="Read" />}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="wa-input" aria-hidden="true">
          <span className="wa-field">
            <Smile size={20} />
            <span>Message</span>
            <Paperclip size={19} />
            <Camera size={19} />
          </span>
          <span className="wa-mic">
            <Mic size={20} />
          </span>
        </div>
      </div>

      <figcaption className="wa-caption">
        <div className="wa-chapters" role="group" aria-label="Jump to a part of the chat">
          {CHAPTERS.map((c, i) => (
            <button key={c} aria-current={i === chapter ? "step" : undefined} onClick={() => jump(i)}>
              {c}
            </button>
          ))}
        </div>
        <div className="wa-controls">
          <button onClick={() => (playing ? pause() : playFrom(shown >= SCRIPT.length ? 0 : shown))}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? "Pause" : "Play"}
          </button>
          <button onClick={() => playFrom(0)}>
            <RotateCcw size={14} />
            Restart
          </button>
          <span>Preview of the WhatsApp version. The same assistant works on this website today.</span>
        </div>
      </figcaption>
    </figure>
  );
}
