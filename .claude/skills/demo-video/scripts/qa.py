#!/usr/bin/env python3
"""QA a finished render: file shape, long silences, and a timestamp contact sheet to look at.

Usage: qa.py <video.mp4> --res 1080|2160
Writes <video>.qa/ next to the file. Exits 2 on blockers (wrong size, no audio). Quality is fixed by the encoder CRF, so bitrate is not checked:
a calm, mostly static video is legitimately small.
Adapted from Sojan's qa_video.py.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

LONG_SILENCE = 2.5  # seconds; section cards hold about 3s of music only, so anything longer is suspicious


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, text=True, capture_output=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video", type=Path)
    ap.add_argument("--res", type=int, choices=(1080, 2160), default=1080)
    ap.add_argument("--every", type=float, default=3.0)
    args = ap.parse_args()
    out = args.video.with_suffix(".qa")
    out.mkdir(exist_ok=True)

    meta = json.loads(run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,bit_rate",
                           "-show_entries", "format=duration", "-of", "json", str(args.video)]).stdout)
    video = next((s for s in meta["streams"] if s["codec_type"] == "video"), None)
    blockers = []
    expected = (1920, 1080) if args.res == 1080 else (3840, 2160)
    if not video:
        blockers.append("no video stream")
    elif (int(video["width"]), int(video["height"])) != expected:
        blockers.append(f"expected {expected[0]}x{expected[1]}, got {video['width']}x{video['height']}")
    if not any(s["codec_type"] == "audio" for s in meta["streams"]):
        blockers.append("no audio stream")

    silence = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(args.video), "-af", "silencedetect=n=-40dB:d=1.0", "-f", "null", "-"],
                             text=True, capture_output=True).stderr
    warnings = []
    start = None
    for line in silence.splitlines():
        if "silence_start:" in line:
            start = float(line.rsplit("silence_start:", 1)[1].strip())
        if "silence_duration:" in line:
            d = float(line.rsplit("silence_duration:", 1)[1].strip())
            if d > LONG_SILENCE:
                warnings.append(f"{d:.1f}s without narration from {start:.1f}s: intended (section card) or a gap to fix?")

    with tempfile.TemporaryDirectory() as tmp:
        run(["ffmpeg", "-y", "-i", str(args.video), "-vf", f"fps=1/{args.every},scale=480:-1", f"{tmp}/f_%04d.jpg"])
        frames = sorted(Path(tmp).glob("f_*.jpg"))
        cols, cw, ch = 6, 480, 300
        sheet = Image.new("RGB", (cols * cw, ((len(frames) + cols - 1) // cols) * ch), "white")
        draw = ImageDraw.Draw(sheet)
        for i, f in enumerate(frames):
            x, y = (i % cols) * cw, (i // cols) * ch
            sheet.paste(Image.open(f), (x, y + 30))
            s = round(i * args.every)
            draw.text((x + 8, y + 8), f"{s // 60:02d}:{s % 60:02d}", fill=(20, 20, 20))
        sheet.save(out / "contact-sheet.jpg", quality=90)

    (out / "report.json").write_text(json.dumps({"blockers": blockers, "warnings": warnings, "meta": meta}, indent=2))
    print(f"contact sheet: {out / 'contact-sheet.jpg'}")
    for w in warnings:
        print(f"warning: {w}")
    if blockers:
        for b in blockers:
            print(f"BLOCKER: {b}")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
