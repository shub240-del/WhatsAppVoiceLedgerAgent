// Records the microphone as 16 kHz mono 16-bit WAV. WAV is used because browsers' default
// MediaRecorder output (WebM) is not accepted by Gnani speech-to-text, while WAV works everywhere.
export const MAX_RECORD_MS = 30_000;
const TARGET_RATE = 16_000;

export type Recording = { wav: Blob; durationMs: number };

export class WavRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = TARGET_RATE;
  private startedAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  static supported() {
    return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof AudioContext !== "undefined";
  }

  /** Starts recording; `onAutoStop` fires if the 30 s limit is reached. */
  async start(onAutoStop: () => void) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.context = new AudioContext();
    this.sampleRate = this.context.sampleRate;
    const source = this.context.createMediaStreamSource(this.stream);
    this.node = this.context.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.node.onaudioprocess = (event) => this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    source.connect(this.node);
    this.node.connect(this.context.destination);
    this.startedAt = performance.now();
    this.timer = setTimeout(onAutoStop, MAX_RECORD_MS - 200);
  }

  elapsedMs() {
    return this.startedAt ? performance.now() - this.startedAt : 0;
  }

  async stop(): Promise<Recording> {
    if (this.timer) clearTimeout(this.timer);
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.context?.close().catch(() => undefined);
    const samples = merge(this.chunks);
    this.chunks = [];
    const pcm = downsample(samples, this.sampleRate, TARGET_RATE);
    this.startedAt = 0;
    return { wav: encodeWav(pcm, TARGET_RATE), durationMs: Math.round((pcm.length / TARGET_RATE) * 1000) };
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.context?.close().catch(() => undefined);
    this.chunks = [];
    this.startedAt = 0;
  }
}

function merge(chunks: Float32Array[]) {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Averaging downsampler (simple low-pass) from the device rate to 16 kHz. */
export function downsample(input: Float32Array, from: number, to: number) {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

export function encodeWav(samples: Float32Array, rate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE");
  text(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
