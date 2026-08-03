# -*- coding: utf-8 -*-
"""OGP / PWA 用の og 画像とスクリーンショットを生成する。"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
PUB = ROOT.parent / "web" / "public"
SHOTS = PUB / "screenshots"
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
            index = 0 if path.endswith(".ttc") else 0
            return ImageFont.truetype(path, size=size, index=index)
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
    # 右下の暗い帯
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
    img.convert("RGB").save(out, "PNG", optimize=True)
    print("wrote", out)


def render_screenshot_wide() -> None:
    """PWA wide スクリーンショット（1280×720）。"""
    w, h = 1280, 720
    img = Image.new("RGBA", (w, h), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    # ウィンドウ枠
    draw.rounded_rectangle((40, 40, w - 40, h - 40), radius=16, fill=WHITE, outline=(226, 232, 240), width=2)
    draw.rectangle((40, 40, w - 40, 96), fill=(248, 250, 252))
    draw.text((64, 56), "Ohyna", fill=INK, font=_font(28, bold=True))
    # 左エディタ / 右プレビュー
    draw.rounded_rectangle((64, 120, 620, h - 64), radius=8, fill=(255, 255, 255), outline=(226, 232, 240))
    draw.rounded_rectangle((648, 120, w - 64, h - 64), radius=8, fill=(255, 255, 255), outline=(226, 232, 240))
    draw.text((84, 140), "Markdown", fill=MUTED, font=_font(22))
    draw.text((668, 140), "プレビュー", fill=MUTED, font=_font(22))
    for i, line in enumerate(
        ("# はじめに", "", "Ohyna で文書を書き、", "PDF として配布します。")
    ):
        draw.text((84, 190 + i * 36), line, fill=INK, font=_font(24))
    _paste_mark(img, 120, (900, 280))
    draw.text((860, 430), "プレビュー", fill=MUTED, font=_font(22))
    SHOTS.mkdir(parents=True, exist_ok=True)
    out = SHOTS / "wide.png"
    img.convert("RGB").save(out, "PNG", optimize=True)
    print("wrote", out)


def render_screenshot_narrow() -> None:
    """PWA narrow スクリーンショット（750×1334）。"""
    w, h = 750, 1334
    img = Image.new("RGBA", (w, h), (248, 250, 252))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((24, 48, w - 24, h - 48), radius=28, fill=WHITE, outline=(226, 232, 240), width=2)
    draw.rectangle((24, 48, w - 24, 140), fill=BG)
    draw.text((48, 78), "Ohyna", fill=INK, font=_font(36, bold=True))
    _paste_mark(img, 160, ((w - 160) // 2, 220))
    draw.text(
        (w // 2, 420),
        "Markdown → PDF",
        fill=INK,
        font=_font(40, bold=True),
        anchor="mt",
    )
    for i, line in enumerate(
        (
            "編集・検査・プレビュー",
            "印刷向け PDF の作成",
            "ブラウザから利用",
        )
    ):
        draw.text(
            (w // 2, 520 + i * 56),
            line,
            fill=MUTED,
            font=_font(28),
            anchor="mt",
        )
    draw.rounded_rectangle((80, 780, w - 80, 880), radius=12, fill=BG)
    draw.text(
        (w // 2, 830),
        "ドキュメントを開く",
        fill=WHITE,
        font=_font(28, bold=True),
        anchor="mm",
    )
    SHOTS.mkdir(parents=True, exist_ok=True)
    out = SHOTS / "narrow.png"
    img.convert("RGB").save(out, "PNG", optimize=True)
    print("wrote", out)


def main() -> None:
    PUB.mkdir(parents=True, exist_ok=True)
    render_og()
    render_screenshot_wide()
    render_screenshot_narrow()


if __name__ == "__main__":
    main()
