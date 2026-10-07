#!/usr/bin/env python3
"""Join a take's rendered segments into one MP4 with narration and an optional music bed.

Usage: assemble.py <spec.json> --take v01 --res 1080|2160
Reads <take>/render-<res>/edl.json (from render.py). Writes <take>/<video>-<take>-<res>.mp4.
Music: spec "music": {"file": "music.mp3", "volume": 0.06}, path relative to the video folder.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("spec", type=Path)
    ap.add_argument("--take", required=True)
    ap.add_argument("--res", type=int, choices=(1080, 2160), default=1080)
    args = ap.parse_args()

    spec = json.loads(args.spec.read_text())
    video_dir = args.spec.parent
    take = video_dir / args.take
    render_dir = take / f"render-{args.res}"
    edl = json.loads((render_dir / "edl.json").read_text())
    if edl["res"] != args.res:
        raise SystemExit(f"edl.json was rendered at {edl['res']}, not {args.res}")

    segments = [seg for section in edl["sections"] for seg in section["segments"]]
    concat = render_dir / "concat.txt"
    concat.write_text("".join(f"file '{Path(s['file']).as_posix()}'\n" for s in segments))
    voices, t = [], 0.0
    for seg in segments:
        if seg.get("say"):
            voices.append((seg["say"], t + seg["sayAt"]))
        t += seg["duration"]
    total = t

    inputs = ["-f", "concat", "-safe", "0", "-i", str(concat)]
    filters, labels = [], []
    for i, (path, at) in enumerate(voices, start=1):
        inputs += ["-i", path]
        ms = round(at * 1000)
        filters.append(f"[{i}:a]aresample=48000,adelay={ms}|{ms}[v{i}]")
        labels.append(f"[v{i}]")
    music = spec.get("music")
    if music and not (video_dir / music["file"]).exists():
        print(f"note: music file {music['file']} not found, assembling without music")
        music = None
    if music:
        idx = len(voices) + 1
        inputs += ["-stream_loop", "-1", "-i", str(video_dir / music["file"])]
        vol = music.get("volume", 0.06)
        filters.append(f"[{idx}:a]aresample=48000,atrim=0:{total:.3f},volume={vol},afade=t=in:d=1.5,afade=t=out:st={max(0, total - 2.5):.3f}:d=2.5[m]")
        labels.append("[m]")
    if labels:
        filters.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=longest,apad,atrim=0:{total:.3f}[aout]")
    else:
        filters.append(f"anullsrc=r=48000:cl=stereo,atrim=0:{total:.3f}[aout]")

    out = take / f"{video_dir.name}-{args.take}-{args.res}.mp4"
    cmd = ["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", ";".join(filters),
           "-map", "0:v", "-map", "[aout]", "-c:v", "libx264", "-crf", "15" if args.res >= 2160 else "17",
           "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True)
    print(f"{out}  ({total:.1f}s, {len(voices)} narration lines{', music' if music else ''})")


if __name__ == "__main__":
    main()
