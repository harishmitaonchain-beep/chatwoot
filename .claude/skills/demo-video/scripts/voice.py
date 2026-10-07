#!/usr/bin/env python3
"""Generate narration for every beat with a `say` line, using ElevenLabs.

Usage: voice.py <spec.json> --take v01 [--voice-name NAME] [--list-voices]

- The voice is chosen once per video and saved in <video>/voice.json (random premade voice unless
  --voice-name is given), so every take sounds the same until you change it.
- Lines are cached by text + voice + settings in <video>/speech-cache/, so re-running a take only
  pays for lines that changed.
- Writes <take>/speech/manifest.json: {"<section>/<beat>": "<mp3 path>"} for render.py.
- The key comes from ELEVENLABS_API_KEY or ~/.config/chatwoot-video/env (never from the repo).
Request code adapted from Sojan's generate_elevenlabs_speech.py.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import shutil
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.elevenlabs.io/v1"
ENV_FILE = Path.home() / ".config/chatwoot-video/env"
DEFAULTS = {"model": "eleven_multilingual_v2", "stability": 0.45, "similarity_boost": 0.8, "style": 0.25}


def api_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key and ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if line.startswith("ELEVENLABS_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("'\"")
    if not key:
        raise SystemExit(f"ELEVENLABS_API_KEY is not set (export it, or put ELEVENLABS_API_KEY=... in {ENV_FILE})")
    return key


def request(path: str, payload: dict | None = None, accept: str = "application/json") -> bytes:
    req = urllib.request.Request(
        f"{API}{path}", method="POST" if payload else "GET",
        data=json.dumps(payload).encode() if payload else None,
        headers={"xi-api-key": api_key(), "accept": accept, "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        raise SystemExit(f"ElevenLabs {path} failed ({error.code}): {error.read().decode(errors='replace')}") from error


def voices() -> list[dict]:
    return json.loads(request("/voices"))["voices"]


def choose_voice(video_dir: Path, name: str | None) -> dict:
    saved = video_dir / "voice.json"
    if saved.exists() and not name:
        return json.loads(saved.read_text())
    available = voices()
    if name:
        match = [v for v in available if v["name"].lower().split(" - ")[0].strip() == name.lower()]
        if not match:
            raise SystemExit(f"Voice {name!r} not found. Run with --list-voices.")
        voice = match[0]
    else:
        voice = random.choice([v for v in available if v.get("category") == "premade"] or available)
    chosen = {"voice_id": voice["voice_id"], "name": voice["name"], "labels": voice.get("labels") or {}}
    saved.write_text(json.dumps(chosen, indent=2))
    return chosen


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("spec", type=Path, nargs="?")
    ap.add_argument("--take")
    ap.add_argument("--voice-name")
    ap.add_argument("--list-voices", action="store_true")
    ap.add_argument("--only", help="comma-separated section ids; other sections are not voiced (no credits spent)")
    args = ap.parse_args()

    if args.list_voices:
        for v in voices():
            labels = ", ".join(f"{k}={val}" for k, val in sorted((v.get("labels") or {}).items()) if val)
            print(f"{v['name']} | {v.get('category')} | {labels}")
        return
    if not args.spec or not args.take:
        ap.error("spec and --take are required")

    spec = json.loads(args.spec.read_text())
    video_dir = args.spec.parent
    settings = {**DEFAULTS, **spec.get("voice", {})}
    voice = choose_voice(video_dir, args.voice_name)
    print(f"voice: {voice['name']} ({', '.join(f'{k}={v}' for k, v in voice['labels'].items())})")

    cache = video_dir / "speech-cache"
    out = video_dir / args.take / "speech"
    cache.mkdir(exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    only = set(args.only.split(",")) if args.only else None
    manifest_path = out / "manifest.json"
    # Keep lines voiced earlier in this take, so sections can be voiced one at a time.
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    spent = 0
    for section in spec["sections"]:
        if section.get("skip") or (only and section["id"] not in only):
            continue
        for beat in section["beats"]:
            text = beat.get("say")
            if not text:
                continue
            key = hashlib.sha1(json.dumps([text, voice["voice_id"], settings], sort_keys=True).encode()).hexdigest()[:16]
            cached = cache / f"{key}.mp3"
            if not cached.exists():
                audio = request(f"/text-to-speech/{voice['voice_id']}", {
                    "text": text, "model_id": settings["model"],
                    "voice_settings": {"stability": settings["stability"], "similarity_boost": settings["similarity_boost"],
                                       "style": settings["style"], "use_speaker_boost": True},
                }, accept="audio/mpeg")
                cached.write_bytes(audio)
                spent += len(text)
            target = out / f"{section['id']}--{beat['id']}.mp3"
            shutil.copyfile(cached, target)
            manifest[f"{section['id']}/{beat['id']}"] = str(target)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"{len(manifest)} lines ready, {spent} new characters sent to ElevenLabs")


if __name__ == "__main__":
    main()
