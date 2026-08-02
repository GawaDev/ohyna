# -*- coding: utf-8 -*-
"""Markdown → 印刷用 HTML / PDF（一般用途）。

Mermaid flowchart は render_flowchart_svg で埋め込み、Playwright で A4 PDF 化します。
プロジェクト固有の表記・表紙・除外ルールは呼び出し側／JSON で渡します。
"""

from __future__ import annotations

import html as html_lib
import json
import re
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

from .engine import render_flowchart_svg
from .fences import replace_engine_fences
from .mermaid_lexer import register_mermaid_lexer
from .frontmatter import parse_document, resolve_cover_fields
from .design import DocumentDesign
from .theme import DEFAULT_PRINT_CSS, font_link_tags, load_print_css, theme_overrides_css

_PACKAGE_DIR = Path(__file__).resolve().parent
_SERVICE_ROOT = _PACKAGE_DIR.parent
DEFAULT_THEME_CSS = DEFAULT_PRINT_CSS


@dataclass
class MarkdownOptions:
    """本文整形オプション（プロジェクトごとに指定）。"""

    strip_nav_blockquotes: bool = True
    unwrap_internal_md_links: bool = True
    # この見出しからファイル末尾まで削除（例: 編集者向け付録）
    omit_from_headings: list[str] = field(default_factory=list)
    # この見出しブロックだけ削除（次の同レベル以上の見出しまで）
    omit_heading_blocks: list[str] = field(default_factory=list)


@dataclass
class PdfCover:
    """単票用の表紙。"""

    title: str
    subtitle: str = ""
    part_label: str = ""
    meta_lines: list[str] | None = None


def clean_markdown(text: str, *, options: MarkdownOptions | None = None) -> str:
    """PDF 向けに Markdown を整形。"""
    opt = options or MarkdownOptions()
    text = text.lstrip("\ufeff")
    # 説明用 HTML コメントは PDF に出さない
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    if opt.strip_nav_blockquotes:
        text = re.sub(r"^>\s*\[[^\]]*\]\([^)]+\)\s*\n?", "", text, flags=re.M)
    if opt.unwrap_internal_md_links:
        text = re.sub(
            r"\[([^\]]+)\]\((?:\.\./)?[^)]+\.md(?:#[^)]*)?\)",
            r"\1",
            text,
        )
    for heading in opt.omit_from_headings:
        title = heading.lstrip("#").strip()
        text = re.sub(
            rf"\n##\s*{re.escape(title)}[\s\S]*\Z",
            "\n",
            text,
        )
    for heading in opt.omit_heading_blocks:
        title = heading.lstrip("#").strip()
        # ### title ... until next heading (## or ###) or EOF
        text = re.sub(
            rf"\n###\s*{re.escape(title)}[\s\S]*?(?=\n##\s|\n###\s|\Z)",
            "\n",
            text,
        )
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def resolve_local_media(markdown_text: str, base_dir: Path) -> str:
    """相対パスの画像を file:// 絶対パスへ変換（PDF 埋め込み用）。

    - base_dir 配下の相対パスのみ許可
    - 利用者指定の file: / 絶対パスは拒否（LFI 防止）
    - http(s) / data: はそのまま（PDF 化時はネットワーク allowlist で制御）
    """
    from .paths import ensure_under

    base_dir = base_dir.resolve()

    def repl_md(m: re.Match[str]) -> str:
        alt, src = m.group(1), m.group(2).strip()
        if re.match(r"^data:", src, flags=re.I):
            return m.group(0)
        if re.match(r"^(https?:)", src, flags=re.I):
            return m.group(0)
        if re.match(r"^(file:)", src, flags=re.I):
            return f"![{alt}]()"
        if re.match(r"^([A-Za-z]:[\\/]|/|\\\\)", src):
            return f"![{alt}]()"
        try:
            full = ensure_under(base_dir, src, label="media")
        except ValueError:
            return f"![{alt}]()"
        if not full.is_file():
            return f"![{alt}]()"
        return f"![{alt}]({full.as_uri()})"

    return re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", repl_md, markdown_text)


_ALLOWED_HTML_TAGS = frozenset(
    {
        "a",
        "abbr",
        "b",
        "blockquote",
        "br",
        "caption",
        "code",
        "col",
        "colgroup",
        "dd",
        "del",
        "details",
        "div",
        "dl",
        "dt",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "i",
        "img",
        "input",
        "ins",
        "kbd",
        "li",
        "mark",
        "ol",
        "p",
        "pre",
        "q",
        "s",
        "section",
        "span",
        "strong",
        "sub",
        "summary",
        "sup",
        "table",
        "tbody",
        "td",
        "tfoot",
        "th",
        "thead",
        "tr",
        "ul",
    }
)
_ALLOWED_HTML_ATTRS = {
    "*": ["class", "id", "title", "role", "aria-label"],
    "a": ["href", "title", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "input": ["type", "checked", "disabled"],
    "details": ["open"],
    "td": ["colspan", "rowspan"],
    "th": ["colspan", "rowspan", "scope"],
    "col": ["span"],
    "colgroup": ["span"],
}


_VOID_HTML_TAGS = frozenset(
    {
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
    }
)
_HEADING_TAGS = frozenset({"h1", "h2", "h3", "h4", "h5", "h6"})
_KEEP_NEXT_MAX_HEADINGS = 4  # 連続見出しの巻き込み上限


def _split_top_level_html_blocks(fragment: str) -> list[str]:
    """サニタイズ済み HTML 断片をトップレベル・ブロック文字列に分割する。"""
    from html.parser import HTMLParser

    class _Splitter(HTMLParser):
        def __init__(self) -> None:
            super().__init__(convert_charrefs=False)
            self.blocks: list[str] = []
            self._depth = 0
            self._buf: list[str] = []

        def _flush(self) -> None:
            raw = "".join(self._buf)
            self._buf.clear()
            if raw.strip():
                self.blocks.append(raw)

        def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
            attr = "".join(
                f' {k}="{html_lib.escape(v or "", quote=True)}"' for k, v in attrs
            )
            void = tag.lower() in _VOID_HTML_TAGS
            piece = f"<{tag}{attr}>" if not void else f"<{tag}{attr} />"
            if self._depth == 0:
                self._buf.append(piece)
                if void:
                    self._flush()
                else:
                    self._depth = 1
            else:
                self._buf.append(piece)
                if not void:
                    self._depth += 1

        def handle_endtag(self, tag: str) -> None:
            if tag.lower() in _VOID_HTML_TAGS:
                return
            if self._depth <= 0:
                return
            self._buf.append(f"</{tag}>")
            self._depth -= 1
            if self._depth == 0:
                self._flush()

        def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
            self.handle_starttag(tag, attrs)

        def handle_data(self, data: str) -> None:
            if self._depth > 0:
                self._buf.append(data)
            elif data.strip():
                self.blocks.append(data)

        def handle_entityref(self, name: str) -> None:
            self.handle_data(f"&{name};")

        def handle_charref(self, name: str) -> None:
            self.handle_data(f"&#{name};")

        def handle_comment(self, data: str) -> None:
            if self._depth > 0:
                self._buf.append(f"<!--{data}-->")

        def close(self) -> None:
            super().close()
            if self._buf:
                self._flush()

    sp = _Splitter()
    try:
        sp.feed(fragment or "")
        sp.close()
    except Exception:
        return [fragment] if (fragment or "").strip() else []
    return sp.blocks


def _block_opening_tag(block: str) -> str:
    m = re.match(r"\s*<([a-zA-Z][\w-]*)\b", block or "")
    return (m.group(1).lower() if m else "")


def _decorate_toc_html(fragment: str) -> str:
    """[TOC] 出力に「目次」見出しを付与し、専用ブロックとして識別しやすくする。"""
    if not fragment or "toc" not in fragment:
        return fragment

    def repl(match: re.Match[str]) -> str:
        inner = match.group(1)
        if re.search(r'class=["\'][^"\']*\btoc-title\b', inner):
            return match.group(0)
        return (
            '<div class="toc">\n'
            '<p class="toc-title">目次</p>\n'
            f"{inner.strip()}\n"
            "</div>"
        )

    return re.sub(
        r'<div class="toc">\s*(.*?)\s*</div>',
        repl,
        fragment,
        flags=re.I | re.S,
    )


def _apply_keep_next_groups(fragment: str) -> str:
    """見出し泣き別れ防止: 見出し（連続可）＋直後の本文ブロックを .ohyna-keep-next で包む。"""
    blocks = _split_top_level_html_blocks(fragment)
    if not blocks:
        return fragment
    out: list[str] = []
    i = 0
    n = len(blocks)
    while i < n:
        tag = _block_opening_tag(blocks[i])
        if tag not in _HEADING_TAGS:
            out.append(blocks[i])
            i += 1
            continue
        # 連続見出しを集め、その直後の非見出しブロックまでを1グループに
        group = [blocks[i]]
        i += 1
        heading_count = 1
        while (
            i < n
            and _block_opening_tag(blocks[i]) in _HEADING_TAGS
            and heading_count < _KEEP_NEXT_MAX_HEADINGS
        ):
            group.append(blocks[i])
            i += 1
            heading_count += 1
        if i < n and _block_opening_tag(blocks[i]) not in _HEADING_TAGS:
            # 既に keep 包みなら二重化しない
            nxt = _block_opening_tag(blocks[i])
            chunk = blocks[i]
            head = chunk[:160]
            if nxt == "div" and "ohyna-keep-next" in head:
                out.extend(group)
                out.append(chunk)
                i += 1
                continue
            # 図は keep-next に入れない（大きい図ごと次ページへ送られ前頁に空きが出る）
            if nxt == "div" and "diagram-wrap" in head:
                out.extend(group)
                out.append(chunk)
                i += 1
                continue
            # 目次は前後改ページ必須のため keep-next に入れない
            if nxt == "div" and re.search(r'class=["\'][^"\']*\btoc\b', head):
                out.extend(group)
                out.append(chunk)
                i += 1
                continue
            group.append(chunk)
            i += 1
            out.append(
                '<div class="ohyna-keep-next">' + "".join(group) + "</div>"
            )
        else:
            # 後続本文が無い連続見出しのみ → まとめて keep（次ページへ丸ごと）
            if len(group) > 1:
                out.append(
                    '<div class="ohyna-keep-next">' + "".join(group) + "</div>"
                )
            else:
                out.append(group[0])
    return "".join(out)


def _sanitize_html_fragment(fragment: str) -> str:
    """Markdown 変換後の HTML から script 等を除去（XSS 緩和）。"""
    try:
        import bleach
    except ImportError as e:
        raise RuntimeError(
            "HTML サニタイズには bleach が必要です。pip install bleach"
        ) from e

    def _safe_href(url: str) -> str:
        u = (url or "").strip()
        if not u:
            return ""
        if re.match(r"^(https?:|mailto:|#|/)", u, flags=re.I):
            return u
        return ""

    def _safe_src(url: str) -> str:
        u = (url or "").strip()
        if not u:
            return ""
        if re.match(r"^(https?:|data:image/|file:)", u, flags=re.I):
            return u
        return ""

    cleaned = bleach.clean(
        fragment,
        tags=_ALLOWED_HTML_TAGS,
        attributes=_ALLOWED_HTML_ATTRS,
        protocols=["http", "https", "mailto", "data", "file"],
        strip=True,
    )
    # href/src の javascript: 等は bleach でも弾くが、file: は PDF 用に残す
    cleaned = re.sub(
        r'(<a\b[^>]*\bhref=")([^"]*)(")',
        lambda m: m.group(1) + _safe_href(m.group(2)) + m.group(3),
        cleaned,
        flags=re.I,
    )
    cleaned = re.sub(
        r'(<img\b[^>]*\bsrc=")([^"]*)(")',
        lambda m: m.group(1) + _safe_src(m.group(2)) + m.group(3),
        cleaned,
        flags=re.I,
    )
    return cleaned


def _force_details_open(html: str) -> str:
    """プレビュー／PDF では折りたたみを展開して中身を必ず見せる。"""

    def repl(m: re.Match[str]) -> str:
        tag = m.group(0)
        if re.search(r"\bopen\b", tag, flags=re.I):
            return tag
        return tag[:-1] + " open>"

    return re.sub(r"<details\b[^>]*>", repl, html, flags=re.I)


# プレビュー／PDF 共通: 見た目を変える操作を封じる（リンクジャンプも不可）
_LOCK_STATIC_APPEARANCE_JS = """
    function lockStaticAppearance() {
      for (const d of document.querySelectorAll("details")) {
        d.open = true;
        d.addEventListener("toggle", () => {
          d.open = true;
        });
      }
      for (const input of document.querySelectorAll(
        'input[type="checkbox"], input[type="radio"]'
      )) {
        input.disabled = true;
        input.tabIndex = -1;
      }
      // blob: プレビューでの #fragment 遷移はブラウザが拒否しうるため、リンクは表示のみ
      const blockLinkNav = (e) => {
        const t = e.target;
        if (!t || typeof t.closest !== "function") return;
        const a = t.closest("a[href]");
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
      };
      document.addEventListener("click", blockLinkNav, true);
      document.addEventListener("auxclick", blockLinkNav, true);
      document.addEventListener(
        "keydown",
        (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          blockLinkNav(e);
        },
        true
      );
      const neutralizeAnchors = (root) => {
        (root || document).querySelectorAll("a[href]").forEach((a) => {
          if (a.dataset.ohynaNavLocked === "1") return;
          a.dataset.ohynaNavLocked = "1";
          a.tabIndex = -1;
          a.setAttribute("draggable", "false");
        });
      };
      neutralizeAnchors(document);
      try {
        const mo = new MutationObserver((records) => {
          for (const r of records) {
            for (const n of r.addedNodes) {
              if (n.nodeType !== 1) continue;
              if (n.matches && n.matches("a[href]")) neutralizeAnchors(n.parentNode || document);
              else if (n.querySelectorAll) neutralizeAnchors(n);
            }
          }
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
      } catch (e) {}
    }
"""


_PDF_NET_ALLOW_PREFIXES = (
    "https://fonts.googleapis.com/",
    "https://fonts.gstatic.com/",
    "data:",
)


def _pdf_net_allow_prefixes() -> tuple[str, ...]:
    from .katex_js import KATEX_NET_ALLOW_PREFIX

    return _PDF_NET_ALLOW_PREFIXES + (KATEX_NET_ALLOW_PREFIX,)


def _playwright_url_allowed(
    url: str,
    *,
    html_uri: str,
    allowed_file_roots: Sequence[Path],
) -> bool:
    """PDF 化時に Playwright が取得してよい URL か。"""
    if url.startswith(html_uri):
        return True
    for prefix in _pdf_net_allow_prefixes():
        if url.startswith(prefix):
            return True
    if url.startswith("file:"):
        try:
            from urllib.parse import unquote, urlparse

            parsed = urlparse(url)
            path_str = unquote(parsed.path)
            # Windows: file:///C:/... → /C:/... 
            if re.match(r"^/[A-Za-z]:/", path_str):
                path_str = path_str[1:]
            target = Path(path_str).resolve()
        except Exception:
            return False
        for root in allowed_file_roots:
            try:
                target.relative_to(root.resolve())
                return target.is_file()
            except ValueError:
                continue
        return False
    return False


def _diagram_block_html(svg: str, mermaid_src: str) -> str:
    """図の SVG に加え、AI／テキスト抽出用に Mermaid ソースを埋め込む。"""
    esc = html_lib.escape(mermaid_src)
    # SVG アクセシビリティ用 <desc>（PDF によっては構造化テキストに残る）
    if re.search(r"<desc[\s>]", svg, flags=re.I) is None:
        svg = re.sub(
            r"(<svg\b[^>]*>)",
            rf'\1<desc id="mermaid-source">{esc}</desc>',
            svg,
            count=1,
            flags=re.I,
        )
    # 印刷では見えず、PDF のテキストレイヤには残しやすいブロック
    return (
        f'<div class="diagram-wrap" data-diagram-lang="mermaid">'
        f"{svg}"
        f'<pre class="diagram-mermaid-source">```mermaid\n{esc}\n```</pre>'
        f"</div>"
    )


def _client_diagram_block_html(mermaid_src: str) -> str:
    """プレビュー用: ブラウザ側 Mermaid で描画するプレースホルダ。

    class は mermaid にしない（公式ランタイムが .mermaid を再スキャンして
    SVG 断片をソースと誤認するのを防ぐ）。
    """
    esc = html_lib.escape(mermaid_src)
    return (
        f'<div class="diagram-wrap diagram-client" data-diagram-lang="mermaid">'
        f'<pre class="ohyna-mermaid">{esc}</pre>'
        f"</div>"
    )


def _math_display_html(tex: str) -> str:
    """数式フェンス → KaTeX auto-render が拾うディスプレイ数式ブロック。"""
    esc = html_lib.escape(tex.strip())
    return f'<div class="arithmatex">\\[{esc}\\]</div>'


def markdown_to_html_fragment(
    text: str,
    *,
    diagram_style: str = "blue",
    defer_diagrams: bool = False,
    design: DocumentDesign | None = None,
) -> str:
    """Markdown 本文 → HTML 断片。

    defer_diagrams=True のとき Mermaid はサーバー描画せず、
    クライアント描画用プレースホルダを埋め込む（プレビュー高速化）。
    """
    try:
        import markdown
    except ImportError as e:
        raise RuntimeError(
            "Markdown→PDF には markdown が必要です。pip install markdown pymdown-extensions"
        ) from e

    look = design or DocumentDesign()
    register_mermaid_lexer()
    text, mermaid_srcs, math_srcs = replace_engine_fences(text)
    body = markdown.markdown(
        text,
        extensions=[
            "tables",
            "sane_lists",
            "footnotes",
            "attr_list",
            "def_list",
            "abbr",
            "admonition",
            "smarty",
            "toc",
            "pymdownx.betterem",
            "pymdownx.tilde",
            "pymdownx.mark",
            "pymdownx.caret",
            "pymdownx.magiclink",
            "pymdownx.tasklist",
            "pymdownx.details",
            "pymdownx.highlight",
            "pymdownx.superfences",
            "pymdownx.arithmatex",
        ],
        extension_configs={
            "toc": {
                "permalink": False,
                "toc_depth": look.toc_depth,
            },
            "pymdownx.tasklist": {"custom_checkbox": True},
            "pymdownx.magiclink": {
                "hide_protocol": False,
                "repo_url_shortener": False,
            },
            "pymdownx.highlight": {
                "anchor_linenums": False,
                "line_spans": None,
                "linenums": look.code_line_numbers,
                "pygments_lang_class": True,
                "css_class": "highlight",
            },
            # KaTeX 向け: \(...\) / \[...\] を .arithmatex に包む
            "pymdownx.arithmatex": {
                "generic": True,
                "tex_inline_wrap": ["\\(", "\\)"],
                "tex_block_wrap": ["\\[", "\\]"],
            },
        },
    )
    # 生 HTML / script を除去してから図・数式を埋め込む（SVG はサニタイズ後に付与）
    body = _sanitize_html_fragment(body)
    body = _force_details_open(body)
    for i, tex in enumerate(math_srcs):
        block = _math_display_html(tex)
        body = body.replace(f"<p>@@@MATH{i}@@@</p>", block)
        body = body.replace(f"@@@MATH{i}@@@", block)
    for i, src in enumerate(mermaid_srcs):
        if defer_diagrams:
            block = _client_diagram_block_html(src)
        else:
            try:
                svg = render_flowchart_svg(src, style=diagram_style)
                block = _diagram_block_html(svg, src)
            except Exception as e:
                # 1 図の失敗で文書全体を落とさない
                msg = html_lib.escape(str(e).splitlines()[0][:240])
                src_esc = html_lib.escape(src[:2000])
                block = (
                    '<div class="diagram-wrap diagram-error" role="note">'
                    "<p><strong>Mermaid ダイアグラムの描画に失敗しました</strong></p>"
                    f'<pre class="diagram-error-msg">{msg}</pre>'
                    f'<pre class="diagram-mermaid-source">{src_esc}</pre>'
                    "</div>"
                )
        body = body.replace(f"<p>@@@MERMAID{i}@@@</p>", block)
        body = body.replace(f"@@@MERMAID{i}@@@", block)
    # 見出し泣き別れ防止（PDF Fragmentation + プレビュー分割の双方で利用）
    body = _apply_keep_next_groups(body)
    return _decorate_toc_html(body)


def doc_title_from_markdown(text: str, fallback: str = "document") -> str:
    m = re.search(r"^#\s+(.+)$", text.lstrip("\ufeff"), flags=re.M)
    return m.group(1).strip() if m else fallback


def cover_to_html(
    cover: PdfCover,
    *,
    pattern: str | None = None,
    design: DocumentDesign | None = None,
    style_name: str | None = None,
) -> str:
    """表紙 HTML。背景は themes/covers の静的画像を <img> で挿入するだけ。"""
    from .cover_assets import cover_background_data_uri
    from .design import COVER_PATTERNS

    meta = cover.meta_lines or []
    meta_html = "".join(f"<div>{html_lib.escape(line)}</div>" for line in meta)
    meta_block = f'<div class="meta">{meta_html}</div>' if meta else ""
    label = (
        f'<div class="part-label">{html_lib.escape(cover.part_label)}</div>'
        if cover.part_label
        else ""
    )
    sub = (
        f'<p class="subtitle">{html_lib.escape(cover.subtitle)}</p>'
        if cover.subtitle
        else ""
    )
    if pattern and pattern in COVER_PATTERNS:
        pat = pattern
    elif design is not None:
        pat = design.resolved_cover_pattern()
    else:
        pat = "noise"

    style = (style_name or "blue").strip().lower() or "blue"
    uri = cover_background_data_uri(style, pat)
    bg_img = ""
    if uri:
        safe_uri = html_lib.escape(uri, quote=True)
        bg_img = (
            f'<img class="cover-bg" src="{safe_uri}" alt="" '
            f'aria-hidden="true" decoding="async" />'
        )
    return f"""
  <section class="cover" data-cover-pattern="{html_lib.escape(pat, quote=True)}">
    {bg_img}
    {label}
    <h1>{html_lib.escape(cover.title)}</h1>
    {sub}
    {meta_block}
  </section>
"""


def wrap_document_html(
    *,
    title: str,
    body_sections: str,
    cover_html: str = "",
    theme_css: str | Path | None = None,
    diagram_style: str = "blue",
    design: DocumentDesign | None = None,
    lang: str = "ja",
    client_mermaid: bool = False,
) -> str:
    look = design or DocumentDesign()
    if theme_css is None:
        css = load_print_css(diagram_style, look)
    elif isinstance(theme_css, Path) or (isinstance(theme_css, str) and Path(theme_css).is_file()):
        css = (
            theme_overrides_css(diagram_style)
            + "\n\n"
            + Path(theme_css).read_text(encoding="utf-8")
            + "\n\n"
            + look.to_css_vars()
        )
    else:
        css = str(theme_css)

    from .katex_js import (
        KATEX_AUTO_RENDER_JS,
        KATEX_AUTO_RENDER_MJS,
        KATEX_JS,
        katex_stylesheet_link,
    )

    katex_head = katex_stylesheet_link()

    client_script = ""
    if client_mermaid:
        from .mermaid_js import (
            CROP_SVG_WHITESPACE_JS,
            MERMAID_CDN,
            ZENUML_CDN,
            style_to_theme_variables,
        )
        from .style import DiagramStyle

        theme_vars = style_to_theme_variables(DiagramStyle.preset(diagram_style))
        page_w_mm, page_h_mm = look.page_size_mm()
        mt, mr, mb, ml = look.margins_mm()
        page_w_px, page_h_px = look.page_size_px()
        chrome = look.chrome_cfg(title=title)
        cfg = json.dumps(
            {
                "mermaidCdn": MERMAID_CDN,
                "zenumlCdn": ZENUML_CDN,
                "themeVariables": theme_vars,
                "katexAutoRenderMjs": KATEX_AUTO_RENDER_MJS,
                "katexDelimiters": [
                    {"left": "$$", "right": "$$", "display": True},
                    {"left": "\\[", "right": "\\]", "display": True},
                    {"left": "$", "right": "$", "display": False},
                    {"left": "\\(", "right": "\\)", "display": False},
                ],
                "pageWidthMm": page_w_mm,
                "pageHeightMm": page_h_mm,
                "pageWidthPx": page_w_px,
                "pageHeightPx": page_h_px,
                "marginTopMm": mt,
                "marginRightMm": mr,
                "marginBottomMm": mb,
                "marginLeftMm": ml,
                "chrome": chrome,
            },
            ensure_ascii=False,
        )
        client_script = f"""
  <script>
    (function () {{
      try {{
        void window.localStorage;
      }} catch (e) {{
        const mem = new Map();
        const fake = {{
          get length() {{ return mem.size; }},
          key(i) {{ return [...mem.keys()][i] ?? null; }},
          getItem(k) {{ return mem.has(k) ? mem.get(k) : null; }},
          setItem(k, v) {{ mem.set(String(k), String(v)); }},
          removeItem(k) {{ mem.delete(String(k)); }},
          clear() {{ mem.clear(); }},
        }};
        Object.defineProperty(window, "localStorage", {{ value: fake, configurable: true }});
        Object.defineProperty(window, "sessionStorage", {{ value: fake, configurable: true }});
      }}
    }})();
  </script>
  <script type="module">
    window.__diagramsReady = false;
    window.__ohynaPageCount = 0;
    window.__ohynaCurrentPage = 1;
    window.__ohynaZoom = 1;
    window.__ohynaDiagramErrors = [];
    let __ohynaStatusPosted = false;
    const cfg = {cfg};
    const A4_W_PX = Number(cfg.pageWidthPx) || (210 * 96) / 25.4;
    const A4_H_PX = Number(cfg.pageHeightPx) || (297 * 96) / 25.4;
    const PAGE_CONTENT_H_PX =
      (((Number(cfg.pageHeightMm) || 297) -
        (Number(cfg.marginTopMm) || 14) -
        (Number(cfg.marginBottomMm) || 16)) *
        96) /
      25.4;
{_LOCK_STATIC_APPEARANCE_JS}
    lockStaticAppearance();

    const post = (payload) => {{
      try {{
        parent.postMessage({{ source: "ohyna-preview", ...payload }}, "*");
      }} catch (e) {{}}
    }};

    const collectDiagramErrors = () => {{
      const msgs = [...document.querySelectorAll(".diagram-error-msg")]
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean);
      window.__ohynaDiagramErrors = msgs;
      return msgs;
    }};

    const postDiagramStatus = () => {{
      if (__ohynaStatusPosted || !window.__diagramsReady) return;
      __ohynaStatusPosted = true;
      const msgs = collectDiagramErrors();
      post({{
        type: "diagramStatus",
        diagramsReady: true,
        diagramErrorCount: msgs.length,
        diagramErrors: msgs.slice(0, 5),
        pageCount: window.__ohynaPageCount,
        currentPage: window.__ohynaCurrentPage,
      }});
    }};

    const getScroller = () => document.body;

    /** section.content 直下ブロック（paginateA4 と同じフィルタ） */
    const listContentBlocks = (content) =>
      [...content.childNodes].filter((n) => {{
        if (n.nodeType === Node.ELEMENT_NODE) return true;
        return (
          n.nodeType === Node.TEXT_NODE &&
          String(n.textContent || "").trim()
        );
      }});

    /**
     * 本文ブロックに安定 ID を付与。
     * ページ再分割後も同じ data-ohyna-bi を辿れるようにする。
     */
    const stampBlockAnchors = () => {{
      if (
        document.body.classList.contains("ohyna-a4-paginated") &&
        document.querySelector("[data-ohyna-bi]")
      ) {{
        return;
      }}
      const root = document.querySelector("section.content");
      if (!root) return;
      listContentBlocks(root).forEach((n, i) => {{
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        n.setAttribute("data-ohyna-bi", String(i));
        const hint = String(n.textContent || "")
          .trim()
          .replace(/\\s+/g, " ")
          .slice(0, 48);
        if (hint) n.setAttribute("data-ohyna-bh", hint);
      }});
    }};

    const currentPageIndex = () => {{
      const sheets = [...document.querySelectorAll(".ohyna-a4-sheet")];
      if (!sheets.length) return 1;
      const scroller = getScroller();
      const viewMid = scroller.clientHeight / 2;
      let best = 1;
      let bestDist = Infinity;
      sheets.forEach((sheet, i) => {{
        const r = sheet.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const dist = Math.abs(mid - viewMid);
        if (dist < bestDist) {{
          bestDist = dist;
          best = i + 1;
        }}
      }});
      return best;
    }};

    /** ビューポート上端付近のブロックをアンカーとして記録 */
    const captureAnchor = () => {{
      const nodes = [...document.querySelectorAll("[data-ohyna-bi]")];
      if (!nodes.length) return {{ bi: -1, offset: 0, hint: "" }};
      const scroller = getScroller();
      const sRect = scroller.getBoundingClientRect();
      const targetY =
        sRect.top + Math.min(96, Math.max(24, scroller.clientHeight * 0.2));
      let best = null;
      let bestDist = Infinity;
      for (const el of nodes) {{
        const r = el.getBoundingClientRect();
        if (r.height <= 0 && r.width <= 0) continue;
        const dist = Math.abs(r.top - targetY);
        if (r.bottom < sRect.top - 40) continue;
        if (dist < bestDist) {{
          bestDist = dist;
          best = el;
        }}
      }}
      if (!best) {{
        for (const el of nodes) {{
          const r = el.getBoundingClientRect();
          const dist = targetY - r.top;
          if (dist >= 0 && dist < bestDist) {{
            bestDist = dist;
            best = el;
          }}
        }}
      }}
      if (!best) return {{ bi: -1, offset: 0, hint: "" }};
      const r = best.getBoundingClientRect();
      return {{
        bi: Number(best.getAttribute("data-ohyna-bi")),
        offset: r.top - sRect.top,
        hint: best.getAttribute("data-ohyna-bh") || "",
      }};
    }};

    const report = () => {{
      const sheets = document.querySelectorAll(".ohyna-a4-sheet");
      window.__ohynaPageCount = sheets.length;
      window.__ohynaCurrentPage = currentPageIndex();
      const scroller = getScroller();
      const h = Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
        400
      );
      const anchor = captureAnchor();
      window.__ohynaAnchor = anchor;
      post({{
        height: h,
        diagramsReady: !!window.__diagramsReady,
        pageCount: window.__ohynaPageCount,
        currentPage: window.__ohynaCurrentPage,
        scrollTop: scroller.scrollTop || 0,
        scrollLeft: scroller.scrollLeft || 0,
        anchorBi: anchor.bi,
        anchorOffset: anchor.offset,
        anchorHint: anchor.hint,
        zoom: window.__ohynaZoom,
        a4WidthPx: A4_W_PX,
        a4HeightPx: A4_H_PX,
      }});
    }};

    /** transform:scale 用。レイアウト実寸 × zoom を slot に反映 */
    const syncDeskSlot = () => {{
      const desk = document.querySelector(".ohyna-a4-desk");
      const slot = document.querySelector(".ohyna-a4-desk-slot");
      if (!desk || !slot) return;
      const z = window.__ohynaZoom || 1;
      const w = desk.offsetWidth;
      const h = desk.offsetHeight;
      slot.style.width = Math.max(1, w * z) + "px";
      slot.style.height = Math.max(1, h * z) + "px";
    }};

    const scrollToSheetIndex = (idx, behavior = "auto") => {{
      const sheets = [...document.querySelectorAll(".ohyna-a4-sheet")];
      if (!sheets.length) return;
      const i = Math.min(sheets.length - 1, Math.max(0, idx));
      const sheet = sheets[i];
      const scroller = getScroller();
      const sRect = scroller.getBoundingClientRect();
      const r = sheet.getBoundingClientRect();
      const pad = 28; // .ohyna-a4-zoom-shell 上 padding 相当
      const nextTop = scroller.scrollTop + (r.top - sRect.top) - pad;
      const nextLeft = scroller.scrollLeft + (r.left - sRect.left);
      if (behavior === "smooth" && typeof scroller.scrollTo === "function") {{
        scroller.scrollTo({{ top: Math.max(0, nextTop), left: Math.max(0, nextLeft), behavior: "smooth" }});
      }} else {{
        scroller.scrollTop = Math.max(0, nextTop);
        scroller.scrollLeft = Math.max(0, nextLeft);
      }}
      window.__ohynaCurrentPage = i + 1;
    }};

    const gotoPage = (page, behavior = "smooth") => {{
      const sheets = document.querySelectorAll(".ohyna-a4-sheet");
      if (!sheets.length) return;
      const idx = Math.min(sheets.length, Math.max(1, Math.round(page))) - 1;
      scrollToSheetIndex(idx, behavior);
      report();
    }};

    const applyZoom = (z) => {{
      const prev = window.__ohynaZoom || 1;
      const next = Math.min(5, Math.max(0.25, Number(z) || 1));
      const desk = document.querySelector(".ohyna-a4-desk");
      const scroller = getScroller();
      if (Math.abs(next - prev) < 1e-6) {{
        if (desk) desk.style.setProperty("--ohyna-zoom", String(next));
        syncDeskSlot();
        report();
        return;
      }}
      // ビューポート中心直下の内容をズーム後も同じ位置に保つ
      const vx = scroller.clientWidth / 2;
      const vy = scroller.clientHeight / 2;
      let localX = 0;
      let localY = 0;
      if (desk && prev > 0) {{
        const r = desk.getBoundingClientRect();
        localX = (vx - r.left) / prev;
        localY = (vy - r.top) / prev;
      }}
      window.__ohynaZoom = next;
      if (desk) desk.style.setProperty("--ohyna-zoom", String(next));
      syncDeskSlot();
      if (desk) void desk.offsetHeight;
      if (desk) {{
        const r2 = desk.getBoundingClientRect();
        const ax = r2.left + localX * next;
        const ay = r2.top + localY * next;
        scroller.scrollLeft += ax - vx;
        scroller.scrollTop += ay - vy;
      }}
      report();
    }};

    /** メインからの表示位置復元（ページ分割・図リサイズ後に再試行） */
    let __ohynaRestore = null;
    let __ohynaRestoreTries = 0;

    const findAnchorEl = (bi, hint) => {{
      const n = Number(bi);
      if (Number.isFinite(n) && n >= 0) {{
        const el = document.querySelector('[data-ohyna-bi="' + n + '"]');
        if (el) return el;
      }}
      const h = String(hint || "").trim();
      if (!h) return null;
      const key = h.slice(0, 24);
      const all = [...document.querySelectorAll("[data-ohyna-bh]")];
      return (
        all.find((el) => (el.getAttribute("data-ohyna-bh") || "").startsWith(key)) ||
        null
      );
    }};

    const scrollToAnchor = (bi, offset, hint) => {{
      const el = findAnchorEl(bi, hint);
      if (!el) return false;
      const scroller = getScroller();
      const sRect = scroller.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const desired = Number(offset);
      const targetOffset = Number.isFinite(desired) ? desired : 28;
      scroller.scrollTop += r.top - sRect.top - targetOffset;
      window.__ohynaCurrentPage = currentPageIndex();
      return true;
    }};

    const applyRestoreView = () => {{
      const r = __ohynaRestore;
      if (!r) return false;
      if (!document.body.classList.contains("ohyna-a4-paginated")) return false;
      const sheets = document.querySelectorAll(".ohyna-a4-sheet");
      if (!sheets.length) return false;
      const page = Math.round(Number(r.page) || 0);
      const top = Number(r.top) || 0;
      const left = Number(r.left) || 0;
      const bi = Number(r.bi);
      const offset = Number(r.offset);
      const hint = r.hint || "";
      let ok = false;
      if (Number.isFinite(bi) && bi >= 0) {{
        ok = scrollToAnchor(bi, offset, hint);
      }}
      if (!ok && page > 1) {{
        scrollToSheetIndex(page - 1, "auto");
        ok = true;
      }}
      if (!ok && (top > 0 || left > 0)) {{
        const scroller = getScroller();
        scroller.scrollLeft = left;
        scroller.scrollTop = top;
        window.__ohynaCurrentPage = currentPageIndex();
        ok = true;
      }}
      if (!ok) {{
        __ohynaRestore = null;
        __ohynaRestoreTries = 0;
        return true;
      }}
      if (left > 0) {{
        const scroller = getScroller();
        scroller.scrollLeft = left;
      }}
      __ohynaRestoreTries += 1;
      if (__ohynaRestoreTries >= 36) {{
        __ohynaRestore = null;
        __ohynaRestoreTries = 0;
        report();
        return true;
      }}
      return false;
    }};
    const scheduleRestoreView = () => {{
      if (!__ohynaRestore) return;
      const tick = () => {{
        if (applyRestoreView()) return;
        if (!__ohynaRestore) return;
        window.setTimeout(tick, 80);
      }};
      window.requestAnimationFrame(() => window.requestAnimationFrame(tick));
    }};

    const paginateA4 = () => {{
      if (document.body.classList.contains("ohyna-a4-paginated")) return;
      const cover = document.querySelector(".cover");
      const content = document.querySelector("section.content");
      const blocks = content
        ? [...content.childNodes].filter((n) => {{
            if (n.nodeType === Node.ELEMENT_NODE) return true;
            return (
              n.nodeType === Node.TEXT_NODE &&
              String(n.textContent || "").trim()
            );
          }})
        : [];
      stampBlockAnchors();

      if (cover) cover.remove();
      if (content) content.remove();

      const shell = document.createElement("div");
      shell.className = "ohyna-a4-zoom-shell";
      const slot = document.createElement("div");
      slot.className = "ohyna-a4-desk-slot";
      const desk = document.createElement("div");
      desk.className = "ohyna-a4-desk";
      desk.style.setProperty("--ohyna-zoom", String(window.__ohynaZoom || 1));
      slot.appendChild(desk);
      shell.appendChild(slot);
      document.body.replaceChildren(shell);
      document.documentElement.classList.add("ohyna-a4-paginated");
      document.body.classList.add("ohyna-a4-paginated");

      const renumber = () => {{
        desk.querySelectorAll(".ohyna-a4-sheet").forEach((el, i) => {{
          el.dataset.page = String(i + 1);
        }});
      }};

      const applyChrome = (sheet, kind) => {{
        if (kind !== "content") return;
        const chrome = cfg.chrome || {{}};
        const headerText = String(chrome.headerText || "").trim();
        const footerMode = String(chrome.footerMode || "none");
        const footerText = String(chrome.footerText || "").trim();
        if (headerText) {{
          const el = document.createElement("div");
          el.className = "ohyna-page-chrome ohyna-page-chrome--header";
          el.textContent = headerText;
          sheet.appendChild(el);
        }}
        if (footerMode !== "none") {{
          const el = document.createElement("div");
          el.className = "ohyna-page-chrome ohyna-page-chrome--footer";
          el.dataset.footerMode = footerMode;
          if (footerMode === "page") {{
            el.textContent = "";
          }} else if (footerMode === "title-page") {{
            el.dataset.title = footerText;
            el.textContent = footerText;
          }} else {{
            el.textContent = footerText;
          }}
          sheet.appendChild(el);
        }}
      }};

      const syncFooterNumbers = () => {{
        const sheets = [...desk.querySelectorAll(".ohyna-a4-sheet--content")];
        const total = sheets.length;
        sheets.forEach((sheet, i) => {{
          const foot = sheet.querySelector(".ohyna-page-chrome--footer");
          if (!foot) return;
          const mode = foot.dataset.footerMode || "";
          const n = i + 1;
          if (mode === "page") {{
            foot.textContent = total > 1 ? n + " / " + total : String(n);
          }} else if (mode === "title-page") {{
            const t = foot.dataset.title || "";
            foot.textContent =
              t + (t ? "　" : "") + (total > 1 ? n + " / " + total : String(n));
          }}
        }});
      }};

      const addSheet = (kind) => {{
        const sheet = document.createElement("div");
        sheet.className =
          "ohyna-a4-sheet " +
          (kind === "cover" ? "ohyna-a4-sheet--cover" : "ohyna-a4-sheet--content");
        desk.appendChild(sheet);
        applyChrome(sheet, kind);
        renumber();
        syncFooterNumbers();
        return sheet;
      }};

      const isEl = (n) => n && n.nodeType === Node.ELEMENT_NODE;
      const tagOf = (n) => (isEl(n) ? String(n.tagName || "").toLowerCase() : "");
      const isHeading = (n) => /^h[1-6]$/.test(tagOf(n));
      const isKeepWithNext = (n) =>
        isHeading(n) || tagOf(n) === "hr" ||
        (isEl(n) && n.classList && n.classList.contains("ohyna-keep-next"));
      const isAtomic = (n) => {{
        if (!isEl(n)) return false;
        if (n.classList && (
          n.classList.contains("ohyna-keep-next") ||
          n.classList.contains("ohyna-keep") ||
          n.classList.contains("diagram-wrap") ||
          n.classList.contains("highlight")
        )) return true;
        // ul/ol は placeListContainer で li 分割する（長い [TOC] のページ内スクロール防止）
        return [
          "table",
          "pre",
          "blockquote",
          "figure",
          "dl",
          "details",
        ].includes(tagOf(n));
      }};
      const isOrphanEnd = (n) => isHeading(n) || tagOf(n) === "hr";
      /** .toc または直下の ul/ol（長いリスト・目次を li 単位で分割するため） */
      const getListRoot = (n) => {{
        if (!isEl(n)) return null;
        if (n.classList && n.classList.contains("toc")) {{
          return n.querySelector(":scope > ul, :scope > ol");
        }}
        const t = tagOf(n);
        return t === "ul" || t === "ol" ? n : null;
      }};

      if (cover) addSheet("cover").appendChild(cover);

      if (blocks.length) {{
        let sheet = addSheet("content");
        let section = document.createElement("section");
        section.className = "content md-single";
        sheet.appendChild(section);

        const overflows = () => {{
          void sheet.offsetHeight;
          void section.offsetHeight;
          return section.scrollHeight - section.clientHeight > 1;
        }};

        const newContentPage = () => {{
          sheet = addSheet("content");
          section = document.createElement("section");
          section.className = "content md-single";
          sheet.appendChild(section);
        }};

        /** 目次エントリをリーダー＋ページ番号用の構造へ */
        const enhanceTocLinks = (root) => {{
          (root || document).querySelectorAll(".toc a[href^='#']").forEach((a) => {{
            if (a.querySelector(".toc-text")) return;
            const text = document.createElement("span");
            text.className = "toc-text";
            while (a.firstChild) text.appendChild(a.firstChild);
            const leader = document.createElement("span");
            leader.className = "toc-leader";
            leader.setAttribute("aria-hidden", "true");
            const page = document.createElement("span");
            page.className = "toc-page";
            page.textContent = "";
            a.append(text, leader, page);
          }});
        }};

        /** 本文用紙番号を目次へ反映（フッタの content ページ番号と一致） */
        const fillTocPageNumbers = () => {{
          const contentSheets = [
            ...desk.querySelectorAll(".ohyna-a4-sheet--content"),
          ];
          const idToPage = new Map();
          contentSheets.forEach((sh, i) => {{
            sh.querySelectorAll("[id]").forEach((el) => {{
              if (el.id) idToPage.set(el.id, i + 1);
            }});
          }});
          desk.querySelectorAll(".toc a[href^='#']").forEach((a) => {{
            let id = (a.getAttribute("href") || "").slice(1);
            try {{
              id = decodeURIComponent(id);
            }} catch (e) {{}}
            const n = idToPage.get(id);
            let pageEl = a.querySelector(".toc-page");
            if (!pageEl) {{
              enhanceTocLinks(a.closest(".toc") || a);
              pageEl = a.querySelector(".toc-page");
            }}
            if (pageEl) pageEl.textContent = n != null ? String(n) : "";
          }});
        }};

        /** 目次・長いリストをトップレベル li ごとに用紙へ流す */
        const placeListContainer = (container, opts = {{}}) => {{
          const asToc = !!(
            opts.asToc ||
            (container.classList && container.classList.contains("toc"))
          );
          const list = getListRoot(container);
          if (!list) {{
            placeUnit([container]);
            return;
          }}
          const items = [...list.children].filter((c) => tagOf(c) === "li");
          if (!items.length) {{
            placeUnit([container]);
            return;
          }}
          if (asToc) enhanceTocLinks(container);
          const listTag = list.tagName;
          const titleEl = asToc
            ? container.querySelector(":scope > .toc-title")
            : null;
          let tocChunkIndex = 0;
          const startChunk = () => {{
            if (asToc) {{
              const wrap = document.createElement("div");
              wrap.className =
                tocChunkIndex === 0 ? "toc" : "toc toc--continued";
              if (tocChunkIndex === 0 && titleEl) {{
                wrap.appendChild(titleEl);
              }} else if (tocChunkIndex > 0) {{
                const cont = document.createElement("p");
                cont.className = "toc-title toc-title--continued";
                cont.textContent = "目次（続き）";
                wrap.appendChild(cont);
              }}
              const ul = document.createElement(listTag);
              ul.className = "toc-list";
              wrap.appendChild(ul);
              section.appendChild(wrap);
              tocChunkIndex += 1;
              return ul;
            }}
            const ul = document.createElement(listTag);
            if (container.className) ul.className = container.className;
            section.appendChild(ul);
            return ul;
          }};
          let ul = null;
          for (const li of items) {{
            if (!ul) ul = startChunk();
            ul.appendChild(li);
            if (!overflows()) continue;
            ul.removeChild(li);
            if (!ul.childNodes.length) {{
              ul.appendChild(li);
              section.classList.add("is-oversized-page");
              newContentPage();
              ul = null;
              continue;
            }}
            newContentPage();
            ul = startChunk();
            ul.appendChild(li);
            if (overflows()) {{
              section.classList.add("is-oversized-page");
              newContentPage();
              ul = null;
            }}
          }}
        }};

        /** ページ末の見出し／hr 連鎖を外して返す（泣き別れ防止の巻き戻し） */
        const peelTrailingKeep = () => {{
          const peeled = [];
          while (section.lastChild && isOrphanEnd(section.lastChild)) {{
            peeled.unshift(section.lastChild);
            section.removeChild(section.lastChild);
          }}
          // ohyna-keep-next が末尾で中身が見出しだけ、というケースは atomic ごと剥がす
          while (
            section.lastChild &&
            isEl(section.lastChild) &&
            section.lastChild.classList &&
            section.lastChild.classList.contains("ohyna-keep-next")
          ) {{
            const k = section.lastChild;
            const kids = [...k.children];
            const onlyHeads =
              kids.length > 0 && kids.every((c) => isHeading(c) || tagOf(c) === "hr");
            if (!onlyHeads) break;
            peeled.unshift(k);
            section.removeChild(k);
          }}
          return peeled;
        }};

        const placeUnit = (nodes) => {{
          if (!nodes.length) return;
          for (const n of nodes) section.appendChild(n);
          if (!overflows()) return;
          for (const n of nodes) section.removeChild(n);
          if (!section.childNodes.length) {{
            for (const n of nodes) section.appendChild(n);
            section.classList.add("is-oversized-page");
            newContentPage();
            return;
          }}
          const peeled = peelTrailingKeep();
          newContentPage();
          for (const p of peeled) section.appendChild(p);
          for (const n of nodes) section.appendChild(n);
          if (!overflows()) return;
          // peeled + unit が次ページでも溢れる → unit を単独ページに
          for (const n of nodes) section.removeChild(n);
          for (const p of peeled) {{
            if (p.parentNode === section) section.removeChild(p);
          }}
          if (peeled.length) {{
            for (const p of peeled) section.appendChild(p);
            if (overflows()) section.classList.add("is-oversized-page");
            newContentPage();
          }}
          for (const n of nodes) section.appendChild(n);
          if (overflows()) section.classList.add("is-oversized-page");
          newContentPage();
        }};

        let bi = 0;
        while (bi < blocks.length) {{
          const b = blocks[bi];
          // 目次は前後とも改ページ（専用ページ群）。長い目次は li 単位で複数頁へ
          if (isEl(b) && b.classList && b.classList.contains("toc")) {{
            if (section.childNodes.length) newContentPage();
            placeListContainer(b, {{ asToc: true }});
            bi += 1;
            if (bi < blocks.length && section.childNodes.length) {{
              newContentPage();
            }}
            continue;
          }}
          // 長い ul/ol は li 単位で分割
          if (isEl(b) && getListRoot(b)) {{
            placeListContainer(b);
            bi += 1;
            continue;
          }}
          // 既にサーバ側で包まれた keep / atomic は1ユニット
          if (
            isEl(b) &&
            (b.classList?.contains("ohyna-keep-next") ||
              b.classList?.contains("ohyna-keep") ||
              isAtomic(b))
          ) {{
            placeUnit([b]);
            bi += 1;
            continue;
          }}
          // 未グループの見出し／hr は後続本文1つまで先読み（図は除く＝空き頁を防ぐ）
          if (isHeading(b) || tagOf(b) === "hr") {{
            const unit = [b];
            bi += 1;
            while (
              bi < blocks.length &&
              isHeading(blocks[bi]) &&
              unit.length < 4
            ) {{
              unit.push(blocks[bi]);
              bi += 1;
            }}
            if (
              bi < blocks.length &&
              !isHeading(blocks[bi]) &&
              tagOf(blocks[bi]) !== "hr" &&
              !(
                isEl(blocks[bi]) &&
                blocks[bi].classList &&
                blocks[bi].classList.contains("diagram-wrap")
              )
            ) {{
              unit.push(blocks[bi]);
              bi += 1;
            }}
            placeUnit(unit);
            continue;
          }}
          placeUnit([b]);
          bi += 1;
        }}

        // ページ末が孤立見出し／hr なら次へ（最終パス）
        const sheets = [...desk.querySelectorAll(".ohyna-a4-sheet--content")];
        for (let si = 0; si < sheets.length; si++) {{
          const sec = sheets[si].querySelector("section.content");
          if (!sec || !sec.lastChild) continue;
          if (!isOrphanEnd(sec.lastChild)) continue;
          const moved = [];
          while (sec.lastChild && isOrphanEnd(sec.lastChild)) {{
            moved.unshift(sec.lastChild);
            sec.removeChild(sec.lastChild);
          }}
          if (!moved.length) continue;
          let dest = sheets[si + 1]?.querySelector("section.content");
          if (!dest) {{
            newContentPage();
            dest = section;
            sheets.push(sheet);
          }}
          const first = dest.firstChild;
          for (const m of moved) {{
            dest.insertBefore(m, first);
          }}
        }}

        // 空の本文用紙を除去
        desk.querySelectorAll(".ohyna-a4-sheet--content").forEach((sh) => {{
          const sec = sh.querySelector("section.content");
          if (sec && !sec.childNodes.length) sh.remove();
        }});
        renumber();
        syncFooterNumbers();
        fillTocPageNumbers();
      }}

      window.__ohynaPageCount = desk.querySelectorAll(".ohyna-a4-sheet").length;
      syncDeskSlot();
    }};

    document.addEventListener(
      "wheel",
      (e) => {{
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        post({{ deltaY: e.deltaY }});
      }},
      {{ passive: false, capture: true }}
    );

    let __ohynaPanning = false;
    let __panX = 0;
    let __panY = 0;
    document.addEventListener(
      "pointerdown",
      (e) => {{
        if (e.button !== 1) return;
        e.preventDefault();
        __ohynaPanning = true;
        __panX = e.screenX;
        __panY = e.screenY;
      }},
      {{ capture: true }}
    );
    document.addEventListener(
      "pointermove",
      (e) => {{
        if (!__ohynaPanning) return;
        e.preventDefault();
        const dx = e.screenX - __panX;
        const dy = e.screenY - __panY;
        __panX = e.screenX;
        __panY = e.screenY;
        const scroller = getScroller();
        scroller.scrollLeft -= dx;
        scroller.scrollTop -= dy;
      }},
      {{ capture: true }}
    );
    document.addEventListener(
      "pointerup",
      (e) => {{
        if (e.button !== 1 && !__ohynaPanning) return;
        __ohynaPanning = false;
      }},
      {{ capture: true }}
    );
    document.addEventListener(
      "auxclick",
      (e) => {{
        if (e.button === 1) e.preventDefault();
      }},
      {{ capture: true }}
    );
    // body がスクローラなので capture で拾う（window だけでは届かない）
    document.addEventListener(
      "scroll",
      () => {{
        window.__ohynaCurrentPage = currentPageIndex();
        report();
      }},
      {{ passive: true, capture: true }}
    );

    window.addEventListener("message", (ev) => {{
      const data = ev.data;
      if (!data || data.source !== "ohyna-preview-host") return;
      if (data.type === "remeasure") report();
      if (data.type === "setZoom" && typeof data.zoom === "number") {{
        applyZoom(data.zoom);
        scheduleRestoreView();
      }}
      if (data.type === "setColorScheme" && (data.scheme === "dark" || data.scheme === "light")) {{
        if (typeof window.__ohynaApplyColorScheme === "function") {{
          window.__ohynaApplyColorScheme(data.scheme);
        }} else {{
          const desk = data.scheme === "dark" ? "#2a3038" : "#cfd6de";
          document.documentElement.setAttribute("data-ohyna-color-scheme", data.scheme);
          document.documentElement.style.setProperty("--ohyna-desk", desk);
          document.documentElement.style.background = desk;
          if (document.body) document.body.style.background = desk;
        }}
      }}
      if (data.type === "restoreView") {{
        __ohynaRestore = {{
          page: Number(data.page) || 1,
          top: Number(data.top) || 0,
          left: Number(data.left) || 0,
          bi: Number.isFinite(Number(data.bi)) ? Number(data.bi) : -1,
          offset: Number(data.offset) || 0,
          hint: typeof data.hint === "string" ? data.hint : "",
        }};
        __ohynaRestoreTries = 0;
        scheduleRestoreView();
      }}
      if (data.type === "setScroll") {{
        const scroller = getScroller();
        if (typeof data.left === "number") scroller.scrollLeft = data.left;
        if (typeof data.top === "number") scroller.scrollTop = data.top;
        window.__ohynaCurrentPage = currentPageIndex();
        report();
      }}
      if (data.type === "gotoPage" && typeof data.page === "number") {{
        gotoPage(data.page, data.behavior || "smooth");
      }}
      if (data.type === "pageDelta" && typeof data.delta === "number") {{
        gotoPage(window.__ohynaCurrentPage + data.delta);
      }}
    }});

    const markError = (el, err) => {{
      el.classList.add("diagram-error");
      el.setAttribute("role", "alert");
      if (el.querySelector(".diagram-error-msg")) return;
      const p = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = "Mermaid ダイアグラムの描画に失敗しました";
      p.appendChild(strong);
      el.prepend(p);
      const pre = document.createElement("pre");
      pre.className = "diagram-error-msg";
      const msg = String(err && err.message ? err.message : err).slice(0, 240);
      pre.textContent = msg;
      el.appendChild(pre);
      window.__ohynaDiagramErrors.push(msg);
    }};

    // Mermaid → SVG 後に getBBox で余白を切り落としてから用紙幅へフィット
    __OHYNA_CROP_SVG__

    // PDF の preparePrint と同じ方針: 自然サイズを超えず、本文幅に収める
    const sizeDiagramSvg = (svg, wrap) => {{
      if (!svg || svg.tagName.toLowerCase() !== "svg") return;
      const vb = svg.viewBox && svg.viewBox.baseVal;
      let srcW = vb && vb.width ? vb.width : parseFloat(svg.getAttribute("width") || "0");
      let srcH = vb && vb.height ? vb.height : parseFloat(svg.getAttribute("height") || "0");
      if (!srcW || !srcH) return;
      const parent = (wrap && wrap.parentElement) || svg.parentElement;
      const parentW =
        (parent && (parent.clientWidth || parent.getBoundingClientRect().width)) ||
        A4_W_PX;
      const maxW = Math.max(160, parentW - 8);
      const pageContentPx = PAGE_CONTENT_H_PX;
      const maxH = pageContentPx * 0.88;
      const scale = Math.min(1, maxW / srcW, maxH / srcH);
      const w = Math.max(1, Math.round(srcW * scale));
      const h = Math.max(1, Math.round(srcH * scale));
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));
      svg.style.width = w + "px";
      svg.style.height = h + "px";
      svg.style.maxWidth = "100%";
      if (wrap) {{
        wrap.style.width = "fit-content";
        wrap.style.maxWidth = "100%";
      }}
    }};

    const sizeAllDiagrams = () => {{
      const pageContentPx = PAGE_CONTENT_H_PX;
      document.querySelectorAll(".diagram-wrap").forEach((wrap) => {{
        const svg = wrap.querySelector(":scope > svg");
        if (svg) {{
          cropSvgWhitespace(svg, 2);
          sizeDiagramSvg(svg, wrap);
        }}
        const keep = wrap.closest(".ohyna-keep-next, .ohyna-keep");
        if (keep && keep.getBoundingClientRect().height > pageContentPx * 0.55) {{
          keep.classList.add("is-oversized");
        }}
      }});
    }};

    try {{
      await document.fonts.ready.catch(() => {{}});
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      // 分割前でもアンカー報告できるよう先にスタンプ
      stampBlockAnchors();
      // 数式（KaTeX）— Mermaid より先に描画してレイアウト高さを確定
      try {{
        const {{ default: renderMathInElement }} = await import(cfg.katexAutoRenderMjs);
        renderMathInElement(document.body, {{
          delimiters: cfg.katexDelimiters,
          throwOnError: false,
          strict: "ignore",
          trust: false,
        }});
      }} catch (mathErr) {{
        console.error(mathErr);
      }}
      const mermaid = (await import(cfg.mermaidCdn)).default;
      try {{
        const zenuml = (await import(cfg.zenumlCdn)).default;
        await mermaid.registerExternalDiagrams([zenuml]);
      }} catch (e) {{}}
      mermaid.initialize({{
        startOnLoad: false,
        securityLevel: "loose",
        theme: "base",
        themeVariables: cfg.themeVariables,
        fontFamily: cfg.themeVariables.fontFamily,
        flowchart: {{
          htmlLabels: false,
          useMaxWidth: false,
          curve: "stepAfter",
          padding: 8,
          diagramPadding: 8,
        }},
        sequence: {{ useMaxWidth: false }},
        gantt: {{ useMaxWidth: false }},
      }});
      await document.fonts.ready.catch(() => {{}});
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodes = [...document.querySelectorAll("pre.ohyna-mermaid")];
      for (const node of nodes) {{
        node.dataset.ohynaSrc = node.textContent || "";
      }}
      for (const node of nodes) {{
        const wrap = node.closest(".diagram-client") || node.parentElement || node;
        if (node.getAttribute("data-processed") === "true") continue;
        const src = (node.dataset.ohynaSrc || "").trim();
        if (!src || src.startsWith("#mermaid") || src.startsWith("<svg")) {{
          markError(wrap, "Mermaid ソースが不正です");
          node.setAttribute("data-processed", "true");
          continue;
        }}
        try {{
          node.setAttribute("data-processed", "true");
          const id = "mmd-" + Math.random().toString(36).slice(2);
          const {{ svg }} = await mermaid.render(id, src);
          let sib = node.nextElementSibling;
          while (sib && sib.tagName && sib.tagName.toLowerCase() === "svg") {{
            const doomed = sib;
            sib = sib.nextElementSibling;
            doomed.remove();
          }}
          // SVG 化 → 余白切り落とし → 用紙幅へフィット
          node.insertAdjacentHTML("afterend", svg);
          const svgEl = node.nextElementSibling;
          cropSvgWhitespace(svgEl, 2);
          sizeDiagramSvg(svgEl, wrap);
        }} catch (err) {{
          console.error(err);
          markError(wrap, err);
        }}
      }}
    }} catch (e) {{
      console.error(e);
      document.querySelectorAll(".diagram-client").forEach((el) => {{
        if (!el.querySelector("svg")) markError(el, e);
      }});
    }} finally {{
      try {{
        sizeAllDiagrams();
        paginateA4();
        sizeAllDiagrams();
        // 図サイズ確定後にページ位置を再計算してから復元
        scheduleRestoreView();
      }} catch (err) {{
        console.error(err);
      }}
      window.__diagramsReady = true;
      scheduleRestoreView();
      report();
      postDiagramStatus();
      const ro = new ResizeObserver(() => {{
        report();
        scheduleRestoreView();
      }});
      ro.observe(document.documentElement);
      window.setInterval(report, 500);
      // Mermaid レイアウト遅延用の追加復元
      window.setTimeout(scheduleRestoreView, 200);
      window.setTimeout(scheduleRestoreView, 600);
      window.setTimeout(scheduleRestoreView, 1200);
    }}
  </script>
"""
        client_script = client_script.replace(
            "__OHYNA_CROP_SVG__", CROP_SVG_WHITESPACE_JS, 1
        )
    else:
        from .mermaid_js import CROP_SVG_WHITESPACE_JS as _CROP_JS

        _pw_mm, _ph_mm = look.page_size_mm()
        _mt, _mr, _mb, _ml = look.margins_mm()
        _page_content_h = ((_ph_mm - _mt - _mb) * 96) / 25.4
        client_script = f"""
  <script src="{KATEX_JS}" crossorigin="anonymous"></script>
  <script src="{KATEX_AUTO_RENDER_JS}" crossorigin="anonymous"></script>
  <script>
    __OHYNA_CROP_SVG__
{_LOCK_STATIC_APPEARANCE_JS}
    async function preparePrint() {{
      await document.fonts.ready;
      const pageContentPx = {_page_content_h};

      // 折りたたみは常時展開。開閉・チェック操作は封じる（見た目固定）
      lockStaticAppearance();

      // 数式（KaTeX）
      try {{
        if (typeof renderMathInElement === "function") {{
          renderMathInElement(document.body, {{
            delimiters: [
              {{left: "$$", right: "$$", display: true}},
              {{left: "\\\\[", right: "\\\\]", display: true}},
              {{left: "$", right: "$", display: false}},
              {{left: "\\\\(", right: "\\\\)", display: false}}
            ],
            throwOnError: false,
            strict: "ignore",
            trust: false
          }});
        }}
      }} catch (mathErr) {{
        console.error(mathErr);
      }}

      for (const wrap of document.querySelectorAll(".diagram-wrap")) {{
        const svg = wrap.querySelector("svg");
        if (!svg) continue;
        // 埋め込み SVG も念のため余白切り落とし（サーバ側で済みでも冪等）
        cropSvgWhitespace(svg, 2);
        const vb = svg.viewBox && svg.viewBox.baseVal;
        if (!vb || !vb.width || !vb.height) continue;
        const parent = wrap.parentElement || wrap;
        const parentW = parent.getBoundingClientRect().width || parent.clientWidth || 600;
        const maxW = Math.max(160, parentW - 8);
        // 1ページに収まる高さ上限のみ見る（直前コンテンツ総高さで縮小・強制改ページしない）
        const availH = pageContentPx * 0.88;
        const scale = Math.min(1, maxW / vb.width, availH / vb.height);
        const w = vb.width * scale;
        const h = vb.height * scale;
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.setAttribute("width", String(Math.round(w)));
        svg.setAttribute("height", String(Math.round(h)));
        svg.style.width = Math.round(w) + "px";
        svg.style.height = Math.round(h) + "px";
        svg.style.maxWidth = "100%";

        if (h > pageContentPx * 0.92) {{
          wrap.classList.add("is-oversized");
        }}
        const keep = wrap.closest(".ohyna-keep-next, .ohyna-keep");
        if (keep && keep.getBoundingClientRect().height > pageContentPx * 0.55) {{
          keep.classList.add("is-oversized");
        }}
      }}

      for (const table of document.querySelectorAll("table")) {{
        if (table.getBoundingClientRect().height > pageContentPx * 0.9) {{
          table.classList.add("is-oversized");
        }}
      }}
      for (const list of document.querySelectorAll("ul, ol, dl, details, figure")) {{
        if (list.getBoundingClientRect().height > pageContentPx * 0.9) {{
          list.classList.add("is-oversized");
        }}
      }}
      for (const keep of document.querySelectorAll(".ohyna-keep-next, .ohyna-keep")) {{
        if (keep.getBoundingClientRect().height > pageContentPx * 0.9) {{
          keep.classList.add("is-oversized");
        }}
      }}
      for (const math of document.querySelectorAll(".katex-display, .arithmatex")) {{
        if (math.getBoundingClientRect().height > pageContentPx * 0.9) {{
          math.classList.add("is-oversized");
        }}
      }}

      // 目次: リーダー構造＋ページ番号（用紙高さから近似。プレビューの sheet 分割と揃える）
      const pageBoxPx = {_ph_mm * 96 / 25.4};
      const cover = document.querySelector(".cover");
      const coverH = cover ? cover.getBoundingClientRect().height : 0;
      document.querySelectorAll(".toc a[href^='#']").forEach((a) => {{
        if (!a.querySelector(".toc-text")) {{
          const text = document.createElement("span");
          text.className = "toc-text";
          while (a.firstChild) text.appendChild(a.firstChild);
          const leader = document.createElement("span");
          leader.className = "toc-leader";
          leader.setAttribute("aria-hidden", "true");
          const page = document.createElement("span");
          page.className = "toc-page";
          a.append(text, leader, page);
        }}
        let id = (a.getAttribute("href") || "").slice(1);
        try {{ id = decodeURIComponent(id); }} catch (e) {{}}
        const target = id ? document.getElementById(id) : null;
        const pageEl = a.querySelector(".toc-page");
        if (!target || !pageEl || !pageBoxPx) return;
        const top = target.getBoundingClientRect().top + window.scrollY;
        const contentTop = Math.max(0, top - coverH);
        const n = Math.max(1, Math.floor(contentTop / pageBoxPx) + 1);
        pageEl.textContent = String(n);
      }});

      window.__diagramsReady = true;
    }}
    preparePrint().catch((e) => {{
      console.error(e);
      window.__diagramsReady = true;
    }});
  </script>
""".replace(
            "__OHYNA_CROP_SVG__", _CROP_JS, 1
        )

    # プレビュー机面の明暗: module 読込前でも受け付ける（メインの postMessage 取りこぼし防止）
    desk_scheme_script = ""
    if client_mermaid:
        desk_scheme_script = """
  <script>
    (function () {
      const DESK = { light: "#cfd6de", dark: "#2a3038" };
      const apply = (scheme) => {
        if (scheme !== "dark" && scheme !== "light") return;
        const root = document.documentElement;
        const desk = DESK[scheme];
        root.setAttribute("data-ohyna-color-scheme", scheme);
        root.style.setProperty("--ohyna-desk", desk);
        root.style.background = desk;
        if (document.body) {
          document.body.style.background = desk;
        }
      };
      window.__ohynaApplyColorScheme = apply;
      window.addEventListener("message", (ev) => {
        const data = ev.data;
        if (!data || data.source !== "ohyna-preview-host") return;
        if (data.type === "setColorScheme") apply(data.scheme);
      });
      // 既に html に埋め込み済みなら即反映（body 前でも root は更新）
      apply(document.documentElement.getAttribute("data-ohyna-color-scheme"));
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          apply(document.documentElement.getAttribute("data-ohyna-color-scheme"));
        });
      }
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            { source: "ohyna-preview", type: "requestColorScheme" },
            "*"
          );
        }
      } catch (e) {}
    })();
  </script>
"""

    watermark = look.watermark_html()
    return f"""<!DOCTYPE html>
<html lang="{html_lib.escape(lang)}">
<head>
  <meta charset="utf-8" />
  <title>{html_lib.escape(title)}</title>
  {font_link_tags(look)}
  {katex_head}
  <style>{css}</style>
  {desk_scheme_script}
  {client_script}
</head>
<body>
  {watermark}
  {cover_html}
  {body_sections}
</body>
</html>
"""


def html_to_pdf(
    html: str,
    out_path: Path | None = None,
    *,
    work_dir: Path | None = None,
    allowed_file_roots: Sequence[Path | str] | None = None,
    design: DocumentDesign | None = None,
    doc_title: str = "",
) -> bytes:
    """印刷用 HTML → PDF バイト列（out_path 指定時はファイルにも保存）。

    ネットワークは Google Fonts と data: のみ許可。file: は
    work_dir / allowed_file_roots 配下の実在ファイルに限定する。
    """
    try:
        from .mermaid_js import get_shared_browser
    except ImportError as e:
        raise RuntimeError(
            "PDF 出力には playwright が必要です。"
            " pip install playwright && python -m playwright install chromium"
        ) from e

    out_path = Path(out_path) if out_path else None
    if out_path:
        out_path.parent.mkdir(parents=True, exist_ok=True)

    if work_dir is None:
        tmp = tempfile.TemporaryDirectory(prefix="ohyna-")
        work = Path(tmp.name)
        cleanup = tmp
    else:
        work_dir.mkdir(parents=True, exist_ok=True)
        work = work_dir
        cleanup = None

    roots = [work.resolve()]
    for r in allowed_file_roots or ():
        roots.append(Path(r).resolve())

    try:
        stem = out_path.stem if out_path else "document"
        parent = out_path.parent.name if out_path else "tmp"
        html_path = work / f"{parent}__{stem}.html"
        html_path.write_text(html, encoding="utf-8")
        pdf_target = str(out_path) if out_path else str(work / f"{stem}.pdf")
        html_uri = html_path.resolve().as_uri()

        # Mermaid 描画と同一の Sync Playwright を共有（二重起動禁止）
        browser = get_shared_browser()
        page = browser.new_page()
        try:

            def on_route(route) -> None:
                req_url = route.request.url
                if _playwright_url_allowed(
                    req_url, html_uri=html_uri, allowed_file_roots=roots
                ):
                    route.continue_()
                else:
                    route.abort()

            page.route("**/*", on_route)
            look = design or DocumentDesign()
            vw, vh = look.page_size_px()
            w_mm, h_mm = look.page_size_mm()
            # 用紙 @ 96dpi — mm レイアウトと PDF 紙面の縮尺を一致させる
            page.set_viewport_size({"width": vw, "height": vh})
            page.emulate_media(media="print")
            page.goto(html_uri, wait_until="load")
            page.wait_for_function("window.__diagramsReady === true", timeout=90000)
            try:
                page.wait_for_function(
                    "document.fonts.status === 'loaded'", timeout=60000
                )
            except Exception:
                pass
            page.wait_for_timeout(400)
            hf_on, header_html, footer_html = look.playwright_header_footer(
                title=doc_title or ""
            )
            mt, mr, mb, ml = look.margins_mm()
            # HF あり: 余白は Playwright（CSS @page は 0）。表紙にも HF が付く。
            # HF なし: 余白は CSS @page に委任。
            if hf_on:
                pdf_margin = {
                    "top": f"{mt}mm",
                    "bottom": f"{mb}mm",
                    "left": f"{ml}mm",
                    "right": f"{mr}mm",
                }
            else:
                pdf_margin = {
                    "top": "0",
                    "bottom": "0",
                    "left": "0",
                    "right": "0",
                }
            page.pdf(
                path=pdf_target,
                width=f"{w_mm}mm",
                height=f"{h_mm}mm",
                print_background=True,
                prefer_css_page_size=True,
                margin=pdf_margin,
                display_header_footer=hf_on,
                header_template=header_html if hf_on else "",
                footer_template=footer_html if hf_on else "",
                scale=1,
            )
        finally:
            page.close()

        data = Path(pdf_target).read_bytes()
        if out_path and Path(pdf_target).resolve() != out_path.resolve():
            out_path.write_bytes(data)
        return data
    finally:
        if cleanup is not None:
            cleanup.cleanup()


def markdown_to_preview_html(
    markdown_text: str,
    *,
    title: str | None = None,
    subtitle: str = "",
    part_label: str = "",
    with_cover: bool | None = None,
    diagram_style: str | None = None,
    theme_css: str | Path | None = None,
    markdown_options: MarkdownOptions | None = None,
    meta_lines: list[str] | None = None,
    lang: str = "ja",
) -> str:
    """PDF と同じパイプラインでプレビュー用 HTML を返す（印刷用スクリプト付き）。"""
    resolved = resolve_cover_fields(
        markdown_text,
        title=title,
        subtitle=subtitle or None,
        part_label=part_label or None,
        meta_lines=meta_lines,
        with_cover=with_cover,
        # 明示指定があるときだけ FM の style を上書き（未指定なら FM 優先）
        diagram_style=diagram_style,
        lang=lang,
        default_cover=True,
    )
    cleaned = clean_markdown(resolved.body, options=markdown_options)
    cleaned = resolved.design.ensure_toc_marker(cleaned)
    doc_title = resolved.title or doc_title_from_markdown(cleaned)
    style = resolved.style or diagram_style or "blue"
    body = markdown_to_html_fragment(
        cleaned,
        diagram_style=style,
        defer_diagrams=True,
        design=resolved.design,
    )
    section = f'<section class="content md-single">\n{body}\n</section>'
    cover = ""
    if resolved.cover:
        cover = cover_to_html(
            PdfCover(
                title=doc_title,
                subtitle=resolved.subtitle,
                part_label=resolved.label,
                meta_lines=resolved.design.meta_lines_with_identity(
                    resolved.meta
                ),
            ),
            design=resolved.design,
            style_name=style,
        )
    return wrap_document_html(
        title=doc_title,
        body_sections=section,
        cover_html=cover,
        theme_css=theme_css,
        diagram_style=style,
        design=resolved.design,
        lang=resolved.lang or lang,
        client_mermaid=True,
    )


def markdown_to_pdf(
    markdown_text: str,
    out_path: Path | str | None = None,
    *,
    title: str | None = None,
    subtitle: str = "",
    part_label: str = "",
    with_cover: bool | None = None,
    diagram_style: str | None = None,
    theme_css: str | Path | None = None,
    work_dir: Path | None = None,
    markdown_options: MarkdownOptions | None = None,
    meta_lines: list[str] | None = None,
    lang: str = "ja",
    css_class: str = "content md-single",
    allowed_file_roots: Sequence[Path | str] | None = None,
) -> bytes:
    """Markdown 文字列 → PDF。"""
    resolved = resolve_cover_fields(
        markdown_text,
        title=title,
        subtitle=subtitle or None,
        part_label=part_label or None,
        meta_lines=meta_lines,
        with_cover=with_cover,
        diagram_style=diagram_style,
        lang=lang,
        default_cover=True,
    )
    cleaned = clean_markdown(resolved.body, options=markdown_options)
    cleaned = resolved.design.ensure_toc_marker(cleaned)
    doc_title = resolved.title or doc_title_from_markdown(cleaned)
    style = resolved.style or diagram_style or "blue"
    body = markdown_to_html_fragment(
        cleaned, diagram_style=style, design=resolved.design
    )
    section = f'<section class="{css_class}">\n{body}\n</section>'
    cover = ""
    if resolved.cover:
        cover = cover_to_html(
            PdfCover(
                title=doc_title,
                subtitle=resolved.subtitle,
                part_label=resolved.label,
                meta_lines=resolved.design.meta_lines_with_identity(
                    resolved.meta
                ),
            ),
            design=resolved.design,
            style_name=style,
        )
    html = wrap_document_html(
        title=doc_title,
        body_sections=section,
        cover_html=cover,
        theme_css=theme_css,
        diagram_style=style,
        design=resolved.design,
        lang=resolved.lang or lang,
    )
    return html_to_pdf(
        html,
        Path(out_path) if out_path else None,
        work_dir=work_dir,
        allowed_file_roots=allowed_file_roots,
        design=resolved.design,
        doc_title=doc_title,
    )


def markdown_file_to_pdf(
    path: Path | str,
    out_path: Path | str | None = None,
    *,
    with_cover: bool | None = None,
    diagram_style: str | None = None,
    theme_css: str | Path | None = None,
    work_dir: Path | None = None,
    markdown_options: MarkdownOptions | None = None,
    meta_lines: list[str] | None = None,
    part_label: str = "",
    title: str | None = None,
    subtitle: str | None = None,
    lang: str = "ja",
) -> bytes:
    """単一 Markdown ファイル → PDF（front matter の表紙定義を解釈）。"""
    path = Path(path).resolve()
    raw = resolve_local_media(path.read_text(encoding="utf-8"), path.parent)
    doc = parse_document(raw)
    # 明示 subtitle / FM subtitle が無ければファイル名をサブタイトルに
    resolved_subtitle = subtitle if subtitle not in (None, "") else None
    if resolved_subtitle is None and not doc.subtitle:
        resolved_subtitle = path.name
    if out_path is None:
        out_path = path.with_suffix(".pdf")
    return markdown_to_pdf(
        raw,
        out_path,
        title=title if title not in (None, "") else doc.title,
        subtitle=resolved_subtitle or doc.subtitle or "",
        part_label=part_label or doc.label,
        with_cover=with_cover,
        diagram_style=diagram_style,
        theme_css=theme_css,
        work_dir=work_dir,
        markdown_options=markdown_options,
        meta_lines=meta_lines if meta_lines is not None else (doc.meta or None),
        lang=lang,
        allowed_file_roots=[path.parent],
    )
