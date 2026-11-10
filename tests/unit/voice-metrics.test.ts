import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { bands, pitch, profile, timbreDifference } from "../../src/lib/voice-metrics";

const rate = 16000;
/** A "voice": harmonic tone wandering 110–150 Hz, in syllable bursts with real pauses, plus optional hum. */
function voice(seconds: number, hum = 0) {
  const x = new Float32Array(seconds * rate);
  let phase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / rate;
    const f0 = 130 + 15 * Math.sin(t * 1.3) + 8 * Math.sin(t * 3.7 + 1);
    phase += (2 * Math.PI * f0) / rate;
    const inPause = t % 1.6 > 1.2; // 0.4 s pause every 1.6 s, like breaths between phrases
    const env = inPause ? 0 : Math.max(0, Math.sin(Math.PI * 4 * t)) ** 2; // ~4 syllables a second
    let s = 0;
    for (let h = 1; h <= 10; h++) s += Math.sin(phase * h) / h;
    x[i] = 0.3 * env * s + hum * Math.sin(2 * Math.PI * 187.5 * t);
  }
  return x;
}

test("YIN pitch follows the voice, not the octave above or below", () => {
  const p = pitch(voice(6));
  assert.ok(p.median > 115 && p.median < 145, `median ${p.median}`);
  assert.ok(p.low >= 105 && p.high <= 155, `range ${p.low}-${p.high}`);
});

test("identical voices have zero timbre difference; a tilted copy does not", () => {
  const a = voice(6);
  assert.equal(timbreDifference(bands(a, rate), bands(a, rate)), 0);
  const b = new Float32Array(a.length);
  for (let i = 1; i < a.length; i++) b[i] = a[i] - 0.9 * a[i - 1]; // brighter
  assert.ok(timbreDifference(bands(a, rate), bands(b, rate)) > 2);
});

test("on the owner's real sample: a speaking pitch, a speaking rhythm, and a stable profile", { skip: !existsSync("/tmp/voice-sample.mp3") }, () => {
  const raw = execFileSync("ffmpeg", ["-loglevel", "error", "-i", "/tmp/voice-sample.mp3", "-ac", "1", "-ar", "16000", "-t", "25", "-f", "f32le", "-"], { maxBuffer: 64 * 1024 * 1024 });
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const p = profile(x, rate);
  console.log("real sample:", JSON.stringify({ pitch: [p.pitchMedian, p.pitchLow, p.pitchHigh].map(Math.round), rate: p.syllablesPerSecond.toFixed(1), pauses: p.pauseShare.toFixed(2), brightness: Math.round(p.brightness) }));
  assert.ok(p.pitchMedian > 70 && p.pitchMedian < 300);
  assert.ok(p.syllablesPerSecond > 2 && p.syllablesPerSecond < 9);
  // The same voice measured on two halves should look alike (the metric is stable, not noise).
  const half = Math.floor(x.length / 2);
  assert.ok(timbreDifference(bands(x.subarray(0, half), rate), bands(x.subarray(half), rate)) < 3);
});
