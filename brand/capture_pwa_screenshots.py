# -*- coding: utf-8 -*-
"""PWA マニフェスト用スクリーンショットを実 GUI から撮る。

前提: `python -m ohyna serve` が起動していること（既定 http://127.0.0.1:1717）。
環境変数 OHYNA_CAPTURE_ORIGIN でオリジンを上書きできる。

出力:
  web/public/screenshots/wide.png   … 1280×720（デスクトップ）
  web/public/screenshots/narrow.png … 750×1334（電話 UI を拡大）
"""

from __future__ import annotations

import asyncio
import io
import os
import sys
import time
from pathlib import Path

from PIL import Image
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
SHOTS = ROOT.parent / "web" / "public" / "screenshots"
DEFAULT_ORIGIN = "http://127.0.0.1:1717"

WIDE_SIZE = (1280, 720)
# 電話レイアウトは max-width: 560px。実ビューポートで撮ってマニフェスト寸法へ拡大する。
NARROW_VIEWPORT = (390, 844)
NARROW_SIZE = (750, 1334)


async def _wait_app_ready(page) -> None:
    menu = page.get_by_label("ファイルメニュー")
    await menu.wait_for(state="visible", timeout=60_000)
    for _ in range(60):
        if await menu.is_enabled():
            return
        await page.wait_for_timeout(250)
    raise RuntimeError("ファイルメニューが有効になりませんでした")


async def _open_sample(page) -> None:
    await page.get_by_label("ファイルメニュー").click()
    await page.get_by_role("menuitem", name="サンプルから作成").click()


async def _wait_preview_sheets(page, *, timeout_ms: int = 90_000) -> None:
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        frame = page.frame_locator(".ohyna-preview-stage iframe").first
        try:
            count = await frame.locator(".ohyna-a4-sheet").count()
            if count > 0:
                # 読み込みチップが消えるまで
                for _ in range(40):
                    chip = page.locator(".ohyna-preview-loading-chip")
                    if await chip.count() == 0 or not await chip.is_visible():
                        break
                    await page.wait_for_timeout(200)
                await page.wait_for_timeout(500)
                return
        except Exception:
            pass
        btn = page.get_by_label("プレビューを更新")
        try:
            if await btn.is_enabled():
                await btn.click()
                await page.wait_for_timeout(500)
        except Exception:
            pass
        await page.wait_for_timeout(400)
    raise PlaywrightTimeoutError("プレビューの用紙が表示されませんでした")


async def _dismiss_toasts(page) -> None:
    """撮影前にトーストを消す（あれば）。"""
    await page.wait_for_timeout(2200)
    close_btns = page.locator(".ohyna-notifications button, .mantine-Notification-closeButton")
    n = await close_btns.count()
    for i in range(n):
        try:
            await close_btns.nth(i).click(timeout=500)
        except Exception:
            pass
    await page.wait_for_timeout(200)


def _save_resized(png_bytes: bytes, out: Path, size: tuple[int, int]) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    if img.size != size:
        img = img.resize(size, Image.Resampling.LANCZOS)
    img.save(out, "PNG", optimize=True)
    print("wrote", out, f"({size[0]}×{size[1]})")


async def capture_wide(origin: str, out: Path) -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(
            viewport={"width": WIDE_SIZE[0], "height": WIDE_SIZE[1]},
            device_scale_factor=1,
            color_scheme="light",
            locale="ja-JP",
        )
        page = await context.new_page()
        await page.goto(f"{origin.rstrip('/')}/gui/", wait_until="domcontentloaded")
        await _wait_app_ready(page)
        await _open_sample(page)
        await _wait_preview_sheets(page)
        await _dismiss_toasts(page)
        raw = await page.screenshot(type="png")
        await browser.close()
        _save_resized(raw, out, WIDE_SIZE)


async def capture_narrow(origin: str, out: Path) -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(
            viewport={
                "width": NARROW_VIEWPORT[0],
                "height": NARROW_VIEWPORT[1],
            },
            device_scale_factor=2,
            color_scheme="light",
            locale="ja-JP",
            is_mobile=True,
            has_touch=True,
        )
        page = await context.new_page()
        await page.goto(f"{origin.rstrip('/')}/gui/", wait_until="domcontentloaded")
        await _wait_app_ready(page)
        await _open_sample(page)
        # 電話レイアウトの「編集」タブ（max-width: 560px）
        switch = page.get_by_label("編集・プレビュー・コンソールの切替")
        await switch.wait_for(state="visible", timeout=15_000)
        await switch.get_by_text("編集", exact=True).click()
        await page.wait_for_timeout(500)
        await _dismiss_toasts(page)
        raw = await page.screenshot(type="png")
        await browser.close()
        _save_resized(raw, out, NARROW_SIZE)


async def main() -> int:
    origin = os.environ.get("OHYNA_CAPTURE_ORIGIN", DEFAULT_ORIGIN).strip() or DEFAULT_ORIGIN
    try:
        await capture_wide(origin, SHOTS / "wide.png")
        await capture_narrow(origin, SHOTS / "narrow.png")
    except Exception as exc:
        print(f"capture failed ({origin}): {exc}", file=sys.stderr)
        print(
            "先に `python -m ohyna serve` を起動するか、OHYNA_CAPTURE_ORIGIN を設定してください。",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
