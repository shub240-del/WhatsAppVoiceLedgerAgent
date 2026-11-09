import { useEffect, useRef, useState, type FormEvent } from "react";
import { AudioLines, LoaderCircle, Mic, Send, Square, Undo2 } from "lucide-react";
import { api } from "../lib/api";
import { blobToBase64, MAX_RECORD_MS, WavRecorder } from "../lib/recorder";

type Turn = {
  turnId: string;
  heard: string;
  reply: string;
  replyId: string | null;
  kind: "saved" | "question" | "undone" | "info";
  entryId: string | null;
  options: { key: number; label: string }[];
};
type Message =
  | { id: string; from: "owner"; text: string; voice: boolean; pending?: boolean }
  | { id: string; from: "bot"; turn: Turn; undone?: boolean }
  | { id: string; from: "error"; text: string };

const EXAMPLES = ["Ramesh ko 340 ka udhaar likh do", "Sunita ne 200 rupaye diye", "Ramesh ka kitna baaki hai?"];

/** In-app voice/text assistant: same rules as the WhatsApp bot (never guesses, asks, undo). */
export function Assistant({ onChanged, disabled }: { onChanged(): void; disabled?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<WavRecorder | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const micSupported = WavRecorder.supported();

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(recorder.current?.elapsedMs() ?? 0), 250);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => recorder.current?.cancel(), []);

  async function send(body: { text?: string; audioBase64?: string; mimeType?: string; replyTo?: string }, shown: string, voice: boolean) {
    const turnId = crypto.randomUUID();
    const ownerId = `o-${turnId}`;
    setMessages((m) => [...m, { id: ownerId, from: "owner", text: shown, voice, pending: true }]);
    setBusy(true);
    try {
      const turn = await api<Turn>("/api/assistant", { turnId, ...body });
      setMessages((m) => [
        ...m.map((x) => (x.id === ownerId && x.from === "owner" ? { ...x, text: voice ? turn.heard || "(kuch sunai nahi diya)" : x.text, pending: false } : x)),
        { id: `b-${turnId}`, from: "bot", turn },
      ]);
      if (turn.kind === "saved" || turn.kind === "undone") onChanged();
    } catch (e) {
      setMessages((m) => [
        ...m.map((x) => (x.id === ownerId && x.from === "owner" ? { ...x, pending: false } : x)),
        { id: `e-${turnId}`, from: "error", text: e instanceof Error ? e.message : "Kuch gadbad hui. Kuch save nahi hua." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function lastQuestionId() {
    const last = [...messages].reverse().find((m) => m.from === "bot");
    return last && last.from === "bot" && last.turn.kind === "question" ? (last.turn.replyId ?? undefined) : undefined;
  }

  async function submitText(e?: FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    // A short answer like "2" or "300" goes to the open question, if there is one.
    await send({ text: value, replyTo: lastQuestionId() }, value, false);
  }

  async function toggleMic() {
    if (busy) return;
    if (!recording) {
      try {
        recorder.current = new WavRecorder();
        await recorder.current.start(() => void finishRecording());
        setElapsed(0);
        setRecording(true);
      } catch {
        recorder.current?.cancel();
        setMessages((m) => [...m, { id: `e-${Date.now()}`, from: "error", text: "Microphone is blocked. Allow the mic for this site in your browser, or type instead." }]);
      }
      return;
    }
    await finishRecording();
  }

  async function finishRecording() {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    setRecording(false);
    const { wav, durationMs } = await r.stop();
    if (durationMs < 700) {
      setMessages((m) => [...m, { id: `e-${Date.now()}`, from: "error", text: "Bahut chhota tha. Mic dabakar poori baat bolein, phir dobara dabayein." }]);
      return;
    }
    await send({ audioBase64: await blobToBase64(wav), mimeType: "audio/wav", replyTo: lastQuestionId() }, "Sun raha hoon…", true);
  }

  async function undo(m: Extract<Message, { from: "bot" }>) {
    if (!m.turn.replyId || busy) return;
    setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, undone: true } : x)));
    await send({ text: "galat", replyTo: m.turn.replyId }, "Galat — hata do", false);
  }

  const seconds = Math.floor(elapsed / 1000);
  return (
    <section className="panel assistant" aria-label="Voice assistant">
      <div className="assistant-head">
        <span className="assistant-badge">
          <AudioLines size={18} />
        </span>
        <div>
          <h2>Bolo, hisaab ho jayega</h2>
          <p>Speak or type an entry. If anything is unclear, I’ll ask — I never guess.</p>
        </div>
      </div>

      <div className="assistant-log" ref={list} aria-live="polite">
        {messages.length === 0 && (
          <div className="assistant-empty">
            <p>Try saying or tapping:</p>
            <div className="assistant-examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" disabled={busy || disabled} onClick={() => void send({ text: ex }, ex, false)}>
                  “{ex}”
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.from === "owner" ? (
            <div key={m.id} className="bubble owner">
              {m.voice && <Mic size={13} />}
              <span>{m.text}</span>
              {m.pending && <LoaderCircle size={13} className="spin" />}
            </div>
          ) : m.from === "error" ? (
            <div key={m.id} className="bubble error" role="alert">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`bubble bot ${m.turn.kind}`}>
              <span className="bubble-text">
                {/* With tap-able options, the numbered list and "1 ya 2 bhejein" text are redundant. */}
                {m.turn.kind === "question" && m.turn.options.length > 0 ? m.turn.reply.split("\n")[0] : m.turn.reply || "Theek hai."}
              </span>
              {m.turn.kind === "question" && m.turn.options.length > 0 && (
                <div className="bubble-options">
                  {m.turn.options.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      disabled={busy}
                      onClick={() => void send({ text: String(o.key), replyTo: m.turn.replyId ?? undefined }, o.label, false)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {m.turn.kind === "saved" && m.turn.replyId && (
                <button type="button" className="bubble-undo" disabled={busy || m.undone} onClick={() => void undo(m)}>
                  <Undo2 size={13} />
                  {m.undone ? "Undo sent" : "Undo"}
                </button>
              )}
            </div>
          ),
        )}
        {busy && (
          <div className="bubble bot thinking">
            <LoaderCircle size={14} className="spin" /> Samajh raha hoon…
          </div>
        )}
      </div>

      <form className="assistant-composer" onSubmit={submitText}>
        {micSupported && (
          <button
            type="button"
            className={`mic-button ${recording ? "recording" : ""}`}
            onClick={() => void toggleMic()}
            disabled={busy || disabled}
            aria-label={recording ? "Stop and send voice" : "Start speaking"}
          >
            {recording ? <Square size={18} /> : <Mic size={22} />}
          </button>
        )}
        {recording ? (
          <div className="recording-status" role="status">
            <span className="rec-dot" /> Bol rahe hain… {seconds}s / {MAX_RECORD_MS / 1000}s · tap ■ to send
          </div>
        ) : (
          <>
            <input
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
              placeholder="Type: Ramesh ko 340 ka udhaar…"
              aria-label="Type a message"
              maxLength={500}
              disabled={busy || disabled}
            />
            <button className="send-button" disabled={busy || disabled || !text.trim()} aria-label="Send">
              <Send size={17} />
            </button>
          </>
        )}
      </form>
    </section>
  );
}
