#!/usr/bin/env python3
"""Prepare native macOS cursor assets for product-demo interaction tracks."""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess

from PIL import Image


HISERVICES_CURSOR_ROOT = Path(
    "/System/Library/Frameworks/ApplicationServices.framework/Versions/A/Frameworks/"
    "HIServices.framework/Versions/A/Resources/cursors"
)

CURSOR_ROOTS = [
    Path(
        "/System/Library/PrivateFrameworks/AccessibilitySupport.framework/Versions/A/Frameworks/"
        "AccessibilityFoundation.framework/Versions/A/Resources/Cursors-macOS16"
    ),
    Path(
        "/System/Library/PrivateFrameworks/AccessibilitySupport.framework/Versions/A/Frameworks/"
        "AccessibilityFoundation.framework/Versions/A/Resources/Cursors"
    ),
]


def _cursor_root() -> Path:
    for root in CURSOR_ROOTS:
        if (root / "arrow-top.pdf").exists() and (root / "hand-top.pdf").exists():
            return root
    raise FileNotFoundError("Native macOS cursor PDFs were not found")


def _rasterize(pdf: Path, png: Path) -> None:
    magick = shutil.which("magick")
    # ImageMagick needs Ghostscript for PDFs; without it, fall back to macOS sips.
    if magick and subprocess.run([magick, "-density", "768", str(pdf), str(png)],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        return

    subprocess.run(
        ["sips", "-s", "format", "png", str(pdf), "--out", str(png)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _resize(src: Path, dest: Path, width: int) -> None:
    image = Image.open(src).convert("RGBA")
    height = round(image.height * (width / image.width))
    image.resize((width, height), Image.Resampling.LANCZOS).save(dest)


def _native_hand_pdf(root: Path) -> Path:
    pointing_hand = HISERVICES_CURSOR_ROOT / "pointinghand" / "cursor.pdf"
    if pointing_hand.exists():
        return pointing_hand
    return root / "hand-top.pdf"


def _resize_native_pointer(root: Path, dest: Path, width: int) -> bool:
    for name in ("default-pointer-3.png", "default-pointer-2.png", "default-pointer-1.png", "default-pointer-0.png"):
        source = root / name
        if source.exists():
            _resize(source, dest, width)
            return True
    return False


def generate(out_dir: Path) -> None:
    """Generate demo-ready cursor PNGs from native macOS cursor PDFs.

    Do not draw hand cursors manually. The user's standard for demo videos is
    Screen Studio-like native cursor replacement, so this function uses Apple's
    cursor artwork where available and reuses the native hand for pressed clicks.
    """

    out_dir.mkdir(parents=True, exist_ok=True)
    root = _cursor_root()
    tmp = out_dir / ".native-source"
    tmp.mkdir(parents=True, exist_ok=True)

    arrow_source = tmp / "arrow-top.png"
    hand_source = tmp / "hand-native.png"
    ibeam_source = tmp / "ibeam-native.png"
    _rasterize(root / "arrow-top.pdf", arrow_source)
    _rasterize(_native_hand_pdf(root), hand_source)
    # macOS names this asset from the writing direction perspective:
    # `ibeamhorizontal` is the normal vertical text insertion cursor.
    ibeam_pdf = HISERVICES_CURSOR_ROOT / "ibeamhorizontal" / "cursor.pdf"
    if ibeam_pdf.exists():
        _rasterize(ibeam_pdf, ibeam_source)

    if not _resize_native_pointer(root, out_dir / "cursor-arrow.png", 88):
        _resize(arrow_source, out_dir / "cursor-arrow.png", 88)
    _resize(hand_source, out_dir / "cursor-hand.png", 96)
    shutil.copyfile(out_dir / "cursor-hand.png", out_dir / "cursor-hand-down.png")
    if ibeam_source.exists():
        _resize(ibeam_source, out_dir / "cursor-ibeam.png", 82)
    elif (root / "default-iBeam-3.png").exists():
        # Newer macOS ships the text cursor as accessibility PNGs instead of the HIServices PDF.
        _resize(root / "default-iBeam-3.png", out_dir / "cursor-ibeam.png", 40)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("out_dir", type=Path)
    args = parser.parse_args()
    generate(args.out_dir)
