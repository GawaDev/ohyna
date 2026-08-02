# -*- coding: utf-8 -*-
"""ohyna-mark.svg / Noto グリフから配布用 PNG を生成する。"""
from __future__ import annotations

import io
import re
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
PUB = ROOT.parent / "web" / "public"
SVG = ROOT / "ohyna-mark.svg"
NOTO = ROOT / "noto-emoji-u1f423.svg"


def _render_svg(svg: str, size: int = 1024) -> Image.Image:
    html = (
        "<!doctype html><html><head><meta charset='utf-8'></head>"
        "<body style='margin:0;background:#fff'>"
        + re.sub(
            r'viewBox="0 0 (\d+) (\d+)"',
            f'width="{size}" height="{size}" viewBox="0 0 \\1 \\2"',
            svg,
            count=1,
        )
        + "</body></html>"
    )
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": size, "height": size}, device_scale_factor=1
        )
        page.set_content(html, wait_until="networkidle")
        page.wait_for_timeout(80)
        png = page.screenshot(
            type="png",
            omit_background=False,
            clip={"x": 0, "y": 0, "width": size, "height": size},
        )
        browser.close()
    return Image.open(io.BytesIO(png)).convert("RGBA")


def _maskable_from_noto(size: int = 512) -> Image.Image:
    """Android 等の maskable: 中央約 60% にグリフ、外周は安全余白。"""
    noto = NOTO.read_text(encoding="utf-8")
    # 正方形キャンバス全面白 + 中央に Noto（余白 ~20% 四方）
    pad = int(size * 0.2)
    inner = size - pad * 2
    wrapped = f"""<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">
  <rect width="{size}" height="{size}" fill="#ffffff"/>
  <svg x="{pad}" y="{pad}" width="{inner}" height="{inner}" viewBox="0 0 128 128">
{re.search(r"<svg[^>]*>(.*)</svg>", noto, re.DOTALL).group(1)}
  </svg>
</svg>
"""
    return _render_svg(wrapped, size)


def main() -> None:
    svg = SVG.read_text(encoding="utf-8")
    img = _render_svg(svg, 1024)
    img.save(ROOT / "ohyna-icon-master.png", optimize=True)

    def fit(size: int) -> Image.Image:
        return img.resize((size, size), Image.Resampling.LANCZOS)

    targets = {
        "pwa-512.png": 512,
        "pwa-192.png": 192,
        "apple-touch-icon.png": 180,
        "favicon.png": 64,
        "ohyna-mark.png": 256,
    }
    for name, size in targets.items():
        out = fit(size)
        out.save(ROOT / name, optimize=True)
        out.save(PUB / name, optimize=True)

    maskable = _maskable_from_noto(512)
    maskable.save(ROOT / "pwa-maskable-512.png", optimize=True)
    maskable.save(PUB / "pwa-maskable-512.png", optimize=True)

    PUB.joinpath("ohyna-mark.svg").write_text(svg, encoding="utf-8")
    print("ok", img.size, "maskable", maskable.size)


if __name__ == "__main__":
    main()
