# -*- coding: utf-8 -*-
"""印刷用 CSS。文書テーマ色＋レイアウト指定を合成する。"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from .design import DocumentDesign
from .style import DiagramStyle, _darken, _lighten

_PACKAGE_DIR = Path(__file__).resolve().parent
_SERVICE_ROOT = _PACKAGE_DIR.parent
DEFAULT_PRINT_CSS = _SERVICE_ROOT / "themes" / "blue-print.css"


@lru_cache(maxsize=4)
def _base_print_css_cached(mtime_ns: int) -> str:
    base_path = DEFAULT_PRINT_CSS
    return base_path.read_text(encoding="utf-8") if base_path.is_file() else ""


def _base_print_css() -> str:
    base_path = DEFAULT_PRINT_CSS
    mtime_ns = base_path.stat().st_mtime_ns if base_path.is_file() else 0
    return _base_print_css_cached(mtime_ns)


def cover_colors(style_name: str | None = "blue") -> tuple[str, str, str]:
    """表紙フォールバック色 (cover-1, cover-2, cover-3)。画像欠損時は cover-2。"""
    name = (style_name or "blue").strip().lower() or "blue"
    try:
        style = DiagramStyle.preset(name)
    except KeyError:
        style = DiagramStyle.preset("blue")
        name = "blue"
    chrome = style.primaryBorderColor or style.primaryTextColor or "#0b6bcb"
    if name == "dark":
        return "#0a1018", "#1b2836", "#5a738c"
    return _darken(chrome, 0.45), chrome, _lighten(chrome, 0.48)


def _root_overrides(style: DiagramStyle, *, style_name: str = "blue") -> str:
    """DiagramStyle から印刷 CSS 変数を生成する。

    印刷は白い紙＋余白が前提。ページ本文を暗転しない。
    dark は表紙・見出し・表ヘッダなどの濃色アクセントとして扱う。
    """
    name = (style_name or "blue").strip().lower() or "blue"
    chrome = style.primaryBorderColor or style.primaryTextColor or "#0b6bcb"
    ink = style.primaryTextColor or chrome
    accent_900 = _darken(chrome, 0.22)
    accent_800 = chrome
    accent_700 = chrome
    accent_600 = _lighten(chrome, 0.12)
    fill = style.primaryColor or _lighten(chrome, 0.85)
    fill_faint = _lighten(fill, 0.7)
    border = _lighten(chrome, 0.42)

    # 用紙は常に白。コードブロックだけ暗いインセットカードにする
    page_bg = "#ffffff"
    body = "#263238"
    muted = "#546e7a"
    code_bg = "#0f2744"
    code_fg = "#e8f1fa"

    if name == "dark":
        code_bg = "#15202b"

    cover1, cover2, cover3 = cover_colors(name)

    return f"""
:root {{
  --accent-900: {accent_900};
  --accent-800: {accent_800};
  --accent-700: {accent_700};
  --accent-600: {accent_600};
  --accent-100: {border};
  --accent-50: {fill};
  --accent-25: {fill_faint};
  --text: {ink};
  --body: {body};
  --muted: {muted};
  --border: {border};
  --white: #ffffff;
  --page-bg: {page_bg};
  --cover-1: {cover1};
  --cover-2: {cover2};
  --cover-3: {cover3};
  --cover-fg: #ffffff;
  --code-bg: {code_bg};
  --code-fg: {code_fg};
}}
""".strip()


@lru_cache(maxsize=32)
def theme_overrides_css(style_name: str | None = "blue") -> str:
    """文書テーマ名に対応する :root 変数のみ。"""
    name = (style_name or "blue").strip() or "blue"
    try:
        style = DiagramStyle.preset(name)
    except KeyError:
        style = DiagramStyle.preset("blue")
        name = "blue"
    return _root_overrides(style, style_name=name)


def load_print_css(
    style_name: str | None = "blue",
    design: DocumentDesign | None = None,
) -> str:
    """ベース印刷 CSS + テーマ色 + レイアウト指定（後勝ち）。"""
    parts = [_base_print_css(), theme_overrides_css(style_name)]
    d = design or DocumentDesign()
    parts.append(d.to_css_vars())
    return "\n\n".join(parts)


def font_link_tags(design: DocumentDesign | None = None) -> str:
    """Google Fonts など外部フォント用 link。"""
    d = design or DocumentDesign()
    href = d.google_fonts_href()
    if not href:
        return ""
    return f"""
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="{href}" rel="stylesheet" />
""".rstrip()
