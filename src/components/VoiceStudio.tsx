import { useEffect, useRef, useState } from "react";
import { Check, Download, FileArchive, LoaderCircle, Mic, Play, RefreshCw, X } from "lucide-react";
import { auth } from "../lib/firebase";
import { api } from "../lib/api";
import { blobToBase64, encodeWav } from "../lib/recorder";
import { makeZip } from "../lib/zip";
import { bands, profile, timbreDifference, type VoiceProfile } from "../lib/voice-metrics";

/**
 * Voice studio: narrate the walkthrough video in the owner's own voice.
 * The sample is trimmed here, cloned by Gnani (via our server, which holds the key), and each line of
 * the script is spoken at the second its caption appears in the video. Nothing is stored by Udhaar.
 */
const VIDEO = "/video/udhaar-walkthrough.mp4";
const VIDEO_SECONDS = 85.6;
const RATE = 24_000;

// Start times are when each caption appears in the recorded video (measured while filming).
export const NARRATION: { at: number; scene: string; text: string }[] = [
  { at: 0, scene: "Title", text: "हर किराना दुकान में, उधार की एक डायरी होती है।" },
  { at: 3.9, scene: "Website", text: "इसीलिए हमने बनाया — उधार। एक वॉइस खाता।" },
  { at: 7.3, scene: "Khata page", text: "आप बस बोलिए, और ये सीधा ग्राहक के खाते में लिख देता है। ना डायरी, ना टाइपिंग।" },
  { at: 16.8, scene: "1 · Voice note", text: "देखिए — दुकानदार व्हाट्सऐप पर वॉइस नोट भेजता है: रमेश ने दो किलो चावल और एक सर्फ़ लिया, उधार में।" },
  { at: 23.8, scene: "It asks", text: "यहाँ दाम बोला ही नहीं गया… तो उधार अंदाज़ा नहीं लगाता, सीधा पूछता है — कितने रुपये?" },
  { at: 29.4, scene: "Saved", text: "दो सौ तीस बोला, और एंट्री सेव — नए टोटल के साथ।" },
  { at: 33.1, scene: "2 · Payment", text: "पेमेंट भी बिल्कुल ऐसे ही — सुनीता ने दो सौ दिए।" },
  { at: 38.7, scene: "3 · Udhaar", text: "और एक और उधार, प्रिया के नाम।" },
  { at: 43.5, scene: "Live khata", text: "और खाता, तुरंत अपडेट।" },
  { at: 47.3, scene: "4 · Sunday", text: "अब असली कमाल देखिए — हर संडे, रिमाइंडर अपने आप जाता है।" },
  { at: 51.6, scene: "Ramesh", text: "रमेश को हिंदी में एक वॉइस नोट मिलता है — कितना बाकी है, और साथ में यूपीआई लिंक।" },
  { at: 57.5, scene: "UPI", text: "बस एक टैप, और यूपीआई ऐप खुल जाता है — अमाउंट पहले से भरा हुआ।" },
  { at: 61.6, scene: "Sunita", text: "सुनीता को यही मैसेज मराठी में," },
  { at: 65.1, scene: "Priya", text: "और प्रिया को गुजराती में। हर ग्राहक, अपनी भाषा में।" },
  { at: 69.7, scene: "5 · Web khata", text: "और दुकानदार का पूरा खाता वेब पर भी है — किसका कितना बाकी है, हर एंट्री, और पूरी हिस्ट्री।" },
  { at: 81.5, scene: "End", text: "उधार। बस बोलिए — और हिसाब हो गया।" },
];

type Voice = { embedding: string; shape: number[]; dtype: string };
type Line = { at: number; start: number; seconds: number };

function mono(buffer: AudioBuffer) {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

/** Up to 25 s of the sample, starting where speech starts, as 16 kHz mono WAV (Gnani asks for 5–30 s). */
async function prepareSample(file: File) {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  await ctx.close();
  const samples = mono(decoded);
  const first = Math.max(0, samples.findIndex((v) => Math.abs(v) > 0.02) - Math.round(decoded.sampleRate * 0.2));
  const length = Math.min(samples.length - first, decoded.sampleRate * 25);
  if (length < decoded.sampleRate * 5) throw new Error("The sample needs at least 5 seconds of speech.");
  const clip = new AudioBuffer({ length, numberOfChannels: 1, sampleRate: decoded.sampleRate });
  clip.copyToChannel(samples.slice(first, first + length), 0);
  const offline = new OfflineAudioContext(1, Math.ceil((length / decoded.sampleRate) * 16_000), 16_000);
  const source = offline.createBufferSource();
  source.buffer = clip;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const pcm = rendered.getChannelData(0);
  return { wav: encodeWav(pcm, 16_000), pcm: new Float32Array(pcm), seconds: decoded.duration, used: length / decoded.sampleRate };
}

/** Any WAV/MP3 bytes -> 16 kHz mono samples, for measuring. */
async function toPcm16k(bytes: ArrayBuffer) {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(bytes);
  await ctx.close();
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16_000)), 16_000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  return new Float32Array((await offline.startRendering()).getChannelData(0));
}

type Measured = { name: string; p: VoiceProfile };

/** Plain-language comparison of the clone with the recording it was made from. */
function verdicts(source: VoiceProfile, clone: VoiceProfile) {
  const pct = (a: number, b: number) => (b ? (Math.abs(a - b) / b) * 100 : 100);
  const pitchOff = pct(clone.pitchMedian, source.pitchMedian);
  const rateOff = pct(clone.syllablesPerSecond, source.syllablesPerSecond);
  const tone = timbreDifference(source.bands, clone.bands);
  return {
    pitch: pitchOff <= 10 ? "close" : pitchOff <= 25 ? "somewhat different" : "different",
    pitchOff,
    rhythm: rateOff <= 20 ? "close" : rateOff <= 40 ? "somewhat different" : "different",
    rateOff,
    tone,
    toneWord: tone < 3 ? "close" : tone < 6 ? "noticeably different" : "different",
  };
}

async function speak(text: string, voice: Voice): Promise<ArrayBuffer> {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in first.");
  const response = await fetch("/api/voice-studio/speak", {
    method: "POST",
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message || `Gnani could not speak this line (${response.status}).`);
  }
  return response.arrayBuffer();
}

export function VoiceStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [cleanFile, setCleanFile] = useState<File | null>(null);
  const [source, setSource] = useState<"original" | "cleaned">("original");
  const [measured, setMeasured] = useState<Measured[]>([]);
  const [approved, setApproved] = useState<boolean | null>(null);
  const [urls, setUrls] = useState<{ original?: string; cleaned?: string }>({});
  const [consent, setConsent] = useState(false);
  const [texts, setTexts] = useState(NARRATION.map((n) => n.text));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [narration, setNarration] = useState<string | null>(null);
  const [bundle, setBundle] = useState<string | null>(null);
  const [testLine, setTestLine] = useState<string | null>(null);
  const voice = useRef<{ file: File; voice: Voice } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => () => {
    if (narration) URL.revokeObjectURL(narration);
  }, [narration]);
  useEffect(() => {
    const next = { original: file ? URL.createObjectURL(file) : undefined, cleaned: cleanFile ? URL.createObjectURL(cleanFile) : undefined };
    setUrls(next);
    return () => Object.values(next).forEach((u) => u && URL.revokeObjectURL(u));
  }, [file, cleanFile]);
  // Anything that changes the voice or the test line needs a fresh test and a fresh approval.
  useEffect(() => {
    setApproved(null);
    setMeasured([]);
    setTestLine(null);
  }, [file, cleanFile, source]);

  const sourceFile = source === "cleaned" && cleanFile ? cleanFile : file;

  async function ensureVoice(): Promise<Voice> {
    if (voice.current?.file === sourceFile) return voice.current.voice;
    setProgress("Preparing your sample…");
    const sample = await prepareSample(sourceFile!);
    setProgress(`Cloning your voice from ${Math.round(sample.used)} s of the sample…`);
    const { voice: v } = await api<{ voice: Voice }>("/api/voice-studio/voice", {
      audioBase64: await blobToBase64(sample.wav),
      mimeType: "audio/wav",
      consent: true,
    });
    voice.current = { file: sourceFile!, voice: v };
    return v;
  }

  /** One line first, so the owner can judge the likeness before voicing everything. */
  async function test() {
    if (!file || !consent || busy) return;
    setBusy(true);
    setError("");
    setApproved(null);
    try {
      const v = await ensureVoice();
      setProgress("Speaking the first line in your cloned voice…");
      const wav = await speak(texts[0], v);
      if (testLine) URL.revokeObjectURL(testLine);
      setTestLine(URL.createObjectURL(new Blob([wav.slice(0)], { type: "audio/wav" })));
      setProgress("Measuring the three recordings…");
      // Measure the same 25 s that is (or would be) sent to Gnani, so the comparison is fair.
      const m: Measured[] = [{ name: "Your original", p: profile((await prepareSample(file)).pcm, 16_000) }];
      if (cleanFile) m.push({ name: "Cleaned", p: profile((await prepareSample(cleanFile)).pcm, 16_000) });
      m.push({ name: "Cloned voice", p: profile(await toPcm16k(wav), 16_000) });
      setMeasured(m);
      setProgress("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  async function make() {
    if (!file || !consent || busy || approved !== true) return;
    setBusy(true);
    setError("");
    setNarration(null);
    setBundle(null);
    try {
      const v = await ensureVoice();
      const decoder = new AudioContext({ sampleRate: RATE });
      const raw: ArrayBuffer[] = [];
      const buffers: AudioBuffer[] = [];
      for (let i = 0; i < NARRATION.length; i++) {
        setProgress(`Speaking line ${i + 1} of ${NARRATION.length}…`);
        const wav = await speak(texts[i], v);
        raw.push(wav.slice(0));
        buffers.push(await decoder.decodeAudioData(wav));
      }
      await decoder.close();
      // Each line starts when its caption appears; if the line before runs long, it waits for it.
      let cursor = 0;
      const placed = buffers.map((b, i) => {
        const start = Math.max(NARRATION[i].at, cursor);
        cursor = start + b.duration + 0.25;
        return { at: NARRATION[i].at, start, seconds: b.duration };
      });
      const total = Math.max(VIDEO_SECONDS, cursor);
      const mix = new OfflineAudioContext(1, Math.ceil(total * RATE), RATE);
      buffers.forEach((b, i) => {
        const s = mix.createBufferSource();
        s.buffer = b;
        s.connect(mix.destination);
        s.start(placed[i].start);
      });
      const rendered = await mix.startRendering();
      const full = encodeWav(rendered.getChannelData(0), RATE);
      setLines(placed);
      setNarration(URL.createObjectURL(full));
      // Everything the video editor needs: each line separately, the full mix, the script and timings.
      const slug = (scene: string) => scene.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const zip = await makeZip([
        ...raw.map((r, i) => ({ name: `lines/${String(i + 1).padStart(2, "0")}-${slug(NARRATION[i].scene)}.wav`, data: new Blob([r]) })),
        { name: "narration.wav", data: full },
        {
          name: "script.txt",
          data: NARRATION.map((n, i) => `${String(i + 1).padStart(2, "0")}  ${n.at.toFixed(1)}s  ${n.scene}\n    ${texts[i]}`).join("\n\n") + "\n",
        },
        {
          name: "timing.json",
          data: JSON.stringify(
            NARRATION.map((n, i) => ({ line: i + 1, scene: n.scene, captionAt: n.at, text: texts[i], seconds: +placed[i].seconds.toFixed(3) })),
            null,
            1,
          ),
        },
      ]);
      setBundle(URL.createObjectURL(zip));
      setProgress("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  // Preview: the narration plays in step with the video.
  function sync(play: boolean) {
    const v = video.current;
    const a = audio.current;
    if (!v || !a) return;
    a.currentTime = v.currentTime;
    if (play) void a.play();
    else a.pause();
  }

  const late = lines.filter((l) => l.start - l.at > 0.4);

  return (
    <div className="k-stack k-studio">
      <section className="k-card">
        <h2>Narrate the demo video in your voice</h2>
        <p className="k-muted">
          Prefer your real voice, no AI? <a href="#/narrate">Record the narration yourself, scene by scene</a>.
        </p>
        <p className="k-muted">
          Upload a clear recording of yourself talking (5–60 seconds). Gnani makes a copy of your voice and reads the
          script below, timed to the 85-second walkthrough. Udhaar doesn’t store the sample or the voice.
        </p>
        <label className="k-field">
          Your voice sample
          <input type="file" accept="audio/*,video/*" onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)} disabled={busy} />
          <small className="k-muted">WhatsApp voice notes, MP3, M4A or WAV. A quiet room works best.</small>
        </label>
        <label className="k-field">
          Cleaned version <span className="subtle">(optional, for comparison)</span>
          <input type="file" accept="audio/*" onChange={(e) => setCleanFile(e.currentTarget.files?.[0] ?? null)} disabled={busy} />
        </label>
        {cleanFile && (
          <fieldset className="k-field k-lang">
            <legend>Clone from</legend>
            <label className={source === "original" ? "on" : ""}>
              <input type="radio" name="source" checked={source === "original"} onChange={() => setSource("original")} />
              <strong>My original</strong>
              <small>No processing, safest for your natural voice</small>
            </label>
            <label className={source === "cleaned" ? "on" : ""}>
              <input type="radio" name="source" checked={source === "cleaned"} onChange={() => setSource("cleaned")} />
              <strong>The cleaned version</strong>
              <small>Only if you hear a hum in the original that isn’t in this one</small>
            </label>
          </fieldset>
        )}
        <label className="k-check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.currentTarget.checked)} disabled={busy} />
          This is my own voice, and I want to use a copy of it to narrate this video.
        </label>
      </section>

      <section className="k-card k-flush">
        <div className="k-card-head">
          <h2>Script</h2>
          <button className="k-link" onClick={() => setTexts(NARRATION.map((n) => n.text))} disabled={busy}>
            Reset script
          </button>
        </div>
        <ol className="k-script">
          {NARRATION.map((n, i) => {
            const line = lines[i];
            return (
              <li key={n.at}>
                <span className="k-script-time">
                  {Math.floor(n.at / 60)}:{String(Math.floor(n.at % 60)).padStart(2, "0")}
                  <small>{n.scene}</small>
                </span>
                <textarea
                  aria-label={`Line at ${n.at} seconds (${n.scene})`}
                  value={texts[i]}
                  rows={2}
                  maxLength={600}
                  disabled={busy}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setTexts((t) => t.map((x, j) => (j === i ? value : x)));
                  }}
                />
                {line && line.start - line.at > 0.4 && (
                  <small className="k-script-late">Starts {(line.start - line.at).toFixed(1)} s late — the line before is long. Shorten one of them.</small>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="k-card">
        <div className="k-studio-actions">
          <button className="k-btn" onClick={() => void test()} disabled={!file || !consent || busy}>
            <Play size={15} />
            Test my voice (1 line)
          </button>
          <button
            className="k-btn k-btn-primary"
            onClick={() => void make()}
            disabled={!file || !consent || busy || approved !== true}
            title={approved === true ? "" : "Approve the test line first"}
          >
            {busy ? <LoaderCircle size={15} className="spin" /> : narration ? <RefreshCw size={15} /> : <Mic size={15} />}
            {narration ? "Make it again" : "Make all 16 lines"}
          </button>
          {approved !== true && <span className="k-muted">All 16 lines unlock after you approve the test line.</span>}
          {progress && <span className="k-muted" role="status">{progress}</span>}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {testLine && (
          <div className="k-compare">
            <h3>Compare: does the clone sound like you?</h3>
            <div className="k-players">
              {urls.original && (
                <label>
                  Your original
                  <audio src={urls.original} controls preload="metadata" />
                </label>
              )}
              {urls.cleaned && (
                <label>
                  Cleaned
                  <audio src={urls.cleaned} controls preload="metadata" />
                </label>
              )}
              <label>
                Cloned voice — line 1
                <audio src={testLine} controls preload="auto" aria-label="Test line in your voice" />
              </label>
            </div>
            {measured.length > 1 && <Comparison measured={measured} sourceName={source === "cleaned" && cleanFile ? "Cleaned" : "Your original"} />}
            <p className="k-muted">
              The numbers compare averages only. Accent, pronunciation and natural expression can only be judged by
              listening: play your original, then the clone, a few times each.
            </p>
            <div className="k-studio-actions" role="group" aria-label="Your decision">
              <button className={`k-btn ${approved === true ? "k-btn-primary" : ""}`} aria-pressed={approved === true} onClick={() => setApproved(true)} disabled={busy}>
                <Check size={15} />
                Approve — this sounds like me
              </button>
              <button className="k-btn" aria-pressed={approved === false} onClick={() => setApproved(false)} disabled={busy}>
                <X size={15} />
                No, it doesn’t
              </button>
            </div>
            {approved === false && (
              <div className="k-studio-tips" role="status">
                <strong>To get a closer clone:</strong>
                <ul>
                  <li>Record 20–30 seconds in a quiet room (fan and TV off), phone about 20 cm away.</li>
                  <li>Talk naturally, the way you’d explain Udhaar to a friend — not reading.</li>
                  <li>Use your normal language mix (Hindi/Hinglish), since the script is in Hindi.</li>
                </ul>
                Then upload the new recording and test again. Nothing else will be generated.
              </div>
            )}
          </div>
        )}
        {narration && (
          <>
            <p className="k-muted">
              Press play to hear your narration with the video.
              {late.length ? ` ${late.length} line(s) start a little late; that’s fine, or shorten them and make it again.` : " Every line lands on its scene."}
            </p>
            <video
              ref={video}
              className="k-studio-video"
              src={VIDEO}
              controls
              muted
              playsInline
              onPlay={() => sync(true)}
              onPause={() => sync(false)}
              onSeeked={() => sync(!video.current?.paused)}
            />
            <audio ref={audio} src={narration} preload="auto" />
            <div className="k-studio-actions">
              {bundle && (
                <a className="k-btn k-btn-primary" href={bundle} download="udhaar-narration.zip">
                  <FileArchive size={15} />
                  Download everything (ZIP)
                </a>
              )}
              <a className="k-btn" href={narration} download="udhaar-narration.wav">
                <Download size={15} />
                Narration only (WAV)
              </a>
              <button className="k-btn" onClick={() => { if (video.current) { video.current.currentTime = 0; void video.current.play(); } }}>
                <Play size={15} />
                Play from the start
              </button>
            </div>
            <p className="k-muted">
              Send the ZIP to Claude: it has each line separately, so the video can be re-timed around your voice
              instead of speeding your voice up.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Comparison({ measured, sourceName }: { measured: Measured[]; sourceName: string }) {
  const source = measured.find((m) => m.name === sourceName) ?? measured[0];
  const clone = measured[measured.length - 1];
  const v = verdicts(source.p, clone.p);
  const hz = (n: number) => `${Math.round(n)} Hz`;
  return (
    <div className="k-table-wrap" tabIndex={0} role="region" aria-label="Voice comparison">
      <table className="k-compare-table">
        <thead>
          <tr>
            <th scope="col">Measure</th>
            {measured.map((m) => (
              <th key={m.name} scope="col">{m.name}</th>
            ))}
            <th scope="col">Clone vs {sourceName.toLowerCase()}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Pitch (median)</th>
            {measured.map((m) => <td key={m.name}>{hz(m.p.pitchMedian)}</td>)}
            <td>{v.pitch} ({v.pitchOff.toFixed(0)}% apart)</td>
          </tr>
          <tr>
            <th scope="row">Pitch range (10–90%)</th>
            {measured.map((m) => <td key={m.name}>{hz(m.p.pitchLow)}–{hz(m.p.pitchHigh)}</td>)}
            <td>wider range = more natural expression</td>
          </tr>
          <tr>
            <th scope="row">Speaking pace</th>
            {measured.map((m) => <td key={m.name}>{m.p.syllablesPerSecond.toFixed(1)} syllables/s</td>)}
            <td>{v.rhythm} ({v.rateOff.toFixed(0)}% apart)</td>
          </tr>
          <tr>
            <th scope="row">Pauses</th>
            {measured.map((m) => <td key={m.name}>{Math.round(m.p.pauseShare * 100)}%</td>)}
            <td>a script line has fewer pauses than free talk</td>
          </tr>
          <tr>
            <th scope="row">Brightness</th>
            {measured.map((m) => <td key={m.name}>{hz(m.p.brightness)}</td>)}
            <td>higher = thinner / brighter</td>
          </tr>
          <tr>
            <th scope="row">Tone (spectral shape)</th>
            {measured.map((m) => <td key={m.name}>{m === source ? "reference" : `${timbreDifference(source.p.bands, m.p.bands).toFixed(1)} dB off`}</td>)}
            <td>{v.toneWord} ({v.tone.toFixed(1)} dB)</td>
          </tr>
        </tbody>
      </table>
      <p className="k-muted k-small">
        Pitch in a recording with a steady background sound can read low; if “Your original” shows a pitch near 90 Hz but
        you don’t have a very deep voice, trust your ears over that row.
      </p>
    </div>
  );
}
