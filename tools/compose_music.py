#!/usr/bin/env python3
"""
Original background music for the Udhaar walkthrough, written from scratch (no samples, no loops from anywhere).

  compose_music.py REPORT_JSON OUT_WAV

Raag Bhupali on D (Sa Re Ga Pa Dha — warm, bright, no sharp edges), 92 bpm.
Layers: tanpura-like drone, plucked santoor-like melody (Karplus-Strong), soft bass, light shaker and a
soft low "dha" on the beat. The arrangement follows the video's sections, taken from the build report:
  title → story → WhatsApp entries (builds) → Sunday reminders (brightest) → web khata (calmer) → end card (resolves).
The melody sits an octave above the voice and the whole bed is ducked under speech in the final mix.
"""
import json, sys, wave
import numpy as np
from scipy.signal import lfilter, butter, sosfilt, fftconvolve

R = 48_000
BPM = 92
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)
D3 = 146.83
SCALE = [0, 2, 4, 7, 9]                       # Sa Re Ga Pa Dha


def hz(degree, octave=0):
    """Scale degree (0..4, may exceed) to frequency above D3."""
    o, d = divmod(degree, 5)
    return D3 * 2 ** ((SCALE[d] + 12 * (o + octave)) / 12)


def pluck(freq, dur, bright=0.5, decay=0.996):
    """Karplus-Strong string: noise burst through a tuned feedback delay."""
    n = int(dur * R)
    p = max(2, int(round(R / freq)))
    burst = rng.uniform(-1, 1, p)
    burst = lfilter([bright, 1 - bright], [1], burst)    # softer attack
    x = np.zeros(n); x[:p] = burst
    a = np.zeros(p + 2); a[0] = 1; a[p] = -0.5 * decay; a[p + 1] = -0.5 * decay
    y = lfilter([1], a, x)
    y *= np.minimum(1, np.linspace(dur, 0, n) / 0.08)     # no click at the end
    return y / (np.abs(y).max() + 1e-9)


def tone(freq, dur, harmonics=(1, .5, .25), attack=0.02, release=0.3):
    t = np.arange(int(dur * R)) / R
    y = sum(a * np.sin(2 * np.pi * freq * (k + 1) * t) for k, a in enumerate(harmonics))
    env = np.minimum(1, t / attack) * np.minimum(1, (dur - t) / release)
    return y * np.clip(env, 0, 1)


def thump(dur=0.35):
    t = np.arange(int(dur * R)) / R
    f = 70 + 80 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / R) * np.exp(-t * 11)


def shaker(dur=0.06):
    n = int(dur * R)
    y = sosfilt(butter(4, 6000, "hp", fs=R, output="sos"), rng.uniform(-1, 1, n))
    return y * np.exp(-np.arange(n) / R * 70)


def place(buf, sig, at, gain, pan=0.0):
    i = int(at * R)
    if i >= buf.shape[1]:
        return
    sig = sig[: buf.shape[1] - i] * gain
    buf[0, i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    buf[1, i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


# Two-bar phrases: (beat, degree, beats long) with degree 5 = upper Sa.
PHRASE_A = [(0, 2, .5), (.5, 3, .5), (1, 4, 1), (2, 3, .5), (2.5, 2, .5), (3, 1, 1), (4, 0, 1.5), (5.5, 1, .5), (6, 2, 2)]
PHRASE_B = [(0, 3, .5), (.5, 4, .5), (1, 5, 1), (2, 4, .5), (3, 3, 1), (4, 2, 1), (5, 3, .5), (5.5, 2, .5), (6, 1, 1), (7, 0, 1)]
PHRASE_C = [(0, 4, 1), (1, 5, 1), (2, 6, 1.5), (3.5, 5, .5), (4, 4, 1), (5, 3, .5), (5.5, 4, .5), (6, 5, 2)]
PHRASE_END = [(0, 2, .5), (.5, 1, .5), (1, 0, 3)]
BASS = [0, -2 + 5, -1 + 5, -2 + 5]          # Sa, Pa(low), Dha(low), Pa(low) — one root per bar


def main(report_path, out_path):
    rep = json.loads(open(report_path).read())
    starts = {s["scene"]: s["final_start"] for s in rep["scenes"]}
    total = rep["video_seconds"]["final"]
    # Sections in final-video time.
    sec = [
        ("title", 0, starts[2], dict(drone=.9, melody=.55, bass=0, perc=0, phrases="A")),
        ("story", starts[2], starts[4], dict(drone=1, melody=.6, bass=.6, perc=.3, phrases="A")),
        ("whatsapp", starts[4], starts[10], dict(drone=1, melody=.6, bass=.8, perc=1, phrases="AB")),
        ("sunday", starts[10], starts[15], dict(drone=1, melody=.7, bass=.8, perc=1, phrases="BC", bell=True)),
        ("web", starts[15], starts[16], dict(drone=1, melody=.5, bass=.6, perc=.5, phrases="AB")),
        ("end", starts[16], total, dict(drone=1, melody=.6, bass=.5, perc=0, phrases="E")),
    ]
    n = int((total + 0.5) * R)
    mus = np.zeros((2, n))

    # Drone: Sa + Pa + upper Sa, re-plucked every 2 beats like a tanpura, very soft.
    drone_notes = [hz(3, -1), hz(0), hz(0), hz(0, -1)]                # Pa, Sa, Sa, low Sa
    k, t = 0, 0.0
    while t < total:
        name, a, b, cfg = next(s for s in sec if s[1] <= t < s[2] or s is sec[-1])
        place(mus, pluck(drone_notes[k % 4], 3.2, bright=.2, decay=.9995), t, .10 * cfg["drone"], pan=[-.4, .2, .4, -.2][k % 4])
        k += 1; t += 2 * BEAT

    # Bar grid: melody, bass, percussion.
    bar_i, t = 0, 0.0
    phrase_pos = {}
    while t < total - 0.01:
        name, a, b, cfg = next(s for s in sec if s[1] <= t < s[2] or s is sec[-1])
        # Bass, one note per bar.
        if cfg["bass"]:
            for bt in (0, 2):
                place(mus, pluck(hz(BASS[bar_i % 4], -1), 2 * BEAT, bright=.15, decay=.998)[:int(2 * BEAT * R)] * .6
                      + tone(hz(BASS[bar_i % 4], -1), 2 * BEAT, harmonics=(1, .25), attack=.01, release=.9)[:int(2 * BEAT * R)] * .4,
                      t + bt * BEAT, .11 * cfg["bass"])
        # Percussion: low "dha" on 1 and 3, shaker on off-beats.
        if cfg["perc"]:
            for bt in (0, 2):
                place(mus, thump(), t + bt * BEAT, .13 * cfg["perc"])
            for e in range(8):
                if e % 2:
                    place(mus, shaker(), t + e * BEAT / 2 + rng.normal(0, .004), (.05 if e % 4 == 3 else .035) * cfg["perc"], pan=.3)
        # Melody: a two-bar phrase starting on even bars.
        if bar_i % 2 == 0:
            if cfg["phrases"] == "E":
                phrase = PHRASE_END
            else:
                j = phrase_pos.get(name, 0); phrase_pos[name] = j + 1
                phrase = {"A": PHRASE_A, "B": PHRASE_B, "C": PHRASE_C}[cfg["phrases"][j % len(cfg["phrases"])]]
            for beat, deg, ln in phrase:
                at = t + beat * BEAT
                if at < total - 0.3:
                    place(mus, pluck(hz(deg, 1), max(.6, ln * BEAT + .9), bright=.45, decay=.9985), at, .16 * cfg["melody"], pan=.15)
                    if cfg.get("bell") and beat in (0, 4):
                        place(mus, tone(hz(deg, 2), 1.2, harmonics=(1, 0, .2), attack=.005, release=1.1), at, .035, pan=-.3)
        bar_i += 1; t += BAR

    # Small room: short decaying noise impulse, 18% wet.
    ir_t = np.arange(int(1.1 * R)) / R
    ir = rng.normal(0, 1, (2, len(ir_t))) * np.exp(-ir_t * 5.5)
    ir /= np.sqrt((ir ** 2).sum(1, keepdims=True))
    wet = np.stack([fftconvolve(mus[c], ir[c])[:n] for c in range(2)])
    out = 0.82 * mus + 0.18 * wet
    # Warmth: gentle low-pass, take out sub rumble.
    out = sosfilt(butter(2, 9000, "lp", fs=R, output="sos"), out)
    out = sosfilt(butter(2, 60, "hp", fs=R, output="sos"), out)
    # Fade in 1.2 s, fade out over the last 2.5 s.
    env = np.ones(n)
    fi, fo = int(1.2 * R), int(2.5 * R)
    env[:fi] = np.linspace(0, 1, fi)
    end = int(total * R)
    env[end - fo:end] = np.linspace(1, 0, fo) ** 1.5
    env[end:] = 0
    out *= env
    out = out[:, :end] / (np.abs(out).max() + 1e-9) * 0.7
    pcm = (out.T * 32767).astype("<i2")
    with wave.open(out_path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(R); w.writeframes(pcm.tobytes())
    print(f"wrote {out_path}: {total:.2f} s, sections " + ", ".join(f"{s[0]} {s[1]:.1f}" for s in sec))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
