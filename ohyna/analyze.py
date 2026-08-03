# -*- coding: utf-8 -*-
"""Markdown 静的解析（厳格）。

文書設定・Markdown 構造・コードフェンス（Pygments＝シンタックスハイライト）・
Mermaid・KaTeX を検査する。
Mermaid / KaTeX は PDF 生成と同一経路（render_flowchart_svg / KaTeX 設定）で検証する。
フェンス判定は ``fences`` モジュール（入力解読仕様の単一実装）に従う。
"""

from __future__ import annotations

import json
import re
import threading
from dataclasses import asdict, dataclass
from typing import Any, Literal

import yaml

from .design import (
    COVER_PATTERNS,
    DocumentDesign,
    FONT_PRESETS,
    RADIUS_PRESETS,
)
from .engine import render_flowchart_svg
from .fences import (
    ENGINE_FENCE_LANGS,
    MATH_FENCE_LANGS,
    MERMAID_CODE_LANG,
    MERMAID_LANG,
    FenceBlock,
    is_math_fence,
    is_mermaid_code_fence,
    is_mermaid_diagram_fence,
    is_mermaid_fence_mode_error,
    iter_fences,
)
from .frontmatter import OHYNA_KEY, extract_ohyna_config
from .katex_js import KATEX_JS_MJS, KATEX_NET_ALLOW_PREFIX
from .mermaid_js import get_shared_browser, parse_mermaid_source
from .mermaid_lexer import register_mermaid_lexer
from .style import list_presets

Severity = Literal["error", "warning", "info"]


@dataclass
class Diagnostic:
    severity: Severity
    message: str
    line: int | None = None
    category: str = "markdown"
    code: str = ""

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        if d["line"] is None:
            del d["line"]
        if not d["code"]:
            del d["code"]
        return d


# Ohyna Language Registry（参照実装では Pygments へ解決）
_PYGMENTS_ALIASES = {
    "mjs": "javascript",
    "cjs": "javascript",
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "yml": "yaml",
    "htm": "html",
    "sh": "bash",
    "shell": "bash",
    "zsh": "bash",
    "ps1": "powershell",
    "pwsh": "powershell",
    "txt": "text",
    "plain": "text",
    "md": "markdown",
    "cs": "csharp",
    "rb": "ruby",
    "rs": "rust",
    "golang": "go",
    "kt": "kotlin",
    "hpp": "cpp",
    "cc": "cpp",
    "cxx": "cpp",
    "c++": "cpp",
    "h": "c",
    "console": "console",
    "dockerfile": "docker",
    "svg": "xml",
    "patch": "diff",
    "conf": "ini",
    "properties": "ini",
    "pl": "perl",
    "jl": "julia",
    "proto": "protobuf",
    MERMAID_CODE_LANG: MERMAID_CODE_LANG,
}

_STYLE_VALUES = set(list_presets())
_COVER_VALUES = set(COVER_PATTERNS.keys())
_FONT_VALUES = set(FONT_PRESETS.keys())
_RADIUS_VALUES = set(RADIUS_PRESETS.keys())

_ATX_HEADING_RE = re.compile(r"^(#{1,6})(\s*)(.*?)(\s+#+\s*)?$")
_INLINE_MATH_RE = re.compile(
    r"(?<!\\)\$(?!\$)((?:\\.|[^$\n\\])+?)(?<!\\)\$(?!\$)"
)
_BLOCK_MATH_RE = re.compile(r"(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$")
_PAREN_MATH_RE = re.compile(r"\\\((.+?)\\\)", re.S)
_BRACK_MATH_RE = re.compile(r"\\\[(.+?)\\\]", re.S)
_LINK_RE = re.compile(r"(?<!!)\[([^\]]*)\]\(([^)]*)\)")
_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\(([^)]*)\)")
_REF_LINK_RE = re.compile(r"(?<!!)\[([^\]]+)\]\[([^\]]*)\]")
_REF_DEF_RE = re.compile(r"^ {0,3}\[([^\]]+)\]:\s+(\S+)", re.M)


def _line_at(text: str, index: int) -> int:
    return text.count("\n", 0, max(0, index)) + 1


def _strip_bom(text: str) -> str:
    return str(text or "").replace("\ufeff", "")


def _mask_fences(text: str, fences: list[FenceBlock]) -> str:
    """フェンス内部を空白化し、数式抽出時の誤検出を防ぐ。"""
    lines = text.splitlines(keepends=True)
    if not lines:
        return text
    out: list[str] = []
    fence_lines: set[int] = set()
    for f in fences:
        for ln in range(f.line, f.end_line + 1):
            fence_lines.add(ln)
    for i, line in enumerate(lines, start=1):
        if i in fence_lines:
            nl = "\n" if line.endswith("\n") else ""
            out.append((" " * max(0, len(line) - len(nl))) + nl)
        else:
            out.append(line)
    return "".join(out)


# インラインコード（`code` / ``code``）。改行をまたがない。
_INLINE_CODE_RE = re.compile(r"`+(?:[^`\n]+)`+")


def _mask_inline_code(text: str) -> str:
    """インラインコード内の $ などを数式判定から外す。"""
    return _INLINE_CODE_RE.sub(lambda m: " " * len(m.group(0)), text)


def _mask_for_math(text: str, fences: list[FenceBlock]) -> str:
    """フェンス＋インラインコードを空白化したテキスト。"""
    return _mask_inline_code(_mask_fences(text, fences))


def _extract_math(text: str) -> list[tuple[str, int, str]]:
    """(expr, line, kind) を返す。kind は inline/display。"""
    found: list[tuple[str, int, str]] = []
    for m in _BLOCK_MATH_RE.finditer(text):
        expr = m.group(1).strip()
        if expr:
            found.append((expr, _line_at(text, m.start()), "display"))
    for m in _PAREN_MATH_RE.finditer(text):
        expr = m.group(1).strip()
        if expr:
            found.append((expr, _line_at(text, m.start()), "inline"))
    for m in _BRACK_MATH_RE.finditer(text):
        expr = m.group(1).strip()
        if expr:
            found.append((expr, _line_at(text, m.start()), "display"))
    stripped = _BLOCK_MATH_RE.sub(lambda m: " " * len(m.group(0)), text)
    for m in _INLINE_MATH_RE.finditer(stripped):
        expr = m.group(1).strip()
        if expr:
            found.append((expr, _line_at(stripped, m.start()), "inline"))
    return found


def _analyze_frontmatter(text: str) -> list[Diagnostic]:
    out: list[Diagnostic] = []
    src = _strip_bom(text)
    while True:
        m = re.match(r"^\s*<!--[\s\S]*?-->\s*", src)
        if not m:
            break
        src = src[m.end() :]

    fm = re.match(r"^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)", src)
    if not fm:
        out.append(
            Diagnostic(
                "error",
                "ドキュメント設定（ohyna:）がありません",
                1,
                "settings",
                "SETTINGS_MISSING_FM",
            )
        )
        return out

    fm_body = fm.group(1)
    fm_line = 2
    try:
        data = yaml.safe_load(fm_body)
    except yaml.YAMLError as e:
        line = fm_line
        mark = getattr(e, "problem_mark", None)
        if mark is not None and getattr(mark, "line", None) is not None:
            line = fm_line + int(mark.line)
        out.append(
            Diagnostic(
                "error",
                f"YAML の構文エラー: {getattr(e, 'problem', None) or e}",
                line,
                "yaml",
                "YAML_SYNTAX",
            )
        )
        return out

    if not isinstance(data, dict):
        out.append(
            Diagnostic(
                "error",
                "front matter はオブジェクトである必要があります",
                fm_line,
                "yaml",
                "YAML_NOT_OBJECT",
            )
        )
        return out

    has_ns = isinstance(data.get(OHYNA_KEY), dict)
    if not has_ns:
        out.append(
            Diagnostic(
                "error",
                "ohyna: ブロックがありません",
                fm_line,
                "settings",
                "SETTINGS_MISSING_NS",
            )
        )
        return out

    try:
        cfg = extract_ohyna_config(data)
    except ValueError as e:
        out.append(
            Diagnostic("error", str(e), fm_line, "settings", "SETTINGS_REJECTED_KEY")
        )
        return out
    title = str(cfg.get("title") or "").strip()
    if not title:
        out.append(
            Diagnostic(
                "error", "タイトルは必須です", fm_line, "settings", "SETTINGS_TITLE"
            )
        )

    style = str(cfg.get("style") or "").strip()
    if not style:
        out.append(
            Diagnostic(
                "error", "色テーマは必須です", fm_line, "settings", "SETTINGS_STYLE"
            )
        )
    elif style not in _STYLE_VALUES:
        out.append(
            Diagnostic(
                "error",
                f"未知の色テーマです: {style}",
                fm_line,
                "settings",
                "SETTINGS_STYLE_UNKNOWN",
            )
        )

    font = str(cfg.get("font") or "").strip().lower()
    font_family = str(cfg.get("fontFamily") or "").strip()
    if not font and not font_family:
        out.append(
            Diagnostic(
                "error", "フォントは必須です", fm_line, "settings", "SETTINGS_FONT"
            )
        )
    elif font and font not in _FONT_VALUES and not font_family:
        out.append(
            Diagnostic(
                "error",
                f"未知のフォントです: {font}",
                fm_line,
                "settings",
                "SETTINGS_FONT_UNKNOWN",
            )
        )

    lang = str(cfg.get("lang") or "").strip()
    if not lang:
        out.append(
            Diagnostic(
                "error", "言語は必須です", fm_line, "settings", "SETTINGS_LANG"
            )
        )

    if "radius" in cfg:
        radius = str(cfg.get("radius") or "").strip().lower()
        if radius and radius not in _RADIUS_VALUES:
            out.append(
                Diagnostic(
                    "error",
                    f"未知の角丸サイズです: {radius}",
                    fm_line,
                    "settings",
                    "SETTINGS_RADIUS_UNKNOWN",
                )
            )

    if "coverPattern" in cfg:
        pat = str(cfg.get("coverPattern") or "").strip()
        if pat and pat not in _COVER_VALUES:
            out.append(
                Diagnostic(
                    "error",
                    f"未知の表紙デザインです: {pat}",
                    fm_line,
                    "settings",
                    "SETTINGS_COVER_UNKNOWN",
                )
            )

    try:
        DocumentDesign.from_mapping(cfg)
    except ValueError as e:
        out.append(
            Diagnostic(
                "error",
                str(e),
                fm_line,
                "settings",
                "SETTINGS_DESIGN_INVALID",
            )
        )

    return out


def _pygments_lang_ok(lang: str) -> bool:
    """Ohyna Language Registry に載る言語か（参照実装: Pygments）。"""
    from pygments.lexers import get_lexer_by_name
    from pygments.util import ClassNotFound

    register_mermaid_lexer()
    key = _PYGMENTS_ALIASES.get(lang, lang)
    try:
        get_lexer_by_name(key)
        return True
    except ClassNotFound:
        return False


def _analyze_markdown_structure(text: str, fences: list[FenceBlock]) -> list[Diagnostic]:
    out: list[Diagnostic] = []
    lines = text.splitlines()

    for f in fences:
        if is_mermaid_fence_mode_error(f):
            out.append(
                Diagnostic(
                    "error",
                    "mermaid フェンスで指定できる追加トークンは code のみです",
                    f.line,
                    "mermaid",
                    "MERMAID_FENCE_MODE",
                )
            )
            continue
        if f.lang == MERMAID_LANG and f.marker != "`":
            out.append(
                Diagnostic(
                    "error",
                    "Mermaid ダイアグラムフェンスは ```mermaid（backtick・言語トークンのみ）である必要があります",
                    f.line,
                    "mermaid",
                    "MERMAID_FENCE_FORM",
                )
            )
            continue
        if f.lang in MATH_FENCE_LANGS and not is_math_fence(f):
            out.append(
                Diagnostic(
                    "error",
                    "数式フェンスは ```math 等（backtick・言語トークンのみ）である必要があります",
                    f.line,
                    "katex",
                    "MATH_FENCE_FORM",
                )
            )
            continue

        # 図・数式・mermaid code は Language Registry の通常解決対象外（専用経路）
        if is_mermaid_diagram_fence(f) or is_math_fence(f):
            pass
        elif is_mermaid_code_fence(f):
            if not _pygments_lang_ok(MERMAID_CODE_LANG):
                out.append(
                    Diagnostic(
                        "error",
                        "シンタックスハイライト未対応の言語です: mermaid code",
                        f.line,
                        "syntax",
                        "LANG_UNKNOWN",
                    )
                )
        elif (
            f.lang
            and f.lang not in ENGINE_FENCE_LANGS
            and not _pygments_lang_ok(f.lang)
        ):
            out.append(
                Diagnostic(
                    "error",
                    f"シンタックスハイライト未対応の言語です: {f.lang}",
                    f.line,
                    "syntax",
                    "LANG_UNKNOWN",
                )
            )
        if f.lang in {"json"}:
            try:
                json.loads(f.body) if f.body.strip() else None
                if not f.body.strip():
                    out.append(
                        Diagnostic(
                            "error",
                            "JSON フェンスが空です",
                            f.line,
                            "syntax",
                            "JSON_EMPTY",
                        )
                    )
            except json.JSONDecodeError as e:
                out.append(
                    Diagnostic(
                        "error",
                        f"JSON の構文エラー: {e.msg}",
                        f.line + (e.lineno or 1),
                        "syntax",
                        "JSON_SYNTAX",
                    )
                )
        if f.lang in {"yaml", "yml"}:
            try:
                if f.body.strip():
                    yaml.safe_load(f.body)
                else:
                    out.append(
                        Diagnostic(
                            "error",
                            "YAML フェンスが空です",
                            f.line,
                            "syntax",
                            "YAML_FENCE_EMPTY",
                        )
                    )
            except yaml.YAMLError as e:
                line = f.line
                mark = getattr(e, "problem_mark", None)
                if mark is not None and getattr(mark, "line", None) is not None:
                    line = f.line + 1 + int(mark.line)
                out.append(
                    Diagnostic(
                        "error",
                        f"YAML の構文エラー: {getattr(e, 'problem', None) or e}",
                        line,
                        "syntax",
                        "YAML_FENCE_SYNTAX",
                    )
                )
        if is_mermaid_diagram_fence(f) and not f.body.strip():
            out.append(
                Diagnostic(
                    "error",
                    "Mermaid フェンスが空です",
                    f.line,
                    "mermaid",
                    "MERMAID_EMPTY",
                )
            )
        if is_mermaid_code_fence(f) and not f.body.strip():
            out.append(
                Diagnostic(
                    "error",
                    "Mermaid コードフェンスが空です",
                    f.line,
                    "mermaid",
                    "MERMAID_CODE_EMPTY",
                )
            )
        if is_math_fence(f) and not f.body.strip():
            out.append(
                Diagnostic(
                    "error", "数式フェンスが空です", f.line, "katex", "MATH_EMPTY"
                )
            )

    for i, line in enumerate(lines, start=1):
        if i in {ln for f in fences for ln in range(f.line, f.end_line + 1)}:
            continue
        m = _ATX_HEADING_RE.match(line)
        if not m:
            continue
        if not m.group(2):
            out.append(
                Diagnostic(
                    "error",
                    "見出しの # の後に空白が必要です",
                    i,
                    "markdown",
                    "HEADING_SPACE",
                )
            )
        title = (m.group(3) or "").strip()
        if not title:
            out.append(
                Diagnostic("error", "空の見出しです", i, "markdown", "HEADING_EMPTY")
            )

    masked = _mask_for_math(text, fences)
    if masked.count("$$") % 2 != 0:
        idx = masked.rfind("$$")
        out.append(
            Diagnostic(
                "error",
                "ディスプレイ数式 $$ が閉じられていません",
                _line_at(masked, idx) if idx >= 0 else 1,
                "katex",
                "KATEX_DOLLAR_BLOCK",
            )
        )

    dollars = 0
    i = 0
    while i < len(masked):
        if masked.startswith("$$", i):
            i += 2
            continue
        ch = masked[i]
        if ch == "\\" and i + 1 < len(masked):
            i += 2
            continue
        if ch == "$":
            dollars += 1
        i += 1
    if dollars % 2 != 0:
        out.append(
            Diagnostic(
                "error",
                "インライン数式 $ が閉じられていません",
                1,
                "katex",
                "KATEX_DOLLAR_INLINE",
            )
        )

    if masked.count("\\(") != masked.count("\\)"):
        out.append(
            Diagnostic(
                "error",
                "数式 \\( ... \\) の対応が取れていません",
                1,
                "katex",
                "KATEX_PAREN",
            )
        )
    if masked.count("\\[") != masked.count("\\]"):
        out.append(
            Diagnostic(
                "error",
                "数式 \\[ ... \\] の対応が取れていません",
                1,
                "katex",
                "KATEX_BRACKET",
            )
        )

    for m in _LINK_RE.finditer(masked):
        href = (m.group(2) or "").strip()
        if not href or href == "#":
            out.append(
                Diagnostic(
                    "error",
                    f"リンク先が空です: [{m.group(1)}]",
                    _line_at(masked, m.start()),
                    "markdown",
                    "LINK_EMPTY",
                )
            )
    for m in _IMAGE_RE.finditer(masked):
        href = (m.group(2) or "").strip()
        if not href:
            out.append(
                Diagnostic(
                    "error",
                    f"画像パスが空です: ![{m.group(1)}]",
                    _line_at(masked, m.start()),
                    "markdown",
                    "IMAGE_EMPTY",
                )
            )

    defs = {m.group(1).lower() for m in _REF_DEF_RE.finditer(masked)}
    for m in _REF_LINK_RE.finditer(masked):
        key = (m.group(2) or m.group(1)).lower()
        if key not in defs:
            out.append(
                Diagnostic(
                    "error",
                    f"未定義の参照リンクです: [{m.group(1)}][{m.group(2)}]",
                    _line_at(masked, m.start()),
                    "markdown",
                    "LINK_REF_UNDEF",
                )
            )

    return out


def _document_diagram_style(text: str) -> str:
    """front matter の色テーマ。PDF と同じ style で描画検証し SVG キャッシュを効かせる。"""
    try:
        fm = re.match(r"\A---\s*\n(.*?)\n---\s*\n?", text, flags=re.S)
        if not fm:
            return "blue"
        data = yaml.safe_load(fm.group(1)) or {}
        if not isinstance(data, dict):
            return "blue"
        cfg = extract_ohyna_config(data)
        style = str(cfg.get("style") or "").strip()
        if style and style in _STYLE_VALUES:
            return style
    except Exception:  # noqa: BLE001
        pass
    return "blue"


def _validate_mermaid(
    mermaid_blocks: list[FenceBlock],
    *,
    style: str = "blue",
    code: str = "MERMAID_RENDER",
) -> list[Diagnostic]:
    """PDF 生成と同じ ``render_flowchart_svg`` で Mermaid を検証する。"""
    out: list[Diagnostic] = []
    for f in mermaid_blocks:
        if not f.body.strip():
            continue
        try:
            render_flowchart_svg(f.body, style=style)
        except Exception as e:  # noqa: BLE001
            msg = str(e).splitlines()[0][:240] or e.__class__.__name__
            out.append(
                Diagnostic(
                    "error",
                    f"Mermaid 構文エラー: {msg}",
                    f.line,
                    "mermaid",
                    code,
                )
            )
    return out


def _validate_mermaid_code(mermaid_code_blocks: list[FenceBlock]) -> list[Diagnostic]:
    """``mermaid code`` は構文のみ（SVG 生成なし）。"""
    out: list[Diagnostic] = []
    for f in mermaid_code_blocks:
        if not f.body.strip():
            continue
        try:
            parse_mermaid_source(f.body)
        except Exception as e:  # noqa: BLE001
            msg = str(e).splitlines()[0][:240] or e.__class__.__name__
            out.append(
                Diagnostic(
                    "error",
                    f"Mermaid 構文エラー: {msg}",
                    f.line,
                    "mermaid",
                    "MERMAID_CODE_SYNTAX",
                )
            )
    return out


_KATEX_ORIGIN = "http://ohyna-analyze.local"
_katex_page_local = threading.local()

_KATEX_SHELL_HTML = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head><body>
<script type="module">
const KATEX_MJS = {json.dumps(KATEX_JS_MJS)};
let katexMod = null;
async function ensureKatex() {{
  if (katexMod) return katexMod;
  katexMod = (await import(KATEX_MJS)).default;
  return katexMod;
}}
window.__validateKatex = async (jobs) => {{
  const results = [];
  try {{
    const katex = await ensureKatex();
    for (const job of jobs) {{
      try {{
        const out = katex.renderToString(job.source, {{
          throwOnError: false,
          displayMode: !!job.displayMode,
          strict: "ignore",
          trust: false,
        }});
        const bad = typeof out === "string" && out.includes("katex-error");
        if (bad) {{
          results.push({{
            id: job.id,
            ok: false,
            line: job.line,
            error: "KaTeX が数式を解釈できませんでした",
          }});
        }} else {{
          results.push({{ id: job.id, ok: true, line: job.line }});
        }}
      }} catch (e) {{
        const msg = (e && e.message) ? e.message : String(e);
        results.push({{
          id: job.id,
          ok: false,
          line: job.line,
          error: String(msg).split("\\n")[0].slice(0, 240),
        }});
      }}
    }}
    return {{ ok: true, results }};
  }} catch (e) {{
    return {{ ok: false, error: String(e && e.message ? e.message : e) }};
  }}
}};
window.__boot = true;
</script>
</body></html>
"""


def _get_katex_worker_page():
    page = getattr(_katex_page_local, "page", None)
    if page is not None and not page.is_closed():
        return page
    browser = get_shared_browser()
    page = browser.new_page()
    allow = (
        "https://cdn.jsdelivr.net/",
        "https://fastly.jsdelivr.net/",
        "https://gcore.jsdelivr.net/",
        KATEX_NET_ALLOW_PREFIX,
    )

    def on_route(route) -> None:
        url = route.request.url
        if url.startswith(f"{_KATEX_ORIGIN}/"):
            route.fulfill(
                status=200,
                content_type="text/html; charset=utf-8",
                body=_KATEX_SHELL_HTML,
            )
            return
        if any(url.startswith(p) for p in allow):
            route.continue_()
            return
        route.abort()

    page.route("**/*", on_route)
    page.goto(f"{_KATEX_ORIGIN}/analyze-katex", wait_until="load")
    page.wait_for_function("window.__boot === true", timeout=180000)
    _katex_page_local.page = page
    return page


def _validate_katex(math_exprs: list[tuple[str, int, str]]) -> list[Diagnostic]:
    """PDF と同じ KaTeX オプションで数式を検証する（katex-error をエラー扱い）。"""
    if not math_exprs:
        return []

    jobs = [
        {
            "id": f"k{i}",
            "source": expr,
            "line": line,
            "displayMode": display == "display",
        }
        for i, (expr, line, display) in enumerate(math_exprs)
    ]
    out: list[Diagnostic] = []
    page = _get_katex_worker_page()
    result = page.evaluate("(jobs) => window.__validateKatex(jobs)", jobs)
    if not isinstance(result, dict) or not result.get("ok"):
        err = (result or {}).get("error") if isinstance(result, dict) else result
        out.append(
            Diagnostic(
                "error",
                f"KaTeX 検証の起動に失敗: {err}",
                1,
                "engine",
                "KATEX_BOOT",
            )
        )
        return out
    for r in result.get("results") or []:
        if r.get("ok"):
            continue
        out.append(
            Diagnostic(
                "error",
                f"KaTeX 構文エラー: {r.get('error') or 'unknown'}",
                r.get("line"),
                "katex",
                "KATEX_RENDER",
            )
        )
    return out


def _validate_engines(
    mermaid_blocks: list[FenceBlock],
    mermaid_code_blocks: list[FenceBlock],
    math_exprs: list[tuple[str, int, str]],
    *,
    diagram_style: str = "blue",
) -> list[Diagnostic]:
    out: list[Diagnostic] = []
    out.extend(
        _validate_mermaid(
            mermaid_blocks, style=diagram_style, code="MERMAID_RENDER"
        )
    )
    out.extend(_validate_mermaid_code(mermaid_code_blocks))
    out.extend(_validate_katex(math_exprs))
    return out


def analyze_markdown(markdown: str) -> list[dict[str, Any]]:
    """Markdown を厳格に静的解析し、診断の dict リストを返す。"""
    text = _strip_bom(markdown)
    diags: list[Diagnostic] = []

    if not text.strip():
        return [
            Diagnostic(
                "error", "ドキュメントが空です", 1, "markdown", "DOC_EMPTY"
            ).to_dict()
        ]

    diags.extend(_analyze_frontmatter(text))

    fences, fence_errors = iter_fences(text)
    for line, msg in fence_errors:
        diags.append(
            Diagnostic("error", msg, line, "markdown", "FENCE_UNCLOSED")
        )
    diags.extend(_analyze_markdown_structure(text, fences))

    mermaid_blocks = [f for f in fences if is_mermaid_diagram_fence(f)]
    mermaid_code_blocks = [f for f in fences if is_mermaid_code_fence(f)]
    math_fence_exprs = [
        (f.body.strip(), f.line, "display")
        for f in fences
        if is_math_fence(f) and f.body.strip()
    ]
    masked = _mask_for_math(text, fences)
    inline_math = _extract_math(masked)
    all_math = math_fence_exprs + inline_math

    try:
        diagram_style = _document_diagram_style(text)
        diags.extend(
            _validate_engines(
                mermaid_blocks,
                mermaid_code_blocks,
                all_math,
                diagram_style=diagram_style,
            )
        )
    except Exception as e:  # noqa: BLE001
        diags.append(
            Diagnostic(
                "error",
                f"Mermaid/KaTeX 検証に失敗: {e}",
                1,
                "engine",
                "ENGINE_FAIL",
            )
        )

    seen: set[tuple[Any, ...]] = set()
    unique: list[Diagnostic] = []
    for d in diags:
        key = (d.severity, d.message, d.line, d.category, d.code)
        if key in seen:
            continue
        seen.add(key)
        unique.append(d)

    severity_order = {"error": 0, "warning": 1, "info": 2}
    unique.sort(
        key=lambda d: (severity_order.get(d.severity, 9), d.line or 0, d.message)
    )
    return [d.to_dict() for d in unique]
