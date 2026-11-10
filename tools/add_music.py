#!/usr/bin/env python3
"""
Lay background music under the narrated video, keeping the voice clearly on top.

  add_music.py NARRATED_MP4 NARRATION_WAV MUSIC_WAV OUT_MP4

- The music is cut a little (-3 dB) around 1–3 kHz, where words are understood, so it never masks them.
- It dips 9 dB while you speak, starting 0.15 s before each phrase and coming back up over 0.6 s after it.
- Music bed sits at about -24 LUFS between lines; the final mix is -16 LUFS with peaks under -1.5 dBFS.
- The narration itself isn't changed.
"""
import json, subprocess, sys, wave
import numpy as np

R = 48_000
DUCK_DB = 9.0
BED_LUFS = -24.0
FINAL_LUFS = -16.0


def run(args):
    r = subprocess.run(args, capture_output=True)
    if r.returncode:
        raise RuntimeError(r.stderr.decode()[-800:])
    return r


def pcm(path, ch):
    r = run(["ffmpeg", "-loglevel", "error", "-i", path, "-ac", str(ch), "-ar", str(R), "-f", "f32le", "-"])
    return np.frombuffer(r.stdout, np.float32).reshape(-1, ch).T.copy()


def lufs(path):
    import re
    e = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    s = e[e.rfind("Summary:"):]
    return float(re.search(r"I:\s+(-?[\d.]+) LUFS", s).group(1)), float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", s).group(1))


def write(path, x):
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[0]); w.setsampwidth(2); w.setframerate(R)
        w.writeframes((np.clip(x.T, -1, 1) * 32767).astype("<i2").tobytes())


def main(video, narration, music, out):
    work = out.rsplit("/", 1)[0] if "/" in out else "."
    # 1. Shape and level the music.
    shaped = f"{work}/music.shaped.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", music, "-af", "equalizer=f=1800:t=o:w=1.2:g=-3", "-ar", str(R), shaped])
    i, _ = lufs(shaped)
    m = pcm(shaped, 2) * 10 ** ((BED_LUFS - i) / 20)
    v = pcm(narration, 1)[0]
    n = min(len(v), m.shape[1])
    m, v = m[:, :n], v[:n]

    # 2. Where is the voice? 20 ms RMS, gated well above the cleaned room noise.
    hop = int(0.02 * R)
    frames = len(v) // hop
    rms = np.sqrt((v[: frames * hop].reshape(frames, hop) ** 2).mean(1) + 1e-12)
    db = 20 * np.log10(rms)
    speech = db > (np.percentile(db, 95) - 30)
    # Bridge short gaps between words (< 0.35 s) so the music doesn't pump inside a sentence.
    gap = int(0.35 / 0.02)
    idx = np.where(speech)[0]
    for a, b in zip(idx, idx[1:]):
        if 1 < b - a <= gap:
            speech[a:b] = True
    # Look ahead 0.15 s so the music is already down when a phrase starts.
    look = int(0.15 / 0.02)
    speech = np.r_[speech[look:], np.zeros(look, bool)] | speech

    # 3. Smooth gain: fall in 0.15 s, rise in 0.6 s.
    target = np.where(speech, -DUCK_DB, 0.0)
    g = np.zeros(frames)
    down, up = 0.02 / 0.15, 0.02 / 0.6
    for k in range(1, frames):
        step = target[k] - g[k - 1]
        g[k] = g[k - 1] + step * (down if step < 0 else up)
    gain = 10 ** (np.interp(np.arange(n), np.arange(frames) * hop + hop / 2, g) / 20)
    ducked = m * gain

    # 4. Mix, bring to -16 LUFS, limit.
    mix = ducked + v[None, :]
    raw = f"{work}/mix.raw.wav"
    write(raw, mix * 0.5)
    i, _ = lufs(raw)
    final_audio = f"{work}/narration-with-music.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", f"volume={FINAL_LUFS - i:.2f}dB,alimiter=limit=0.84:attack=3:release=60:level=disabled", "-ar", str(R), final_audio])
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-i", final_audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
         "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out])

    # 5. QA: how far the voice sits above the music while speaking, and the bed level between lines.
    sp = np.zeros(n, bool); sp[: frames * hop] = np.repeat(speech, hop)
    def level(x, mask):
        return 10 * np.log10((x[..., mask] ** 2).mean() + 1e-12)
    voice_over_music = level(v, sp) - level(ducked.mean(0), sp)
    fi, fp = lufs(final_audio)
    report = {
        "final_lufs": fi, "final_peak_dbfs": fp,
        "voice_above_music_while_speaking_db": round(float(voice_over_music), 1),
        "music_dip_while_speaking_db": DUCK_DB,
        "speaking_share": round(float(sp.mean()), 2),
        "seconds": round(n / R, 2),
    }
    print(json.dumps(report, indent=1))
    with open(f"{work}/music-report.json", "w") as fh:
        json.dump(report, fh, indent=1)


if __name__ == "__main__":
    main(*sys.argv[1:5])
