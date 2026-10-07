#!/usr/bin/env python3
"""Turn a recorded take into timed video segments.

Usage: render.py <spec.json> --take v01 --res 1080|2160 [--only section1,section2]

For each section it writes, under <take>/render-<res>/:
  <section>-00-card.mp4        the section card (no narration over cards)
  <section>-NN-<beat>.mp4      product beats (recorded frames on the website-style stage,
                               with cursor and focus moves) or scene beats (cards.mjs templates)
and edl.json: every segment in order with its duration and where its narration starts.
assemble.py joins the segments and lays the narration and music under them.

Timing: each beat lasts long enough for its own screen events (record.mjs minimums) and for its
narration; when narration runs longer, the last screen state holds. Footage is never sped up.
Compositing approach adapted from Sojan's composited_focus_renderer.py, restyled for chatwoot.com.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

import cursor_assets

SCRIPTS = Path(__file__).resolve().parent
FPS = 30
CARD_HOLD = 0.5      # silent beat after a section card's own animation
LEAD = 0.35          # narration starts this long after its beat begins
TAIL = 0.6           # screen keeps going this long after narration ends
SCENE_TAIL = 0.4
# Product window on the 1920x1080 canvas (16:10, matches 1440x900 captures); doubled for 4K.
STAGE = (256, 100, 1408, 880)
RADIUS = 18
WORDS_PER_SECOND = 2.6  # calm narration pace, used only to time silent trial renders
CURSOR_SCALE_4K = 0.8
HOTSPOT = {"arrow": (13, 9), "hand": (48, 21), "hand_down": (48, 21), "ibeam": (20, 40)}


def ease(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return x * x * x * (x * (x * 6 - 15) + 10)


def lerp(a: float, b: float, p: float) -> float:
    return a + (b - a) * p


def media_duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         check=True, text=True, capture_output=True).stdout
    return float(out.strip())


@dataclass(frozen=True)
class Camera:
    zoom: float
    fx: float  # focus point in source pixels
    fy: float


class Canvas:
    def __init__(self, res: int, stage_png: Path, cursor_dir: Path):
        self.f = 2 if res >= 2160 else 1
        self.size = (1920 * self.f, 1080 * self.f)
        x, y, w, h = STAGE
        self.rect = (x * self.f, y * self.f, w * self.f, h * self.f)
        self.radius = RADIUS * self.f
        self.background = Image.open(stage_png).convert("RGB").resize(self.size, Image.Resampling.LANCZOS)
        scale = CURSOR_SCALE_4K * self.size[0] / 3840
        self.cursors = {}
        for state, name in [("arrow", "arrow"), ("hand", "hand"), ("hand_down", "hand-down"), ("ibeam", "ibeam")]:
            path = cursor_dir / f"cursor-{name}.png"
            if path.exists():
                img = Image.open(path).convert("RGBA")
                self.cursors[state] = (img.resize((round(img.width * scale), round(img.height * scale)), Image.Resampling.LANCZOS), scale)
        self.cache: dict = {}

    def crop(self, cam: Camera, src: tuple[int, int]) -> tuple[float, float, float, float]:
        """Part of the source frame shown in the window. Zooms happen inside the fixed window frame:
        the frame never moves, so there are no background gaps or windows sliding off screen."""
        sw, sh = src
        w, h = sw / cam.zoom, sh / cam.zoom
        left = min(max(cam.fx - w / 2, 0), sw - w)
        top = min(max(cam.fy - h / 2, 0), sh - h)
        return (left, top, w, h)

    def to_canvas(self, point: tuple[float, float], cam: Camera, src: tuple[int, int]) -> tuple[float, float]:
        rx, ry, rw, rh = self.rect
        cl, ct, cw, ch = self.crop(cam, src)
        return (rx + (point[0] - cl) / cw * rw, ry + (point[1] - ct) / ch * rh)

    @lru_cache(maxsize=2)
    def frame_layer(self) -> tuple[Image.Image, Image.Image]:
        """Stage with the window's shadow (drawn once), and the window's rounded mask."""
        rx, ry, rw, rh = (round(v) for v in self.rect)
        pad = 60 * self.f
        shadow = Image.new("L", (rw + pad * 2, rh + pad * 2), 0)
        ImageDraw.Draw(shadow).rounded_rectangle((pad, pad + 14 * self.f, pad + rw, pad + rh + 14 * self.f), radius=self.radius, fill=46)
        stage = self.background.copy()
        stage.paste((24, 24, 27), (rx - pad, ry - pad), shadow.filter(ImageFilter.GaussianBlur(26 * self.f)))
        mask = Image.new("L", (rw, rh), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, rw - 1, rh - 1), radius=self.radius, fill=255)
        return stage, mask

    def compose(self, frame: Path, cam: Camera) -> Image.Image:
        key = (str(frame), round(cam.zoom, 4), round(cam.fx), round(cam.fy))
        if key in self.cache:
            return self.cache[key]
        src = load(str(frame))
        rx, ry, rw, rh = (round(v) for v in self.rect)
        stage, mask = self.frame_layer()
        canvas = stage.copy()
        cl, ct, cw, ch = self.crop(cam, src.size)
        product = src.resize((rw, rh), Image.Resampling.LANCZOS, box=(cl, ct, cl + cw, ct + ch))
        canvas.paste(product, (rx, ry), mask)
        ImageDraw.Draw(canvas).rounded_rectangle((rx, ry, rx + rw - 1, ry + rh - 1), radius=self.radius,
                                                 outline=(228, 228, 231), width=max(1, self.f))
        if len(self.cache) > 48:
            self.cache.clear()
        self.cache[key] = canvas
        return canvas

    def draw_cursor(self, canvas: Image.Image, pos: tuple[float, float], state: str, opacity: float) -> Image.Image:
        if opacity <= 0.01 or state not in self.cursors:
            return canvas
        img, scale = self.cursors[state]
        if opacity < 1:
            img = img.copy()
            img.putalpha(img.getchannel("A").point(lambda v: round(v * opacity)))
        hx, hy = HOTSPOT[state]
        out = canvas.copy()
        out.paste(img, (round(pos[0] - hx * scale), round(pos[1] - hy * scale)), img)
        return out


@lru_cache(maxsize=6)
def load(path: str) -> Image.Image:
    return Image.open(path).convert("RGB")


def encoder(out: Path, size: tuple[int, int], res: int) -> subprocess.Popen:
    return subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{size[0]}x{size[1]}", "-r", str(FPS),
         "-i", "-", "-c:v", "libx264", "-crf", "14" if res >= 2160 else "17", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(out)],
        stdin=subprocess.PIPE)


def plan_beat(beat: dict, say: float) -> tuple[list[tuple[float, float]], float]:
    """Start time and duration of every event; the last event absorbs narration overflow."""
    mins = [e["min"] for e in beat["events"]]
    total = max(sum(mins), (LEAD + say + TAIL) if say else 0)
    # Spread the extra time across the events so pointing keeps pace with the narration instead of
    # every action happening at once and the last screen holding.
    # The opening screen stays short when actions follow; the time goes to the actions.
    grow = range(1, len(mins)) if len(mins) > 1 else range(len(mins))
    extra = (total - sum(mins)) / len(grow)
    mins = [m + extra if i in grow else m for i, m in enumerate(mins)]
    starts, t = [], 0.0
    for m in mins:
        starts.append((t, m))
        t += m
    return starts, total


def cursor_track(beat: dict, slots: list[tuple[float, float]], src: tuple[int, int]) -> list[tuple[float, tuple[float, float], str, float]]:
    """Keyframes (time, source position, state, opacity). Travel ends just before the click switch."""
    keys = []
    pos = None
    for event, (start, _dur) in zip(beat["events"], slots):
        c = event.get("cursor")
        if event["kind"] == "goto":
            if pos:
                keys.append((start, pos, "arrow", 0.0))
            pos = None
            continue
        if not c:
            continue
        target = (c["x"], c["y"])
        switch = event.get("switchAt", 0.0)
        if event["kind"] == "type":
            keys.append((start, target, "ibeam", 1.0))
            pos = target
            continue
        if pos is None:  # enter from below-right of the target
            pos = (min(src[0] - 40, target[0] + 260), min(src[1] - 40, target[1] + 200))
            keys.append((start, pos, "arrow", 0.0))
            keys.append((start + 0.15, pos, "arrow", 1.0))
        arrive = start + max(0.25, switch - 0.18)
        keys.append((max(start, arrive - 0.6), pos, "arrow", 1.0))
        keys.append((arrive, target, c["state"], 1.0))
        if event["kind"] == "click":
            keys.append((start + switch - 0.08, target, "hand_down", 1.0))
            keys.append((start + switch + 0.06, target, c["state"], 1.0))
        pos = target
    return keys


def cursor_at(keys, t: float):
    if not keys or t < keys[0][0]:
        return None
    for (t0, p0, s0, o0), (t1, p1, s1, o1) in zip(keys, keys[1:]):
        if t0 <= t < t1:
            p = ease((t - t0) / (t1 - t0)) if t1 > t0 else 1
            return ((lerp(p0[0], p1[0], p), lerp(p0[1], p1[1], p)), s1 if p > 0.85 else s0, lerp(o0, o1, p))
    t_, pos, state, op = keys[-1]
    return (pos, state, op)


def camera_at(beat: dict, src: tuple[int, int], t: float, total: float) -> Camera:
    wide = Camera(1.0, src[0] / 2, src[1] / 2)
    if beat.get("drift"):  # a slow push-in across the whole beat ("slow pan" in a script)
        return Camera(1.0 + beat["drift"] * ease(t / total), src[0] / 2, src[1] / 2)
    focus = beat.get("focus")
    if not focus:
        return wide
    zoomed = Camera(beat.get("zoom", 1.3), focus["x"] + focus["width"] / 2, focus["y"] + focus["height"] / 2)
    p = ease((t - 0.3) / 0.9) * (1 - ease((t - (total - 0.9)) / 0.9))
    return Camera(lerp(wide.zoom, zoomed.zoom, p), lerp(wide.fx, zoomed.fx, p), lerp(wide.fy, zoomed.fy, p))


def render_product(beat: dict, say: float, canvas: Canvas, out: Path, res: int) -> float:
    slots, total = plan_beat(beat, say)
    src = load(beat["events"][0]["file"]).size
    keys = cursor_track(beat, slots, src)
    proc = encoder(out, canvas.size, res)
    assert proc.stdin
    for i in range(round(total * FPS)):
        t = i / FPS
        idx = max(j for j, (s, _) in enumerate(slots) if s <= t + 1e-6)
        start, _ = slots[idx]
        event = beat["events"][idx]
        frame = event["file"]
        if idx > 0 and t < start + event.get("switchAt", 0.0):
            frame = beat["events"][idx - 1]["file"]  # cursor is still travelling to the control
        cam = camera_at(beat, src, t, total)
        image = canvas.compose(Path(frame), cam)
        cur = cursor_at(keys, t)
        if cur:
            image = canvas.draw_cursor(image, canvas.to_canvas(cur[0], cam, src), cur[1], cur[2])
        proc.stdin.write(image.tobytes())
    proc.stdin.close()
    if proc.wait():
        raise SystemExit(f"ffmpeg failed for {out}")
    return total


def card(template: str, params: dict, out: Path, res: int, duration: float | None = None) -> float:
    cmd = ["node", str(SCRIPTS / "cards.mjs"), template, "--params", json.dumps(params), "--res", str(res), "--out", str(out)]
    if duration:
        cmd += ["--duration", f"{duration:.3f}"]
    result = json.loads(subprocess.run(cmd, check=True, text=True, capture_output=True).stdout.strip().splitlines()[-1])
    return result["duration"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("spec", type=Path)
    ap.add_argument("--take", required=True)
    ap.add_argument("--res", type=int, choices=(1080, 2160), default=1080)
    ap.add_argument("--only")
    ap.add_argument("--no-ending", action="store_true", help="leave out the logo ending (segment trials)")
    args = ap.parse_args()

    spec = json.loads(args.spec.read_text())
    video_dir = args.spec.parent
    take = video_dir / args.take
    out_dir = take / f"render-{args.res}"
    cache = take / "cache"
    out_dir.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    cursor_assets.generate(cache / "cursors")
    speech = json.loads((take / "speech" / "manifest.json").read_text()) if (take / "speech" / "manifest.json").exists() else {}
    only = set(args.only.split(",")) if args.only else None
    edl_path = out_dir / "edl.json"
    edl = {s["section"]: s for s in json.loads(edl_path.read_text())["sections"]} if edl_path.exists() else {}

    for section in spec["sections"]:
        sid = section["id"]
        if section.get("skip") or (only and sid not in only):
            continue
        accent = (section.get("card") or {}).get("accent", "blue")
        stage = cache / f"stage-{accent}-{args.res}.png"
        if not stage.exists():
            subprocess.run(["node", str(SCRIPTS / "cards.mjs"), "stage", "--params", json.dumps({"accent": accent}),
                            "--res", str(args.res), "--still", str(stage)], check=True, capture_output=True)
        canvas = Canvas(args.res, stage, cache / "cursors")
        timeline_path = take / "capture" / sid / "timeline.json"
        timeline = {b["id"]: b for b in json.loads(timeline_path.read_text())["beats"]} if timeline_path.exists() else {}
        segments = []
        if section.get("card"):
            seg = out_dir / f"{sid}-00-card.mp4"
            dur = card("section", section["card"], seg, args.res, duration=2.6 + CARD_HOLD)
            segments.append({"file": str(seg), "duration": dur, "beat": None, "say": None})
        for n, beat in enumerate(section["beats"], start=1):
            line = speech.get(f"{sid}/{beat['id']}")
            # Without generated narration (no key yet), time the beat as if the line were read aloud.
            say = media_duration(Path(line)) if line else len(beat.get("say", "").split()) / WORDS_PER_SECOND
            seg = out_dir / f"{sid}-{n:02d}-{beat['id']}.mp4"
            if beat.get("scene"):
                scene = beat["scene"]
                dur = card(scene["template"], scene.get("params", {}), seg, args.res,
                           duration=(LEAD + say + SCENE_TAIL) if say else None)
            else:
                if beat["id"] not in timeline:
                    raise SystemExit(f"No recorded frames for {sid}/{beat['id']}: run record.mjs for this take first")
                dur = render_product(timeline[beat["id"]], say, canvas, seg, args.res)
            segments.append({"file": str(seg), "duration": dur, "beat": beat["id"], "say": line, "sayAt": LEAD if line else None})
            print(f"{sid}/{beat['id']}: {dur:.1f}s" + (f" (narration {say:.1f}s)" if say else ""))
        edl[sid] = {"section": sid, "segments": segments}

    edl.pop("zz-ending", None)
    if spec.get("ending") and not args.no_ending:
        seg = out_dir / "zz-ending.mp4"
        dur = card("ending", spec["ending"], seg, args.res, duration=5.0)
        edl["zz-ending"] = {"section": "zz-ending", "segments": [{"file": str(seg), "duration": dur, "beat": None, "say": None}]}
    order = [s["id"] for s in spec["sections"] if not s.get("skip")] + ["zz-ending"]
    edl_path.write_text(json.dumps({"res": args.res, "sections": [edl[s] for s in order if s in edl]}, indent=2))
    print(edl_path)


if __name__ == "__main__":
    main()
