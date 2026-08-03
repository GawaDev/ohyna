# -*- coding: utf-8 -*-
"""文書レイアウト／タイポグラフィ設定（front matter）。"""

from __future__ import annotations

import html as html_lib
import re
from dataclasses import dataclass
from typing import Any

_SAFE_CSS_FONT = re.compile(r"^[A-Za-z0-9\s\-_\"',\.\u3040-\u30ff\u4e00-\u9fff]+$")
_SAFE_CSS_SIZE = re.compile(r"^\d+(\.\d+)?(pt|px|em|rem|%)$")
_SAFE_LINE_HEIGHT = re.compile(r"^\d+(\.\d+)?$")
_SAFE_LETTER_SPACING = re.compile(r"^-?\d+(\.\d+)?(em|px|pt)?$")
_SAFE_MM = re.compile(r"^\d+(\.\d+)?$")
_SAFE_WATERMARK = re.compile(r"^[\w\s\-・／/（）()「」『』【】\.\,\:：]{0,40}$")


def _sanitize_css_font(value: str, fallback: str) -> str:
    s = (value or "").strip()
    if not s or len(s) > 160 or not _SAFE_CSS_FONT.match(s):
        return fallback
    if any(tok in s.lower() for tok in ("expression", "url(", ";", "{", "}", "@")):
        return fallback
    return s


def _sanitize_css_size(value: str, fallback: str) -> str:
    s = (value or "").strip()
    return s if _SAFE_CSS_SIZE.match(s) else fallback


def _sanitize_line_height(value: str, fallback: str) -> str:
    s = (value or "").strip()
    return s if _SAFE_LINE_HEIGHT.match(s) else fallback


def _sanitize_letter_spacing(value: str, fallback: str) -> str:
    s = (value or "").strip()
    if not s or s == "0":
        return "0"
    return s if _SAFE_LETTER_SPACING.match(s) else fallback


def _sanitize_mm(value: Any, fallback: float) -> float:
    s = str(value if value is not None else "").strip().removesuffix("mm")
    if not _SAFE_MM.match(s):
        return fallback
    n = float(s)
    if n < 0 or n > 50:
        return fallback
    return n


FONT_PRESETS: dict[str, tuple[str, str]] = {
    # name: (font-sans stack, google fonts family query or "")
    # スタック先頭付近が優先。和文／欧文の役割は GUI 表示と揃える。
    "noto": ('"Noto Sans JP", "Segoe UI", sans-serif', "Noto+Sans+JP:wght@400;500;700"),
    "gothic": (
        '"Yu Gothic", "Hiragino Sans", "Noto Sans JP", "Segoe UI", sans-serif',
        "Noto+Sans+JP:wght@400;500;700",
    ),
    "mincho": (
        '"Noto Serif JP", "Yu Mincho", "Hiragino Mincho ProN", serif',
        "Noto+Serif+JP:wght@400;600;700",
    ),
    "sans": ('"Segoe UI", system-ui, "Noto Sans JP", sans-serif', "Noto+Sans+JP:wght@400;500;700"),
    "serif": ('Georgia, "Noto Serif JP", "Times New Roman", serif', "Noto+Serif+JP:wght@400;600;700"),
    "mono": (
        '"IBM Plex Mono", "Cascadia Mono", Consolas, monospace',
        "IBM+Plex+Mono:wght@400;500;600",
    ),
    "inter": (
        'Inter, "Noto Sans JP", "Segoe UI", sans-serif',
        "Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700",
    ),
}

# コード用フォント（fontMono に書き込む CSS スタック, Google Fonts query）
MONO_PRESETS: dict[str, tuple[str, str]] = {
    "cascadia": (
        '"Cascadia Mono", Consolas, "Courier New", monospace',
        "",
    ),
    "plex": (
        '"IBM Plex Mono", "Cascadia Mono", Consolas, monospace',
        "IBM+Plex+Mono:wght@400;500;600",
    ),
    "consolas": (
        'Consolas, "Courier New", monospace',
        "",
    ),
}
DEFAULT_MONO_PRESET = "cascadia"

RADIUS_PRESETS = {
    "none": ("0", "0", "0"),
    "sm": ("3px", "6px", "8px"),
    "md": ("6px", "10px", "14px"),
    "lg": ("10px", "14px", "20px"),
}

# coverPattern → 表示名（themes/covers の WebP）
COVER_PATTERNS: dict[str, str] = {
    # ぼかし・彩り
    "noise": "霞（かすみ／ぼかし）",
    "grainy": "砂子（すなご／粒子）",
    "aurora": "極光（きょっこう／オーロラ）",
    "mesh": "彩雲（さいうん／メッシュ）",
    # 基本・構図
    "solid": "無地（むじ／単色）",
    "diagonal": "斜影（しゃえい／斜め）",
    "horizontal": "横霞（よこがすみ／横ぼかし）",
    "vertical": "縦霞（たてがすみ／縦ぼかし）",
    "radial": "円暈（えんうん／放射）",
    "split": "二面（にめん／二分割）",
    "band": "帯（おび／帯飾り）",
    "corner": "隅取り（すみとり／コーナー）",
    "ribbon": "側帯（そくたい／リボン）",
    "panel": "脇板（わきいた／パネル）",
    "frame": "額縁（がくぶち／フレーム）",
    "glow": "中暈（ちゅううん／中心光）",
    "dusk": "黄昏（たそがれ／夕暮れ）",
    "mist": "薄霧（うすぎり／ミスト）",
    "horizon": "地平（ちへい／水平線）",
    # 幾何・文様
    "stripe": "縦縞（たてじま／ストライプ）",
    "dots": "点描（てんびょう／ドット）",
    "grid": "方眼（ほうがん／グリッド）",
    "chevron": "矢筈（やはず／シェブロン）",
    "diamond": "菱（ひし／ダイヤ）",
    "hex": "亀甲（きっこう／六角）",
    "triangle": "鱗（うろこ／三角）",
    "checker": "市松（いちまつ／チェッカー）",
    "herringbone": "杉綾（すぎあや／ヘリンボーン）",
    "isometric": "升目（ますめ／立体格子）",
    "lattice": "組子（くみこ／格子）",
    "mosaic": "寄木（よせぎ／モザイク）",
    "blades": "切子（きりこ／鋭角）",
    "sunburst": "日輪（にちりん／放射）",
    "spiral": "渦（うず／スパイラル）",
    "orbit": "周回（しゅうかい／軌道）",
    "circles": "同心円（どうしんえん／円環）",
    # 波・曲線
    "wave": "波（なみ／ウェーブ）",
    "waves": "連波（れんぱ／多重波）",
    "ripples": "細波（さざなみ／さざ波）",
    "scallop": "波縁（なみぶち／スカラップ）",
    "mountains": "連山（れんざん／山並み）",
    "arcs": "円弧（えんこ／アーク）",
    "zigzag": "稲妻（いなずま／ジグザグ）",
}

# 用紙サイズ（縦向き mm）
PAGE_SIZES: dict[str, tuple[float, float]] = {
    "a4": (210.0, 297.0),
    "a5": (148.0, 210.0),
    "b5": (176.0, 250.0),  # JIS B5
    "letter": (215.9, 279.4),
}

MARGIN_PRESETS: dict[str, tuple[float, float, float, float]] = {
    # top, right, bottom, left (mm)
    "narrow": (10.0, 10.0, 12.0, 10.0),
    "normal": (14.0, 14.0, 16.0, 14.0),
    "wide": (20.0, 20.0, 22.0, 20.0),
}

PAGE_HEADER_MODES = frozenset(
    {"none", "title", "author", "date", "version", "confidential", "custom"}
)
PAGE_FOOTER_MODES = frozenset(
    {
        "none",
        "page",
        "title",
        "title-page",
        "date",
        "author",
        "confidential",
        "custom",
    }
)
WATERMARK_MODES = frozenset({"none", "draft", "confidential", "custom"})


def _as_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    if s in {"1", "true", "yes", "on", "有", "あり"}:
        return True
    if s in {"0", "false", "no", "off", "無", "なし"}:
        return False
    return default


def _as_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    s = str(value).strip()
    return s if s else default


def _map_camel(merged: dict[str, Any]) -> None:
    pairs = (
        ("fontFamily", "font_family"),
        ("fontMono", "font_mono"),
        ("fontSize", "font_size"),
        ("lineHeight", "line_height"),
        ("letterSpacing", "letter_spacing"),
        ("coverGradient", "cover_gradient"),
        ("coverPattern", "cover_pattern"),
        ("headingBand", "heading_band"),
        ("tableHeaderFill", "table_header_fill"),
        ("pageSize", "page_size"),
        ("pageOrientation", "page_orientation"),
        ("marginPreset", "margin_preset"),
        ("marginTop", "margin_top"),
        ("marginRight", "margin_right"),
        ("marginBottom", "margin_bottom"),
        ("marginLeft", "margin_left"),
        ("pageHeader", "page_header"),
        ("pageHeaderText", "page_header_text"),
        ("pageFooter", "page_footer"),
        ("pageFooterText", "page_footer_text"),
        ("toc", "toc"),
        ("tocDepth", "toc_depth"),
        ("codeLineNumbers", "code_line_numbers"),
        ("codeWrap", "code_wrap"),
        ("codeFontSize", "code_font_size"),
        ("linkUnderline", "link_underline"),
        ("linkThemeColor", "link_theme_color"),
        ("watermark", "watermark"),
        ("watermarkText", "watermark_text"),
        ("author", "author"),
        ("version", "version"),
        ("date", "date"),
    )
    for camel, snake in pairs:
        if camel in merged and snake not in merged:
            merged[snake] = merged[camel]


@dataclass
class DocumentDesign:
    """印刷レイアウトまわりの指定。"""

    rounded: bool = True
    radius: str = "md"  # none|sm|md|lg
    font: str = "noto"
    font_family: str | None = None
    font_mono: str | None = None
    font_size: str = "10.5pt"
    line_height: str = "1.7"
    letter_spacing: str = "0"
    cover_gradient: bool = True
    cover_pattern: str = "noise"
    heading_band: bool = True
    table_header_fill: bool = True
    # 用紙
    page_size: str = "a4"
    page_orientation: str = "portrait"
    margin_preset: str = "normal"
    margin_top: float = 14.0
    margin_right: float = 14.0
    margin_bottom: float = 16.0
    margin_left: float = 14.0
    # 本文ページ ヘッダ／フッタ
    page_header: str = "none"
    page_header_text: str = ""
    page_footer: str = "none"
    page_footer_text: str = ""
    # 目次
    toc: bool = False
    toc_depth: int = 3
    # コード
    code_line_numbers: bool = False
    code_wrap: bool = False
    code_font_size: str = ""
    # リンク
    link_underline: bool = False
    link_theme_color: bool = True
    # 透かし
    watermark: str = "none"
    watermark_text: str = ""
    # メタ
    author: str = ""
    version: str = ""
    date: str = ""

    @classmethod
    def from_mapping(cls, data: dict[str, Any] | None) -> DocumentDesign:
        raw = dict(data or {})
        nested = raw.get("design")
        if isinstance(nested, dict):
            merged = {**raw, **nested}
        else:
            merged = dict(raw)

        _map_camel(merged)

        # snake_case キーが YAML に直接ある場合は拒否
        snake_to_camel = {
            "font_family": "fontFamily",
            "font_mono": "fontMono",
            "font_size": "fontSize",
            "line_height": "lineHeight",
            "letter_spacing": "letterSpacing",
            "cover_gradient": "coverGradient",
            "cover_pattern": "coverPattern",
            "heading_band": "headingBand",
            "table_header_fill": "tableHeaderFill",
            "page_size": "pageSize",
            "page_orientation": "pageOrientation",
            "margin_preset": "marginPreset",
            "margin_top": "marginTop",
            "margin_right": "marginRight",
            "margin_bottom": "marginBottom",
            "margin_left": "marginLeft",
            "page_header": "pageHeader",
            "page_header_text": "pageHeaderText",
            "page_footer": "pageFooter",
            "page_footer_text": "pageFooterText",
            "toc_depth": "tocDepth",
            "code_line_numbers": "codeLineNumbers",
            "code_wrap": "codeWrap",
            "code_font_size": "codeFontSize",
            "link_underline": "linkUnderline",
            "link_theme_color": "linkThemeColor",
            "watermark_text": "watermarkText",
        }
        for sk, camel in snake_to_camel.items():
            if sk in raw:
                raise ValueError(
                    f"旧キー '{sk}' は非対応です。'{camel}' を使ってください"
                )

        rounded = _as_bool(merged.get("rounded"), True)
        radius = _as_str(merged.get("radius"), "md").lower()
        if not rounded:
            radius = "none"
        if radius not in RADIUS_PRESETS:
            raise ValueError(f"未知の角丸サイズです: {radius}")

        font = _as_str(merged.get("font"), "noto").lower()
        if font and font not in FONT_PRESETS and not merged.get("font_family"):
            raise ValueError(f"未知のフォントです: {font}")
        if not font and not merged.get("font_family"):
            font = "noto"

        cover_gradient = _as_bool(merged.get("cover_gradient"), True)
        cover_pattern = _as_str(merged.get("cover_pattern"), "noise").lower()
        if cover_pattern not in COVER_PATTERNS:
            raise ValueError(f"未知の表紙デザインです: {cover_pattern}")

        page_size = _as_str(merged.get("page_size"), "a4").lower()
        if page_size not in PAGE_SIZES:
            raise ValueError(f"未知の用紙サイズです: {page_size}")

        page_orientation = _as_str(merged.get("page_orientation"), "portrait").lower()
        if page_orientation not in {"portrait", "landscape"}:
            raise ValueError(f"未知の用紙向きです: {page_orientation}")

        margin_preset = _as_str(merged.get("margin_preset"), "normal").lower()
        if margin_preset not in MARGIN_PRESETS and margin_preset != "custom":
            raise ValueError(f"未知の余白プリセットです: {margin_preset}")

        if margin_preset in MARGIN_PRESETS:
            mt, mr, mb, ml = MARGIN_PRESETS[margin_preset]
        else:
            mt = _sanitize_mm(merged.get("margin_top"), 14.0)
            mr = _sanitize_mm(merged.get("margin_right"), 14.0)
            mb = _sanitize_mm(merged.get("margin_bottom"), 16.0)
            ml = _sanitize_mm(merged.get("margin_left"), 14.0)

        page_header = _as_str(merged.get("page_header"), "none").lower()
        if page_header not in PAGE_HEADER_MODES:
            raise ValueError(f"未知のヘッダ設定です: {page_header}")
        page_footer = _as_str(merged.get("page_footer"), "none").lower()
        if page_footer not in PAGE_FOOTER_MODES:
            raise ValueError(f"未知のフッタ設定です: {page_footer}")

        toc_depth_raw = merged.get("toc_depth", 3)
        try:
            toc_depth = int(toc_depth_raw)
        except (TypeError, ValueError) as e:
            raise ValueError(f"tocDepth が不正です: {toc_depth_raw}") from e
        if toc_depth not in (2, 3):
            raise ValueError("tocDepth は 2 または 3 です")

        watermark = _as_str(merged.get("watermark"), "none").lower()
        if watermark not in WATERMARK_MODES:
            raise ValueError(f"未知の透かし設定です: {watermark}")
        watermark_text = _as_str(merged.get("watermark_text"), "")
        if watermark_text and not _SAFE_WATERMARK.match(watermark_text):
            raise ValueError("透かし文言に使えない文字があります")

        return cls(
            rounded=rounded,
            radius=radius,
            font=font or "noto",
            font_family=_as_str(merged.get("font_family"), "") or None,
            font_mono=_as_str(merged.get("font_mono"), "") or None,
            font_size=_as_str(merged.get("font_size"), "10.5pt") or "10.5pt",
            line_height=_as_str(merged.get("line_height"), "1.7") or "1.7",
            letter_spacing=_as_str(merged.get("letter_spacing"), "0") or "0",
            cover_gradient=cover_gradient,
            cover_pattern=cover_pattern,
            heading_band=_as_bool(merged.get("heading_band"), True),
            table_header_fill=_as_bool(merged.get("table_header_fill"), True),
            page_size=page_size,
            page_orientation=page_orientation,
            margin_preset=margin_preset,
            margin_top=mt,
            margin_right=mr,
            margin_bottom=mb,
            margin_left=ml,
            page_header=page_header,
            page_header_text=_as_str(merged.get("page_header_text"), ""),
            page_footer=page_footer,
            page_footer_text=_as_str(merged.get("page_footer_text"), ""),
            toc=_as_bool(merged.get("toc"), False),
            toc_depth=toc_depth,
            code_line_numbers=_as_bool(merged.get("code_line_numbers"), False),
            code_wrap=_as_bool(merged.get("code_wrap"), False),
            code_font_size=_as_str(merged.get("code_font_size"), ""),
            link_underline=_as_bool(merged.get("link_underline"), False),
            link_theme_color=_as_bool(merged.get("link_theme_color"), True),
            watermark=watermark,
            watermark_text=watermark_text,
            author=_as_str(merged.get("author"), ""),
            version=_as_str(merged.get("version"), ""),
            date=_as_str(merged.get("date"), ""),
        )

    def resolved_cover_pattern(self) -> str:
        """HTML class 用の正規化済みパターンキー。"""
        if self.cover_pattern in COVER_PATTERNS:
            return self.cover_pattern
        raise ValueError(f"未知の表紙デザインです: {self.cover_pattern}")

    def page_size_mm(self) -> tuple[float, float]:
        w, h = PAGE_SIZES.get(self.page_size, PAGE_SIZES["a4"])
        if self.page_orientation == "landscape":
            return h, w
        return w, h

    def page_size_px(self, dpi: float = 96.0) -> tuple[int, int]:
        w_mm, h_mm = self.page_size_mm()
        return (
            int(round(w_mm * dpi / 25.4)),
            int(round(h_mm * dpi / 25.4)),
        )

    def margins_mm(self) -> tuple[float, float, float, float]:
        return (
            self.margin_top,
            self.margin_right,
            self.margin_bottom,
            self.margin_left,
        )

    def font_stack(self) -> str:
        if self.font_family:
            return self.font_family
        return FONT_PRESETS.get(self.font, FONT_PRESETS["noto"])[0]

    def mono_stack(self) -> str:
        if self.font_mono:
            return self.font_mono
        return MONO_PRESETS[DEFAULT_MONO_PRESET][0]

    def google_fonts_href(self) -> str:
        families: list[str] = []
        if not self.font_family:
            q = FONT_PRESETS.get(self.font, FONT_PRESETS["noto"])[1]
            if q:
                for part in q.split("&family="):
                    if part:
                        families.append(part)
        # always include Noto for JP body safety if custom latin-only
        if self.font_family and "Noto" not in self.font_family:
            families.append("Noto+Sans+JP:wght@400;500;700")
        mono = self.mono_stack()
        for _key, (stack, query) in MONO_PRESETS.items():
            if query and stack.split(",")[0].strip().strip('"') in mono:
                families.append(query)
                break
        if not families:
            return ""
        # dedupe while preserving order
        seen: set[str] = set()
        parts: list[str] = []
        for f in families:
            if f not in seen:
                seen.add(f)
                parts.append(f"family={f}")
        return (
            "https://fonts.googleapis.com/css2?"
            + "&".join(parts)
            + "&display=swap"
        )

    def resolve_slot_text(
        self,
        mode: str,
        *,
        title: str = "",
        custom: str = "",
        for_playwright_page: bool = False,
    ) -> str:
        """ヘッダ／フッタの表示文言（Playwright 用 HTML 断片も可）。"""
        if mode == "none":
            return ""
        if mode == "title":
            return title
        if mode == "author":
            return self.author
        if mode == "date":
            return self.date
        if mode == "version":
            return self.version
        if mode == "confidential":
            return "社外秘"
        if mode == "page":
            if for_playwright_page:
                return '<span class="pageNumber"></span> / <span class="totalPages"></span>'
            return ""  # プレビュー側でページ番号を埋める
        if mode == "title-page":
            if for_playwright_page:
                left = html_lib.escape(title)
                return (
                    f'{left}'
                    '　<span class="pageNumber"></span>'
                    ' / <span class="totalPages"></span>'
                )
            return title
        if mode == "custom":
            return custom
        return ""

    def has_print_chrome(self) -> bool:
        return self.page_header != "none" or self.page_footer != "none"

    def watermark_label(self) -> str:
        if self.watermark == "none":
            return ""
        if self.watermark == "draft":
            return "DRAFT"
        if self.watermark == "confidential":
            return "社外秘"
        return self.watermark_text.strip()

    def meta_lines_with_identity(self, meta: list[str] | None) -> list[str]:
        """表紙フッタ行。空のときは著者・版・日付を自動流し込み。"""
        lines = [str(x).strip() for x in (meta or []) if str(x).strip()]
        if lines:
            return lines
        auto: list[str] = []
        if self.author:
            auto.append(self.author)
        if self.version:
            auto.append(f"版 {self.version}")
        if self.date:
            auto.append(self.date)
        return auto

    def ensure_toc_marker(self, body: str) -> str:
        """toc が有効で [TOC] が無いとき、本文先頭へ挿入する。"""
        if not self.toc:
            return body
        if re.search(r"^\s*\[TOC\]\s*$", body, flags=re.M):
            return body
        trimmed = body.lstrip("\n")
        return f"[TOC]\n\n{trimmed}" if trimmed else "[TOC]\n"

    def to_css_vars(self) -> str:
        r_sm, r_md, r_lg = RADIUS_PRESETS.get(self.radius, RADIUS_PRESETS["md"])
        preset_sans = FONT_PRESETS.get(self.font, FONT_PRESETS["noto"])[0]
        font_sans = _sanitize_css_font(self.font_stack(), preset_sans)
        font_mono = _sanitize_css_font(
            self.mono_stack(),
            MONO_PRESETS[DEFAULT_MONO_PRESET][0],
        )
        font_size = _sanitize_css_size(self.font_size, "10.5pt")
        line_height = _sanitize_line_height(self.line_height, "1.7")
        letter_spacing = _sanitize_letter_spacing(self.letter_spacing, "0")
        code_font_size = (
            _sanitize_css_size(self.code_font_size, font_size)
            if self.code_font_size.strip()
            else "0.92em"
        )

        # 表紙背景は themes/covers の静的画像。CSS 変数は不要。
        if self.heading_band:
            h2_bg = "var(--accent-50)"
            # 左アクセント 5px + 内側余白 14px（border-left 廃止・::before 化）
            h2_pad = "8px 14px 8px 19px"
            h2_accent_w = "5px"
            h2_radius = "var(--radius-md)"
        else:
            h2_bg = "transparent"
            h2_pad = "4px 0"
            h2_accent_w = "0px"
            h2_radius = "0"

        if self.table_header_fill:
            th_bg = "var(--accent-800)"
            th_fg = "var(--cover-fg)"
            th_border = "var(--accent-900)"
        else:
            th_bg = "var(--accent-25)"
            th_fg = "var(--text)"
            th_border = "var(--border)"

        w_mm, h_mm = self.page_size_mm()
        mt, mr, mb, ml = self.margins_mm()
        w_px, h_px = self.page_size_px(96.0)

        def mm(n: float) -> str:
            return f"{n:g}mm"

        def px_from_mm(n: float) -> str:
            return f"{round(n * 96.0 / 25.4)}px"

        link_color = "var(--accent-800)" if self.link_theme_color else "var(--body)"
        link_decoration = "underline" if self.link_underline else "none"
        code_white_space = "pre-wrap" if self.code_wrap else "pre"
        code_overflow = "visible" if self.code_wrap else "auto"

        # ヘッダ／フッタあり: 余白は Playwright 側に委任（二重余白を避ける）
        if self.has_print_chrome():
            page_rule = f"""
@page {{
  size: {mm(w_mm)} {mm(h_mm)};
  margin: 0;
}}

@page cover-page {{
  size: {mm(w_mm)} {mm(h_mm)};
  margin: 0;
}}
""".strip()
        else:
            page_rule = f"""
@page {{
  size: {mm(w_mm)} {mm(h_mm)};
  margin: {mm(mt)} {mm(mr)} {mm(mb)} {mm(ml)};
}}

@page cover-page {{
  size: {mm(w_mm)} {mm(h_mm)};
  margin: 0;
}}
""".strip()

        return f"""
:root {{
  --radius-sm: {r_sm};
  --radius-md: {r_md};
  --radius-lg: {r_lg};
  --font-sans: {font_sans};
  --font-mono: {font_mono};
  --base-font-size: {font_size};
  --line-height: {line_height};
  --letter-spacing: {letter_spacing};
  --h2-bg: {h2_bg};
  --h2-padding: {h2_pad};
  --h2-accent-width: {h2_accent_w};
  --h2-radius: {h2_radius};
  --th-bg: {th_bg};
  --th-fg: {th_fg};
  --th-border: {th_border};
  --page-width: {mm(w_mm)};
  --page-height: {mm(h_mm)};
  --page-width-px: {w_px}px;
  --page-height-px: {h_px}px;
  --page-margin-top: {mm(mt)};
  --page-margin-right: {mm(mr)};
  --page-margin-bottom: {mm(mb)};
  --page-margin-left: {mm(ml)};
  --page-margin-top-px: {px_from_mm(mt)};
  --page-margin-right-px: {px_from_mm(mr)};
  --page-margin-bottom-px: {px_from_mm(mb)};
  --page-margin-left-px: {px_from_mm(ml)};
  --link-color: {link_color};
  --link-decoration: {link_decoration};
  --code-font-size: {code_font_size};
  --code-white-space: {code_white_space};
  --code-overflow-x: {code_overflow};
}}

{page_rule}
""".strip()

    def chrome_cfg(self, *, title: str = "") -> dict[str, Any]:
        """プレビュー JS へ渡すヘッダ／フッタ設定。"""
        return {
            "headerMode": self.page_header,
            "headerText": self.resolve_slot_text(
                self.page_header, title=title, custom=self.page_header_text
            ),
            "footerMode": self.page_footer,
            "footerText": self.resolve_slot_text(
                self.page_footer, title=title, custom=self.page_footer_text
            ),
        }

    def playwright_header_footer(
        self, *, title: str = ""
    ) -> tuple[bool, str, str]:
        """(enabled, header_html, footer_html)。"""
        if not self.has_print_chrome():
            return False, "", ""
        base = (
            "font-size:8pt;font-family:system-ui,sans-serif;"
            "width:100%;padding:0 8mm;color:#546e7a;"
            "display:flex;align-items:center;"
        )

        def slot_html(mode: str, custom: str, *, center: bool) -> str:
            if mode == "none":
                return "<div></div>"
            raw = self.resolve_slot_text(
                mode,
                title=title,
                custom=custom,
                for_playwright_page=True,
            )
            inner = (
                raw
                if mode in {"page", "title-page"}
                else html_lib.escape(raw)
            )
            justify = "center" if center else "flex-start"
            return (
                f'<div style="{base}justify-content:{justify}">'
                f"<span>{inner}</span></div>"
            )

        header = slot_html(
            self.page_header, self.page_header_text, center=False
        )
        footer = slot_html(
            self.page_footer, self.page_footer_text, center=True
        )
        return True, header, footer
    def watermark_html(self) -> str:
        label = self.watermark_label()
        if not label:
            return ""
        esc = html_lib.escape(label)
        return (
            f'<div class="ohyna-watermark" aria-hidden="true">{esc}</div>'
        )
