#!/usr/bin/env python3
"""
Build the narrated walkthrough from the owner's own recordings (no AI voice, no pitch or speed change).

  build_narrated_video.py VIDEO RECORDINGS_DIR OUT_DIR
    RECORDINGS_DIR holds scene_01.wav … scene_16.wav and timing.json (from the #/narrate recorder ZIP).

Per scene: gentle clean-up that keeps the voice as it is —
  low-cut 70 Hz; hum notches only for tones proven present in the silence before/after speaking;
  light noise reduction only when room noise is audible; light compression; trim only the dead air at
  the start and end (pauses inside are kept); the same loudness for every scene; peak limit.
  An identity guard compares the processed take with the raw one and falls back to lighter processing
  if the tone changed by more than 1.5 dB.
Video: each scene is cut from the original; if a take is longer than its scene, the scene's last frame is
held. Refuses to build if any scene is missing.
"""
import json, re, subprocess, sys, wave
from pathlib import Path
import numpy as np

RATE = 48_000
TARGET_LUFS = -18.0     # each scene; the final mix is normalised to -16 LUFS
FINAL_LUFS = -16.0
PAD_IN, PAD_OUT = 0.15, 0.25   # dead air kept before / after speech
TAIL = 0.35                    # quiet beat before the next scene can start
IDENTITY_LIMIT_DB = 1.5
FPS = 30


def sh(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f"{args[0]} failed: {r.stderr[-800:]}")
    return r


def read_pcm(path):
    r = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).copy()


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(pcm.tobytes())


def frames_db(x, frame=0.02):
    n = int(frame * RATE)
    m = len(x) // n
    if m == 0:
        return np.array([-120.0]), n
    f = x[: m * n].reshape(m, n)
    return 10 * np.log10((f ** 2).mean(1) + 1e-12), n


def speech_span(x):
    """First/last 20 ms frame clearly above the room noise; and the noise floor (dBFS)."""
    db, n = frames_db(x)
    noise = float(np.percentile(db, 10))
    peak = float(db.max())
    thr = max(noise + 12, peak - 40)
    idx = np.where(db > thr)[0]
    if len(idx) == 0:
        return None, noise
    return (idx[0] * n / RATE, (idx[-1] + 1) * n / RATE), noise


def hums_in_silence(x, span):
    """Narrow tones (45–400 Hz) present in the silence before and after speaking. Speech isn't analysed."""
    a, b = span
    parts = [x[: max(0, int((a - 0.05) * RATE))], x[int((b + 0.1) * RATE):]]
    parts = [p for p in parts if len(p) >= int(0.25 * RATE)]
    if sum(len(p) for p in parts) < int(0.4 * RATE):
        return []
    size = 1 << 17
    f = np.fft.rfftfreq(size, 1 / RATE)
    power = np.zeros(len(f))
    for p in parts:
        p = p[:size] * np.hanning(min(len(p), size))
        power += np.abs(np.fft.rfft(p, size)) ** 2 / (np.hanning(len(p)) ** 2).sum()
    db = 10 * np.log10(power / len(parts) + 1e-20)
    peaks = []
    lo, hi = np.searchsorted(f, 45), np.searchsorted(f, 400)
    for k in range(lo, hi):
        if db[k] < db[k - 1] or db[k] < db[k + 1]:
            continue
        ring = np.r_[db[max(0, k - 400):k - 60], db[k + 61:k + 401]]
        prom = db[k] - np.median(ring)
        if prom > 18:
            peaks.append((float(f[k]), float(prom)))
    found = []          # strongest first; anything within 15 Hz of a stronger tone is its side-lobe
    for h, p in sorted(peaks, key=lambda t: -t[1]):
        if not any(abs(h - g) < 15 for g, _ in found):
            found.append((h, p))
    return [round(h, 1) for h, _ in found[:3]]


BANDS = [100 * 2 ** (k / 3) for k in range(0, 20)]


def tone_shape(x, skip=()):
    """1/3-octave spectrum (dB) of speech frames, ignoring bins near notched hums."""
    n = 4096
    if len(x) < n:
        return None
    fr = np.lib.stride_tricks.sliding_window_view(x, n)[:: n // 2] * np.hanning(n)
    e = 10 * np.log10((fr ** 2).mean(1) + 1e-12)
    sel = fr[e > np.percentile(e, 95) - 20]
    S = (np.abs(np.fft.rfft(sel, axis=1)) ** 2).mean(0)
    f = np.fft.rfftfreq(n, 1 / RATE)
    keep = np.ones_like(f, bool)
    for h in skip:
        keep &= np.abs(f - h) > 20
    out = []
    for lo, hi in zip(BANDS, BANDS[1:]):
        m = (f >= lo) & (f < hi) & keep
        out.append(10 * np.log10(S[m].mean() + 1e-20))
    out = np.array(out)
    return out - out.mean()


def lufs(path):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    s = err[err.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", s).group(1)
    p = re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", s).group(1)
    return (float(i) if i != "-inf" else -70.0), (float(p) if p != "-inf" else -120.0)


def process_scene(raw_path, out_path, work):
    x = read_pcm(raw_path)
    span, noise = speech_span(x)
    if span is None:
        raise RuntimeError(f"{raw_path.name}: no speech found")
    hums = hums_in_silence(x, span)
    start = max(0.0, span[0] - PAD_IN)
    end = min(len(x) / RATE, span[1] + PAD_OUT)

    def chain(light):
        f = ["highpass=f=70"]
        f += [f"bandreject=f={h}:width_type=q:w=30" for h in hums]
        if not light and noise > -62:
            f.append(f"afftdn=nr={min(10, max(4, (noise + 62) / 2)):.1f}:nf={max(-80, min(-20, noise)):.0f}")
        if not light:
            f.append("acompressor=threshold=-24dB:ratio=2:attack=10:release=150:makeup=1")
        f += [f"atrim=start={start:.3f}:end={end:.3f}", "asetpts=PTS-STARTPTS", "afade=t=in:d=0.02"]
        return ",".join(f)

    raw_trim = x[int(start * RATE):int(end * RATE)]
    ref = tone_shape(raw_trim, hums)
    for light in (False, True):
        tmp = work / f"{out_path.stem}.stage.wav"
        sh(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw_path), "-ac", "1", "-ar", str(RATE), "-af", chain(light), str(tmp)])
        y = read_pcm(tmp)
        n = int(0.06 * RATE)
        if len(y) > n:
            y[-n:] *= np.linspace(1, 0, n)          # gentle fade-out, no click
        shape = tone_shape(y, hums)
        change = float(np.abs(shape - ref).mean()) if shape is not None and ref is not None else 0.0
        if change <= IDENTITY_LIMIT_DB or light:
            break
    write_wav(tmp, y)
    i, _ = lufs(tmp)
    gain = float(np.clip(TARGET_LUFS - i, -20, 24))
    sh(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-af", f"volume={gain:.2f}dB,alimiter=limit=0.84:attack=2:release=50:level=disabled", "-ar", str(RATE), str(out_path)])
    i2, p2 = lufs(out_path)
    y2 = read_pcm(out_path)
    return {
        "raw_seconds": round(len(x) / RATE, 2),
        "seconds": round(len(y2) / RATE, 2),
        "speech_seconds": round(span[1] - span[0], 2),
        # Only dead air outside the spoken part is trimmed; the processed take must be exactly that long.
        "words_kept": bool(abs(len(y2) / RATE - (end - start)) < 0.05),
        "room_noise_dbfs": round(noise, 1),
        "hum_removed_hz": hums,
        "noise_reduction": (noise > -62) and not light,
        "lighter_processing_used": light,
        "tone_change_db": round(change, 2),
        "lufs": i2,
        "peak_dbfs": p2,
        "raw_clipped": bool((np.abs(x) > 0.995).sum() > 20),
    }


def main(video, rec_dir, out_dir):
    rec, out = Path(rec_dir), Path(out_dir)
    timing = json.loads((rec / "timing.json").read_text())
    scenes = sorted(timing["scenes"], key=lambda s: s["scene"])
    missing = [s["file"] for s in scenes if not (rec / s["file"]).exists()]
    if missing:
        raise SystemExit(f"Not building: missing recordings {', '.join(missing)}")
    (out / "processed").mkdir(parents=True, exist_ok=True)
    work = out / "work"; work.mkdir(exist_ok=True)
    video_len = float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)]).stdout)

    # 1. Audio per scene.
    for s in scenes:
        s["audio"] = process_scene(rec / s["file"], out / "processed" / s["file"], work)

    # 2. Timeline: each take starts with its scene; the scene holds its last frame if the take needs longer.
    clock = 0.0
    for i, s in enumerate(scenes):
        end = scenes[i + 1]["start"] if i + 1 < len(scenes) else video_len
        need = s["audio"]["seconds"] + TAIL
        s["hold"] = round(max(0.0, need - (end - s["start"])), 3)
        s["src_end"] = end
        s["final_start"] = round(clock, 3)
        clock += (end - s["start"]) + s["hold"]
    total = clock

    # 3. Video, one file per scene, joined without re-encoding.
    listing = []
    for k, s in enumerate(scenes):
        part = work / f"v{k:02d}.mp4"
        vf = f"fps={FPS},format=yuv420p" + (f",tpad=stop_mode=clone:stop_duration={s['hold']}" if s["hold"] else "")
        sh(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{s['start']:.3f}", "-to", f"{s['src_end']:.3f}", "-i", str(video), "-an",
            "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-video_track_timescale", "15360", str(part)])
        listing.append(f"file '{part.resolve()}'")
    (work / "v.txt").write_text("\n".join(listing) + "\n")
    silent = work / "video.mp4"
    sh(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(work / "v.txt"), "-c", "copy", str(silent)])

    # 4. Narration track: every processed take at its scene's new start. No overlaps by construction.
    inputs, chains, labels = [], [], []
    for k, s in enumerate(scenes):
        inputs += ["-i", str(out / "processed" / s["file"])]
        ms = int(round(s["final_start"] * 1000))
        chains.append(f"[{k}:a]adelay={ms}|{ms}[a{k}]")
        labels.append(f"[a{k}]")
    chains.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0,apad=whole_dur={total:.3f},atrim=end={total:.3f}[m]")
    mix = work / "mix.wav"
    sh(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(chains), "-map", "[m]", "-ar", str(RATE), str(mix)])
    i, _ = lufs(mix)
    narration = out / "narration.wav"
    sh(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mix), "-af", f"volume={FINAL_LUFS - i:.2f}dB,alimiter=limit=0.84:level=disabled", "-ar", str(RATE), str(narration)])
    final = out / "udhaar-walkthrough-narrated.mp4"
    sh(["ffmpeg", "-y", "-loglevel", "error", "-i", str(silent), "-i", str(narration), "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(final)])

    # 5. QA.
    nl, npk = lufs(narration)
    scene_lufs = [s["audio"]["lufs"] for s in scenes]
    gaps = []
    for a, b in zip(scenes, scenes[1:]):
        silence = (b["final_start"] + PAD_IN) - (a["final_start"] + a["audio"]["seconds"] - PAD_OUT)
        if silence > 3.0:
            gaps.append({"between": [a["scene"], b["scene"]], "seconds": round(silence, 1)})
    vdur = float(sh(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=duration", "-of", "csv=p=0", str(final)]).stdout)
    adur = float(sh(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=duration", "-of", "csv=p=0", str(final)]).stdout)
    report = {
        "all_scenes_recorded": True,
        "video_seconds": {"original": round(video_len, 2), "final": round(vdur, 2), "audio": round(adur, 2)},
        "narration": {"lufs": nl, "peak_dbfs": npk},
        "scene_loudness_spread_lu": round(max(scene_lufs) - min(scene_lufs), 2),
        "words_kept_every_scene": all(s["audio"]["words_kept"] for s in scenes),
        "max_tone_change_db": max(s["audio"]["tone_change_db"] for s in scenes),
        "scenes_held": [{"scene": s["scene"], "seconds": s["hold"]} for s in scenes if s["hold"]],
        "silences_over_3s": gaps,
        "raw_takes_clipped": [s["scene"] for s in scenes if s["audio"]["raw_clipped"]],
        "scenes": [{k: v for k, v in s.items() if k not in ("say",)} for s in scenes],
    }
    (out / "report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
    print(json.dumps({k: v for k, v in report.items() if k != "scenes"}, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main(*sys.argv[1:4])
