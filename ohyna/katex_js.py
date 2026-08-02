# -*- coding: utf-8 -*-
"""数式（TeX）描画用 KaTeX CDN 定数。

プレビューは ESM、PDF 印刷 HTML はクラシック script で読み込む。
"""

from __future__ import annotations

# 固定メジャーで再現性を確保（jsDelivr）
KATEX_VERSION = "0.16.22"
KATEX_CDN_ROOT = f"https://cdn.jsdelivr.net/npm/katex@{KATEX_VERSION}/dist"

KATEX_CSS = f"{KATEX_CDN_ROOT}/katex.min.css"
KATEX_JS = f"{KATEX_CDN_ROOT}/katex.min.js"
KATEX_AUTO_RENDER_JS = f"{KATEX_CDN_ROOT}/contrib/auto-render.min.js"
KATEX_JS_MJS = f"{KATEX_CDN_ROOT}/katex.mjs"
KATEX_AUTO_RENDER_MJS = f"{KATEX_CDN_ROOT}/contrib/auto-render.mjs"

# Playwright PDF 化時の通信許可プレフィックス
KATEX_NET_ALLOW_PREFIX = f"https://cdn.jsdelivr.net/npm/katex@{KATEX_VERSION}/"


def katex_stylesheet_link() -> str:
    return (
        f'<link rel="stylesheet" href="{KATEX_CSS}" '
        'crossorigin="anonymous" />'
    )
