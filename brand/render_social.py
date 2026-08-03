# -*- coding: utf-8 -*-
"""OGP 用の og 画像を生成する。

PWA の screenshots/ は実 GUI のキャプチャが必要。
→ `python brand/capture_pwa_screenshots.py`（serve 起動済みで）
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
PUB = ROOT.parent / "web" / "public"
MARK = ROOT / "ohyna-mark.png"

# ブランド（web/src/appIdentity.ts の APP_THEME_COLOR / APP_PRIMARY_COLOR と同じ）
THEME_HEX = "#FFB903"
PRIMARY_HEX = "#FF8E01"


def _hex_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.removeprefix("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


BG = _hex_rgb(THEME_HEX)
BG_DARK = _hex_rgb(PRIMARY_HEX)
WHITE = (255, 255, 255)
INK = (15, 23, 42)
MUTED = (70, 55, 20)


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


def render_og() -> None:
    """1200×630 Open Graph 画像。"""
    w, h = 1200, 630
    img = Image.new("RGBA", (w, h), BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, h - 160, w, h), fill=BG_DARK)
    _paste_mark(img, 220, (80, 120))
    title = _font(72, bold=True)
    body = _font(32)
    draw.text((340, 160), "Ohyna", fill=INK, font=title)
    draw.text(
        (340, 260),
        "Open Hybrid Note App／おひな",
        fill=MUTED,
        font=body,
    )
    draw.text(
        (80, 500),
        "Markdown を編集・検査・プレビューし、印刷向け PDF を作成",
        fill=WHITE,
        font=_font(28),
    )
    out = PUB / "og.png"
    PUB.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(out, "PNG", optimize=True)
    print("wrote", out)


def main() -> None:
    render_og()


if __name__ == "__main__":
    main()
