# -*- coding: utf-8 -*-
"""OGP 用の og 画像を生成する。

文言は web/src/appIdentity.ts の APP_TITLE / APP_NAME_FULL / APP_TAGLINE に合わせる。
PWA の screenshots/ は実 GUI キャプチャ → `python brand/capture_pwa_screenshots.py`
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
PUB = ROOT.parent / "web" / "public"
MARK = ROOT / "ohyna-mark.png"

# web/src/appIdentity.ts / brandColors.ts と同じ黄〜橙
THEME_HEX = "#FFB903"
PRIMARY_HEX = "#FF8E01"
CREAM_HEX = "#FFF9E8"
INK_HEX = "#8F4800"
MUTED_HEX = "#C96800"

# appIdentity と同期
APP_TITLE = "Ohyna"
APP_NAME_FULL = "Open Hybrid Note App／おひな"
APP_TAGLINE = "Markdown を編集して、PDF にする"


def _hex_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.removeprefix("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


CREAM = _hex_rgb(CREAM_HEX)
THEME = _hex_rgb(THEME_HEX)
PRIMARY = _hex_rgb(PRIMARY_HEX)
INK = _hex_rgb(INK_HEX)
MUTED = _hex_rgb(MUTED_HEX)
WHITE = (255, 255, 255)


def _font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/YuGothB.ttc" if bold else "C:/Windows/Fonts/YuGothM.ttc",
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/segoeui.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size, index=0)
        except OSError:
            continue
    return ImageFont.load_default()


def _paste_mark(canvas: Image.Image, size: int, xy: tuple[int, int]) -> None:
    mark = Image.open(MARK).convert("RGBA")
    mark = mark.resize((size, size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, dest=xy)


def _vertical_gradient(
    size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]
) -> Image.Image:
    w, h = size
    img = Image.new("RGB", (w, h), top)
    px = img.load()
    assert px is not None
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img.convert("RGBA")


def render_og() -> None:
    """1200×630 Open Graph 画像（黄〜橙）。"""
    w, h = 1200, 630
    band_h = 140
    body_h = h - band_h
    img = Image.new("RGBA", (w, h), CREAM + (255,))
    grad = _vertical_gradient((w, body_h), CREAM, THEME)
    img.paste(grad, (0, 0))
    band = Image.new("RGBA", (w, band_h), PRIMARY + (255,))
    img.paste(band, (0, body_h))

    draw = ImageDraw.Draw(img)
    _paste_mark(img, 200, (72, 100))
    draw.text((320, 130), APP_TITLE, fill=INK, font=_font(78, bold=True))
    draw.text((320, 240), APP_NAME_FULL, fill=MUTED, font=_font(30))
    draw.text(
        (72, body_h + 48),
        APP_TAGLINE,
        fill=WHITE,
        font=_font(30, bold=True),
    )

    out = PUB / "og.png"
    PUB.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(out, "PNG", optimize=True)
    print("wrote", out, img.size)


def main() -> None:
    render_og()


if __name__ == "__main__":
    main()
