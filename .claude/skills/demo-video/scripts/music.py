#!/usr/bin/env python3
"""Generate an instrumental music bed with ElevenLabs Music (needs a plan that includes it).

Usage: music.py --out "<video folder>/music.mp3" --seconds 300 [--prompt "..."]
Then set "music": {"file": "music.mp3", "volume": 0.06} in the spec. assemble.py loops and fades it.
Adapted from Sojan's generate_elevenlabs_music.py.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from voice import request

PROMPT = ("Instrumental modern SaaS product walkthrough background music. Clean, optimistic, light rhythmic motion, "
          "soft plucked synths, warm pads, gentle bass. No vocals, no lyrics, no dramatic drops, no heavy drums. "
          "Calm and premium; it must sit quietly under narration.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--seconds", type=int, required=True)
    ap.add_argument("--prompt", default=PROMPT)
    args = ap.parse_args()
    audio = request("/music?output_format=mp3_44100_128",
                    {"prompt": args.prompt, "music_length_ms": args.seconds * 1000, "force_instrumental": True},
                    accept="audio/mpeg")
    args.out.write_bytes(audio)
    print(args.out)


if __name__ == "__main__":
    main()
