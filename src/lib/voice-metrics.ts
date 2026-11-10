/**
 * Small, dependency-free voice measurements for the Voice studio: hum detection, pitch (YIN),
 * speaking rate, pauses, brightness and timbre (long-term spectrum in 1/3-octave bands).
 * They describe how a voice sounds on average; accent, pronunciation and expression still need ears.
 */

/** In-place iterative radix-2 FFT. re/im length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

const hann = (n: number) => Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));

/** Frame energies (dB) and which frames are speech: within 20 dB of the loud end. */
export function speechFrames(x: Float32Array, rate: number, frame = 0.04, hop = 0.01) {
  const n = Math.round(frame * rate), h = Math.round(hop * rate);
  const db: number[] = [];
  for (let s = 0; s + n <= x.length; s += h) {
    let e = 0;
    for (let i = s; i < s + n; i++) e += x[i] * x[i];
    db.push(10 * Math.log10(e / n + 1e-12));
  }
  const sorted = [...db].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.95)] ?? -100;
  return { n, h, db, speech: db.map((d) => d > loud - 20) };
}

/** Average power spectrum of speech frames (and the frequency of each bin). */
export function speechSpectrum(x: Float32Array, rate: number, size = 8192, speechOf: Float32Array = x) {
  const { speech, h } = speechFrames(speechOf, rate, size / rate, size / 4 / rate);
  const w = hann(size);
  const power = new Float64Array(size / 2 + 1);
  let count = 0;
  for (let f = 0, s = 0; s + size <= x.length; f++, s += h) {
    if (!speech[f]) continue;
    const re = new Float64Array(size), im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[i] = x[s + i] * w[i];
    fft(re, im);
    for (let k = 0; k <= size / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    count++;
  }
  for (let k = 0; k < power.length; k++) power[k] /= Math.max(count, 1);
  return { power, hz: (k: number) => (k * rate) / size, binHz: rate / size };
}

const BAND_EDGES = Array.from({ length: 20 }, (_, k) => 100 * 2 ** (k / 3)); // 100 Hz – 6.4 kHz

/** Long-term spectrum of speech in 1/3-octave bands (dB), ignoring bins near `skipHz`. */
export function bands(x: Float32Array, rate: number, skipHz: number[] = [], speechOf: Float32Array = x) {
  const { power, hz } = speechSpectrum(x, rate, 8192, speechOf);
  const out: number[] = [];
  for (let b = 0; b < BAND_EDGES.length - 1; b++) {
    let sum = 0, n = 0;
    for (let k = 0; k < power.length; k++) {
      const f = hz(k);
      if (f < BAND_EDGES[b] || f >= BAND_EDGES[b + 1] || skipHz.some((s) => Math.abs(f - s) < 12)) continue;
      sum += power[k];
      n++;
    }
    out.push(10 * Math.log10(sum / Math.max(n, 1) + 1e-20));
  }
  return out;
}

/** Average absolute difference in spectral shape (dB), level removed. 0 = identical tone. */
export function timbreDifference(a: number[], b: number[]) {
  const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
  return a.reduce((s, v, i) => s + Math.abs(v - ma - (b[i] - mb)), 0) / a.length;
}

/** Pitch with YIN on 16 kHz audio: median and 10–90% range of voiced frames, in Hz. */
export function pitch(x16: Float32Array, rate = 16000) {
  const n = Math.round(0.04 * rate), hop = Math.round(0.01 * rate);
  const minT = Math.floor(rate / 400), maxT = Math.ceil(rate / 65);
  const { speech } = speechFrames(x16, rate, 0.04, 0.01);
  const values: number[] = [];
  const d = new Float64Array(maxT + 1);
  for (let f = 0, s = 0; s + n + maxT <= x16.length; f++, s += hop) {
    if (!speech[f]) continue;
    for (let t = 1; t <= maxT; t++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const diff = x16[s + i] - x16[s + i + t];
        sum += diff * diff;
      }
      d[t] = sum;
    }
    let running = 0, best = -1;
    for (let t = 1; t <= maxT; t++) {
      running += d[t];
      const cmnd = (d[t] * t) / (running || 1);
      if (t >= minT && cmnd < 0.15) {
        best = t;
        while (best + 1 <= maxT && (d[best + 1] * (best + 1)) / (running + d[best + 1]) < cmnd) best++;
        break;
      }
    }
    if (best > 0) values.push(rate / best);
  }
  values.sort((a, b) => a - b);
  const q = (p: number) => values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
  return { median: q(0.5), low: q(0.1), high: q(0.9), voicedFrames: values.length };
}

/** Speaking rhythm: syllable-like energy peaks per second of speech, and the share of pauses. */
export function rhythm(x: Float32Array, rate: number) {
  const { db, speech } = speechFrames(x, rate, 0.025, 0.01);
  const smooth = db.map((_, i) => (db.slice(Math.max(0, i - 2), i + 3).reduce((s, v) => s + v, 0)) / Math.min(5, db.length));
  const first = speech.indexOf(true), last = speech.lastIndexOf(true);
  let peaks = 0, pauses = 0, voiced = 0;
  const sorted = [...db].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.95)] ?? -100;
  for (let i = Math.max(first, 1); i < Math.min(last, smooth.length - 1); i++) {
    if (speech[i]) voiced++;
    else pauses++;
    if (smooth[i] > smooth[i - 1] && smooth[i] >= smooth[i + 1] && smooth[i] > loud - 12) peaks++;
  }
  const seconds = Math.max(voiced, 1) / 100;
  return { syllablesPerSecond: peaks / seconds, pauseShare: pauses / Math.max(pauses + voiced, 1) };
}

/** Where the voice's energy sits (spectral centroid of speech, 80 Hz – 8 kHz). Higher = brighter. */
export function brightness(x: Float32Array, rate: number) {
  const { power, hz } = speechSpectrum(x, rate);
  let num = 0, den = 0;
  for (let k = 0; k < power.length; k++) {
    const f = hz(k);
    if (f < 80 || f > 8000) continue;
    const a = Math.sqrt(power[k]);
    num += a * f;
    den += a;
  }
  return den ? num / den : 0;
}

/** Linear resample (for analysis only). */
export function resample(x: Float32Array, from: number, to: number) {
  if (from === to) return x;
  const out = new Float32Array(Math.floor((x.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const p = (i * from) / to, j = Math.floor(p), t = p - j;
    out[i] = (x[j] ?? 0) * (1 - t) + (x[j + 1] ?? 0) * t;
  }
  return out;
}

export type VoiceProfile = {
  pitchMedian: number;
  pitchLow: number;
  pitchHigh: number;
  syllablesPerSecond: number;
  pauseShare: number;
  brightness: number;
  bands: number[];
};

export function profile(x: Float32Array, rate: number): VoiceProfile {
  const p = pitch(resample(x, rate, 16000));
  const r = rhythm(x, rate);
  return {
    pitchMedian: p.median,
    pitchLow: p.low,
    pitchHigh: p.high,
    syllablesPerSecond: r.syllablesPerSecond,
    pauseShare: r.pauseShare,
    brightness: brightness(x, rate),
    bands: bands(x, rate),
  };
}
