import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Mic, Pause, Play, RotateCcw, Square, Trash2, Upload } from "lucide-react";
import { encodeWav } from "./lib/recorder";
import { makeZip } from "./lib/zip";
import { SCENES, VIDEO_SECONDS, expectedSeconds, fmt, sceneFile, type Scene } from "./lib/narration-script";
import "./khata.css";
import "./narrate.css";

/**
 * Record the walkthrough narration in your own voice, one scene at a time.
 * Everything stays in this browser (IndexedDB) until you download the ZIP. No AI, no upload.
 */
const VIDEO = "/video/udhaar-walkthrough.mp4";
const RATE = 48_000;

type Take = { n: number; wav: Blob; seconds: number; peakDb: number; source: "mic" | "file"; name: string };

// ---------- storage (best effort; the page still works without it) ----------
const DB = "udhaar-narration";
function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("takes", { keyPath: "n" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
async function saveTake(t: Take) {
  const db = await idb();
  if (!db) return;
  await new Promise<void>((r) => {
    const tx = db.transaction("takes", "readwrite");
    tx.objectStore("takes").put(t);
    tx.oncomplete = tx.onerror = () => r();
  });
}
async function deleteTake(n: number) {
  const db = await idb();
  if (!db) return;
  await new Promise<void>((r) => {
    const tx = db.transaction("takes", "readwrite");
    tx.objectStore("takes").delete(n);
    tx.oncomplete = tx.onerror = () => r();
  });
}
async function loadTakes(): Promise<Take[]> {
  const db = await idb();
  if (!db) return [];
  return new Promise((r) => {
    const req = db.transaction("takes").objectStore("takes").getAll();
    req.onsuccess = () => r(req.result as Take[]);
    req.onerror = () => r([]);
  });
}

// ---------- audio helpers ----------
/** Any recording (WAV / MP3 / M4A / browser recording) -> 48 kHz mono WAV, untouched otherwise. */
async function toWav(bytes: ArrayBuffer) {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(bytes);
  await ctx.close();
  if (decoded.duration > 60) throw new Error("That recording is over a minute long. Each scene needs only a few seconds.");
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const pcm = (await offline.startRendering()).getChannelData(0);
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  return { wav: encodeWav(pcm, RATE), seconds: decoded.duration, peakDb: 20 * Math.log10(peak || 1e-6) };
}

function levelNote(t: Take) {
  if (t.peakDb > -0.5) return { kind: "warn", text: "Too loud — some words may be clipped. Record again a little farther from the phone." };
  if (t.peakDb < -30) return { kind: "warn", text: "Very quiet. Move closer (about 15–20 cm) and record again." };
  return { kind: "ok", text: "Level is good." };
}

export default function NarrationPage() {
  const [takes, setTakes] = useState<Record<number, Take>>({});
  const [recording, setRecording] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<{ n: number; text: string } | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const urls = useRef<Record<number, string>>({});
  const media = useRef<{ rec: MediaRecorder; stream: MediaStream; ctx: AudioContext; started: number } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    document.title = "Record the narration · Udhaar";
    void loadTakes().then((list) => setTakes(Object.fromEntries(list.map((t) => [t.n, t]))));
    return () => {
      Object.values(urls.current).forEach((u) => URL.revokeObjectURL(u));
      media.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (recording === null) return;
    const t = setInterval(() => setElapsed(media.current ? (Date.now() - media.current.started) / 1000 : 0), 100);
    return () => clearInterval(t);
  }, [recording]);

  const urlFor = (t: Take) => {
    if (!urls.current[t.n]) urls.current[t.n] = URL.createObjectURL(t.wav);
    return urls.current[t.n];
  };
  async function keep(n: number, bytes: ArrayBuffer, source: Take["source"], name: string) {
    try {
      const { wav, seconds, peakDb } = await toWav(bytes);
      const take: Take = { n, wav, seconds, peakDb, source, name };
      if (urls.current[n]) URL.revokeObjectURL(urls.current[n]);
      delete urls.current[n];
      setTakes((all) => ({ ...all, [n]: take }));
      setZipUrl(null);
      await saveTake(take);
    } catch (e) {
      setError({ n, text: e instanceof Error ? e.message : "That file couldn’t be read. Use WAV, MP3 or M4A." });
    }
  }

  async function startRecording(n: number) {
    setError(null);
    try {
      // Browser "clean-up" (noise suppression, echo cancellation, auto volume) changes how a voice
      // sounds, so it is switched off: we keep your real voice and do gentle clean-up later.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        media.current = null;
        setRecording(null);
        setLevel(0);
        await keep(n, await new Blob(chunks, { type: rec.mimeType }).arrayBuffer(), "mic", "Recorded here");
      };
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const meter = () => {
        if (!media.current) return;
        analyser.getFloatTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v));
        setLevel(peak);
        requestAnimationFrame(meter);
      };
      media.current = { rec, stream, ctx, started: Date.now() };
      rec.start();
      setRecording(n);
      setElapsed(0);
      meter();
    } catch {
      setError({ n, text: "The microphone is blocked. Allow the mic for this site, or upload a recording instead." });
    }
  }
  function stopRecording() {
    media.current?.rec.stop();
  }
  async function remove(n: number) {
    if (urls.current[n]) URL.revokeObjectURL(urls.current[n]);
    delete urls.current[n];
    setTakes((all) => {
      const next = { ...all };
      delete next[n];
      return next;
    });
    setZipUrl(null);
    await deleteTake(n);
  }

  /**
   * Plays the scene's part of the video (muted) with the take. Like the final video, if the take is
   * longer than the scene, the picture holds on the scene's last frame until you finish.
   */
  const previewing = useRef<number | null>(null);
  function stopPreview() {
    previewing.current = null;
    video.current?.pause();
    audio.current?.pause();
    setPlaying(null);
  }
  function preview(s: Scene) {
    const v = video.current, a = audio.current, t = takes[s.n];
    if (!v || !a || !t) return;
    if (previewing.current === s.n) return stopPreview();
    previewing.current = s.n;
    setPlaying(s.n);
    v.currentTime = s.start;
    a.src = urlFor(t);
    a.currentTime = 0;
    void v.play();
    window.setTimeout(() => previewing.current === s.n && void a.play(), 150);
    const tick = () => {
      if (previewing.current !== s.n) return;
      if (!v.paused && v.currentTime >= s.end - 0.04) v.pause(); // hold the last frame
      if (v.paused && (a.ended || a.paused) && a.currentTime > 0) return stopPreview();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const missing = SCENES.filter((s) => !takes[s.n]).map((s) => s.n);
  const done = SCENES.length - missing.length;

  async function exportZip() {
    if (missing.length) return;
    const script = SCENES.map(
      (s) =>
        `Scene ${s.n}  ${fmt(s.start)}–${fmt(s.end)}  (${(s.end - s.start).toFixed(1)} s, expected speech ~${expectedSeconds(s)} s)\n` +
        `  On screen: ${s.visual}\n  Say: ${s.say}\n  Notes: ${s.tips.join(" ")}\n  Your take: ${takes[s.n].seconds.toFixed(1)} s\n`,
    ).join("\n");
    const timing = SCENES.map((s) => ({ scene: s.n, start: s.start, end: s.end, file: sceneFile(s.n), say: s.say, takeSeconds: +takes[s.n].seconds.toFixed(3) }));
    const zip = await makeZip([
      ...SCENES.map((s) => ({ name: sceneFile(s.n), data: takes[s.n].wav })),
      { name: "script.txt", data: script },
      { name: "timing.json", data: JSON.stringify({ video: "udhaar-walkthrough.mp4", videoSeconds: VIDEO_SECONDS, scenes: timing }, null, 1) },
    ]);
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    setZipUrl(URL.createObjectURL(zip));
  }

  return (
    <div className="nr">
      <header className="nr-bar">
        <a href="#" className="nr-back">
          <ArrowLeft size={16} aria-hidden="true" />
          Udhaar
        </a>
        <span className="nr-progress" aria-live="polite">
          {done} of {SCENES.length} scenes recorded
        </span>
      </header>

      <main className="nr-main">
        <section className="nr-intro">
          <h1>Record the narration in your own voice</h1>
          <p>
            One short recording per scene. Read the words the way you’d explain Udhaar to a friend. Your recordings stay in
            this browser until you download them. No AI voice is used.
          </p>
          <ul className="nr-tips">
            <li>Quiet room: fan, AC and TV off (they add a hum).</li>
            <li>Phone 15–20 cm from your mouth, same place for every scene.</li>
            <li>Wait half a second after pressing record, then speak; wait again before stopping.</li>
            <li>A take a little longer than the scene is fine: the video waits for you.</li>
          </ul>
          <video ref={video} className="nr-video" src={VIDEO} muted playsInline preload="metadata" controls aria-label="Walkthrough video (preview)" />
          <audio ref={audio} hidden />
        </section>

        <ol className="nr-scenes">
          {SCENES.map((s) => {
            const t = takes[s.n];
            const isRec = recording === s.n;
            const expected = expectedSeconds(s);
            const note = t ? levelNote(t) : null;
            return (
              <li key={s.n} className={`nr-scene ${t ? "has-take" : ""} ${isRec ? "is-recording" : ""}`} aria-labelledby={`scene-${s.n}`}>
                <div className="nr-scene-head">
                  <h2 id={`scene-${s.n}`}>Scene {s.n}</h2>
                  <span className="nr-time">
                    {fmt(s.start)}–{fmt(s.end)} · {(s.end - s.start).toFixed(1)} s on screen · speak ~{expected} s
                  </span>
                </div>
                <p className="nr-visual">On screen: {s.visual}</p>
                <p className="nr-say" lang="hi-Latn">
                  {s.say}
                </p>
                <ul className="nr-notes">
                  {s.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>

                <div className="nr-controls">
                  {isRec ? (
                    <>
                      <button className="k-btn nr-stop" onClick={stopRecording} aria-label={`Stop recording scene ${s.n}`}>
                        <Square size={14} fill="currentColor" />
                        Stop
                      </button>
                      <span className="nr-meter" role="meter" aria-label="Input level" aria-valuemin={0} aria-valuemax={1} aria-valuenow={+level.toFixed(2)}>
                        <i style={{ width: `${Math.min(100, level * 100)}%` }} className={level > 0.95 ? "hot" : ""} />
                      </span>
                      <span className="nr-elapsed" role="status">
                        {elapsed.toFixed(1)} s / ~{expected} s
                      </span>
                    </>
                  ) : (
                    <>
                      <button className="k-btn k-btn-primary" onClick={() => void startRecording(s.n)} disabled={recording !== null} aria-label={`${t ? "Re-record" : "Record"} scene ${s.n}`}>
                        {t ? <RotateCcw size={14} /> : <Mic size={14} />}
                        {t ? "Re-record" : "Record"}
                      </button>
                      <label className="k-btn nr-upload">
                        <Upload size={14} />
                        Upload
                        <input
                          type="file"
                          accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac"
                          aria-label={`Upload a recording for scene ${s.n}`}
                          onChange={async (e) => {
                            const f = e.currentTarget.files?.[0];
                            e.currentTarget.value = "";
                            if (f) await keep(s.n, await f.arrayBuffer(), "file", f.name);
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>

                {error?.n === s.n && <p className="form-error" role="alert">{error.text}</p>}
                {t && !isRec && (
                  <div className="nr-take">
                    <audio src={urlFor(t)} controls aria-label={`Your recording for scene ${s.n}`} />
                    <div className="nr-take-row">
                      <span>
                        {sceneFile(s.n)} · {t.seconds.toFixed(1)} s
                        {t.seconds > s.end - s.start + 2 ? " · the video will hold this scene a little longer" : ""}
                      </span>
                      <span className={`nr-level ${note!.kind}`}>{note!.text}</span>
                    </div>
                    <div className="nr-take-row">
                      <button className="k-btn" onClick={() => preview(s)}>
                        {playing === s.n ? <Pause size={14} /> : <Play size={14} />}
                        {playing === s.n ? "Stop preview" : "Preview with video"}
                      </button>
                      <button className="k-btn" onClick={() => void remove(s.n)} aria-label={`Delete the recording for scene ${s.n}`}>
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <section className="nr-export" aria-labelledby="export-title">
          <h2 id="export-title">Send your recordings</h2>
          {missing.length ? (
            <p className="nr-missing" role="status">
              Missing: {missing.map((n) => `scene ${n}`).join(", ")}. Every scene needs a recording before the video can be made.
            </p>
          ) : (
            <p>All 16 scenes are recorded. Download them and send the ZIP to Claude.</p>
          )}
          <div className="k-studio-actions">
            <button className="k-btn k-btn-primary" onClick={() => void exportZip()} disabled={missing.length > 0}>
              <Download size={14} />
              Prepare ZIP
            </button>
            {zipUrl && (
              <a className="k-btn" href={zipUrl} download="udhaar-narration-recordings.zip">
                <Download size={14} />
                Download udhaar-narration-recordings.zip
              </a>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
