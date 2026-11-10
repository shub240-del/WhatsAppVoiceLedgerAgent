#!/usr/bin/env python3
"""
Put a narration (one WAV per line) onto the walkthrough video, scene by scene.

- Each line starts when its caption appears. If a line is longer than its scene, the scene's last
  frame is held a little longer (the screen is still at that point), instead of speeding up the voice.
- Each line is cleaned (low-cut, gentle compression, click-free fades) and the mix is normalised to
  -16 LUFS with a -1.5 dBTP ceiling, the usual level for online video.
- Writes the final MP4, the full narration WAV, the re-timed scene list and a QA report.

Usage: narrate_video.py VIDEO TIMING_JSON LINES_DIR OUT_DIR
  TIMING_JSON is timing.json from the Voice studio ZIP (line, scene, captionAt, text, seconds).
"""
import json, re, subprocess, sys
from pathlib import Path

LEAD = 0.15   # breath before a line starts, after its caption appears
TAIL = 0.45   # pause after a line before the next scene may begin
FPS = 30


def run(args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def probe_duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def loudness(path):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    summary = err[err.rfind("Summary:"):]
    i = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summary).group(1))
    peak = float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", summary).group(1).replace("-inf", "-200"))
    return i, peak


def main(video, timing_json, lines_dir, out_dir):
    out = Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    work = out / "work"; work.mkdir(exist_ok=True)
    timing = sorted(json.loads(Path(timing_json).read_text()), key=lambda t: t["line"])
    files = sorted(Path(lines_dir).glob("*.wav"))
    assert len(files) == len(timing), f"{len(files)} line files but {len(timing)} lines in timing.json"
    video_len = probe_duration(video)

    # 1. Clean each line and measure it.
    lines = []
    for t, f in zip(timing, files):
        clean = work / f"line-{t['line']:02d}.wav"
        run(["ffmpeg", "-y", "-i", str(f), "-af",
             "highpass=f=75,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2,"
             "afade=t=in:d=0.015,areverse,afade=t=in:d=0.04,areverse",
             "-ar", "48000", "-ac", "1", str(clean)])
        lines.append({**t, "file": clean, "dur": probe_duration(clean)})

    # 2. Re-time scenes: scene i runs from caption i to caption i+1; hold its last frame if the line needs longer.
    scenes, clock = [], 0.0
    for i, ln in enumerate(lines):
        a = ln["captionAt"]
        b = lines[i + 1]["captionAt"] if i + 1 < len(lines) else video_len
        need = LEAD + ln["dur"] + TAIL
        hold = max(0.0, need - (b - a))
        # The very last scene (end card) keeps its full length plus any hold.
        scenes.append({"line": ln["line"], "scene": ln["scene"], "src_start": a, "src_end": b, "hold": round(hold, 3),
                       "new_start": round(clock, 3), "voice_start": round(clock + LEAD, 3), "voice_seconds": round(ln["dur"], 3)})
        clock += (b - a) + hold
    total = clock

    # 3. Video: one file per scene (same size, rate and encoder), holding the last frame where needed,
    #    then joined without re-encoding. One scene at a time keeps memory low.
    listing = []
    for k, s in enumerate(scenes):
        part = work / f"scene-{k:02d}.mp4"
        tmp = work / f"scene-{k:02d}.tmp.mp4"
        vf = f"fps={FPS},format=yuv420p"
        if s["hold"] > 0:
            vf += f",tpad=stop_mode=clone:stop_duration={s['hold']}"
        run(["ffmpeg", "-y", "-ss", f"{s['src_start']:.3f}", "-to", f"{s['src_end']:.3f}", "-i", str(video), "-an",
             "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-video_track_timescale", "15360", str(tmp)])
        tmp.rename(part)
        listing.append(f"file '{part}'")
    (work / "scenes.txt").write_text("\n".join(listing) + "\n")
    silent = work / "video.mp4"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(work / "scenes.txt"), "-c", "copy", "-movflags", "+faststart", str(silent)])

    # 4. Audio: place every line at its new start, mix, normalise.
    inputs, chains, labels = [], [], []
    for k, (ln, s) in enumerate(zip(lines, scenes)):
        inputs += ["-i", str(ln["file"])]
        ms = int(round(s["voice_start"] * 1000))
        chains.append(f"[{k}:a]adelay={ms}|{ms}[a{k}]")
        labels.append(f"[a{k}]")
    chains.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0,apad=whole_dur={total:.3f},atrim=end={total:.3f}[mix]")
    raw_mix = work / "mix.wav"
    run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(chains), "-map", "[mix]", "-ar", "48000", str(raw_mix)])
    narration = out / "narration.wav"
    run(["ffmpeg", "-y", "-i", str(raw_mix), "-af", "loudnorm=I=-16:TP=-1.5:LRA=9", "-ar", "48000", str(narration)])

    final = out / "udhaar-walkthrough-narrated.mp4"
    run(["ffmpeg", "-y", "-i", str(silent), "-i", str(narration), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
         "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(final)])

    # 5. QA.
    i_lufs, peak = loudness(narration)
    gaps = []
    for a, b in zip(scenes, scenes[1:]):
        gap = b["voice_start"] - (a["voice_start"] + a["voice_seconds"])
        if gap > 4.0:
            gaps.append(f"{a['scene']} → {b['scene']}: {gap:.1f}s of silence")
    report = {
        "video_seconds_before": round(video_len, 2), "video_seconds_after": round(probe_duration(final), 2),
        "narration_lufs": i_lufs, "narration_peak_dbfs": peak, "clipping": peak > -1.0,
        "scenes_held": [f"{s['scene']}: +{s['hold']:.2f}s" for s in scenes if s["hold"] > 0],
        "long_silences": gaps, "every_scene_narrated": all(s["voice_seconds"] > 0.3 for s in scenes),
        "scenes": scenes,
    }
    (out / "report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
    print(json.dumps({k: v for k, v in report.items() if k != "scenes"}, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main(*sys.argv[1:5])
