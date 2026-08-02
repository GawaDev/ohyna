# -*- coding: utf-8 -*-
"""Mermaid.js（公式）バックエンド。

Mermaid がサポートする図種を公式レンダラで SVG 化する（唯一の描画経路）。
Playwright ブラウザはスレッドごとに再利用し、起動コストを抑える。

参考:
- https://mermaid.ai/open-source/intro/
- https://github.com/mermaid-js/mermaid
- https://docs.min87.com/ja/mermaid/intro/
"""

from __future__ import annotations

import atexit
import json
import re
import threading
from typing import Any

from .style import DiagramStyle

# Mermaid 11 系列（図種追加に追従）。再現性が要る場合は 11.x.y にピン留め可。
MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs"
ELK_CDN = "https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@0/dist/mermaid-layout-elk.esm.min.mjs"
ZENUML_CDN = (
    "https://cdn.jsdelivr.net/npm/@mermaid-js/mermaid-zenuml@0/"
    "dist/mermaid-zenuml.esm.min.mjs"
)

# SVG 化後に getBBox で余白を切り詰める（プレビュー／PDF 共通ロジック）
# pad は描画欠け防止の最小余白（px）。大きめの Mermaid 既定余白はここで落とす。
CROP_SVG_WHITESPACE_JS = r"""
function cropSvgWhitespace(svg, pad) {
  pad = pad == null ? 2 : Number(pad);
  if (!svg || String(svg.tagName || "").toLowerCase() !== "svg") return false;
  try {
    const bb = svg.getBBox();
    if (!bb || !(bb.width > 0) || !(bb.height > 0)) return false;
    const x = bb.x - pad;
    const y = bb.y - pad;
    const w = bb.width + pad * 2;
    const h = bb.height + pad * 2;
    svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    svg.setAttribute("width", String(Math.ceil(w)));
    svg.setAttribute("height", String(Math.ceil(h)));
    if (!svg.getAttribute("preserveAspectRatio")) {
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }
    svg.style.removeProperty("max-width");
    svg.style.removeProperty("max-height");
    return true;
  } catch (e) {
    return false;
  }
}
"""

# 先頭ディレクティブ（コメント・init を除く）で図種を判定
_DIAGRAM_KIND_RE = re.compile(
    r"^(?:"
    r"flowchart|graph|"
    r"sequenceDiagram|"
    r"classDiagram|"
    r"stateDiagram-v2|stateDiagram|"
    r"erDiagram|"
    r"journey|"
    r"gantt|"
    r"pie|"
    r"quadrantChart|"
    r"requirementDiagram|"
    r"gitGraph|"
    r"C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|"
    r"mindmap|"
    r"timeline|"
    r"zenuml|"
    r"sankey(?:-beta)?|"
    r"xychart(?:-beta)?|"
    r"block(?:-beta)?|"
    r"packet(?:-beta)?|"
    r"kanban|"
    r"architecture(?:-beta)?|"
    r"radar(?:-beta)?|"
    r"event(?:-)?[Mm]odeling|"
    r"treemap(?:-beta)?|"
    r"venn|"
    r"ishikawa|"
    r"wardley|"
    r"cynefin|"
    r"treeview"
    r")\b",
    re.I,
)

_thread_local = threading.local()
_all_playwright: list[Any] = []
_all_lock = threading.Lock()


def _normalize_source(src: str) -> str:
    src = src.strip()
    src = re.sub(r"^---\s*\n.*?\n---\s*\n", "", src, flags=re.S)
    return src.strip()


def detect_diagram_kind(mermaid_src: str) -> str:
    """ソース先頭の図種別キーワードを返す（不明時は 'unknown'）。"""
    src = _normalize_source(mermaid_src)
    for raw in src.splitlines():
        line = raw.strip()
        if not line or line.startswith("%%"):
            continue
        m = _DIAGRAM_KIND_RE.match(line)
        if m:
            return m.group(0)
        m = _DIAGRAM_KIND_RE.search(line)
        if m:
            return m.group(0)
        break
    return "unknown"


def style_to_theme_variables(style: DiagramStyle) -> dict[str, Any]:
    return {
        "darkMode": False,
        "background": style.background,
        "fontFamily": style.fontFamily,
        "fontSize": style.fontSize if isinstance(style.fontSize, str) else f"{style.font_px}px",
        "primaryColor": style.primaryColor,
        "primaryTextColor": style.primaryTextColor,
        "primaryBorderColor": style.primaryBorderColor,
        "secondaryColor": style.secondaryColor,
        "tertiaryColor": style.secondaryColor,
        "lineColor": style.lineColor,
        "textColor": style.textColor,
        "mainBkg": style.mainBkg,
        "nodeBorder": style.nodeBorder,
        "nodeTextColor": style.nodeTextColor,
        "clusterBkg": style.clusterBkg,
        "clusterBorder": style.clusterBorder,
        "titleColor": style.titleColor,
        "edgeLabelBackground": style.edgeLabelBackground,
        "defaultLinkColor": style.defaultLinkColor,
    }


def _stop_thread_playwright() -> None:
    """スレッドローカルの Playwright を破棄する（失敗時の残留ループ対策）。"""
    pw = getattr(_thread_local, "pw", None)
    _thread_local.browser = None
    _thread_local.pw = None
    if pw is None:
        return
    with _all_lock:
        try:
            _all_playwright.remove(pw)
        except ValueError:
            pass
    try:
        pw.stop()
    except Exception:
        pass


def _get_thread_browser():
    """スレッドローカルな Chromium を返す（起動コストを償却）。"""
    browser = getattr(_thread_local, "browser", None)
    if browser is not None and browser.is_connected():
        return browser
    # 切断済み／前回 launch 失敗の残骸があると Sync API が
    # 「inside the asyncio loop」で再 start できない。
    _stop_thread_playwright()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise RuntimeError(
            "Mermaid.js バックエンドには playwright が必要です。"
            " pip install playwright && python -m playwright install chromium"
        ) from e

    pw = sync_playwright().start()
    try:
        browser = pw.chromium.launch()
    except Exception:
        try:
            pw.stop()
        except Exception:
            pass
        raise
    _thread_local.pw = pw
    _thread_local.browser = browser
    with _all_lock:
        _all_playwright.append(pw)
    return browser


def get_shared_browser():
    """PDF 生成などと共有するスレッドローカル Chromium。

    sync_playwright() を二重に nest すると
    「Sync API inside the asyncio loop」になるため、起動はここ一本化する。
    """
    return _get_thread_browser()


def _shutdown_playwright() -> None:
    with _all_lock:
        items = list(_all_playwright)
        _all_playwright.clear()
    for pw in items:
        try:
            pw.stop()
        except Exception:
            pass


atexit.register(_shutdown_playwright)


def render_with_mermaid_js(
    mermaid_src: str,
    style: DiagramStyle,
    *,
    use_elk: bool = False,
    curve: str = "stepAfter",
    node_spacing: int = 48,
    rank_spacing: int = 56,
    padding: int = 8,
) -> str:
    """Playwright + Mermaid.js で SVG を生成し、余白を切り詰めて返す（全図種）。"""
    source = _normalize_source(mermaid_src)
    kind = detect_diagram_kind(source)
    is_flow = kind.lower() in ("flowchart", "graph")
    theme_vars = style_to_theme_variables(style)
    payload = {
        "source": source,
        "kind": kind,
        "isFlowchart": is_flow,
        "themeVariables": theme_vars,
        "useElk": bool(use_elk and is_flow),
        "curve": curve,
        "mermaidCdn": MERMAID_CDN,
        "elkCdn": ELK_CDN,
        "zenumlCdn": ZENUML_CDN,
        "nodeSpacing": node_spacing,
        "rankSpacing": rank_spacing,
        "padding": padding,
        "fontPx": style.font_px,
    }

    html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <style>
    html, body {{ margin: 0; padding: 0; background: {style.background}; }}
    #out {{ display: inline-block; }}
    #out svg {{ max-width: none !important; height: auto !important; }}
  </style>
</head>
<body>
  <div id="out"></div>
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
    const cfg = {json.dumps(payload, ensure_ascii=False)};
    const out = document.getElementById("out");

    function baseInit(layout) {{
      return {{
        startOnLoad: false,
        securityLevel: "loose",
        theme: "base",
        themeVariables: cfg.themeVariables,
        fontFamily: cfg.themeVariables.fontFamily,
        flowchart: {{
          htmlLabels: false,
          curve: cfg.curve,
          padding: cfg.padding,
          nodeSpacing: cfg.nodeSpacing,
          rankSpacing: cfg.rankSpacing,
          diagramPadding: cfg.padding,
          useMaxWidth: false,
        }},
        sequence: {{ useMaxWidth: false }},
        gantt: {{ useMaxWidth: false }},
        journey: {{ useMaxWidth: false }},
        class: {{ useMaxWidth: false }},
        state: {{ useMaxWidth: false }},
        er: {{ useMaxWidth: false }},
        pie: {{ useMaxWidth: false }},
        ...(layout ? {{ layout }} : {{}}),
      }};
    }}

    try {{
      const mermaid = (await import(cfg.mermaidCdn)).default;
      try {{
        const zenuml = (await import(cfg.zenumlCdn)).default;
        await mermaid.registerExternalDiagrams([zenuml]);
      }} catch (e) {{
        // ZenUML 未使用時は無視
      }}
      if (cfg.useElk) {{
        try {{
          const elk = await import(cfg.elkCdn);
          mermaid.registerLayoutLoaders(elk);
          mermaid.initialize(baseInit("elk"));
        }} catch (e) {{
          mermaid.initialize(baseInit());
        }}
      }} else {{
        mermaid.initialize(baseInit());
      }}
      const id = "mmd-" + Math.random().toString(36).slice(2);
      const {{ svg }} = await mermaid.render(id, cfg.source);
      out.innerHTML = svg;
      const root = out.querySelector("svg");
      if (root && cfg.isFlowchart) {{
        const line = cfg.themeVariables.lineColor || "#1565c0";
        const border = cfg.themeVariables.nodeBorder || line;
        root.querySelectorAll("marker path, defs marker path").forEach((el) => {{
          el.setAttribute("fill", line);
          el.setAttribute("stroke", line);
        }});
        root.querySelectorAll(".node rect, .node circle, .node polygon, .cluster rect").forEach((el) => {{
          if (el.getAttribute("stroke")) el.setAttribute("stroke", border);
        }});
      }}
      window.__ok = true;
      window.__error = null;
    }} catch (e) {{
      window.__ok = false;
      window.__error = String(e && e.stack ? e.stack : e);
      out.textContent = window.__error;
    }}
  </script>
</body>
</html>
"""

    browser = _get_thread_browser()
    page = browser.new_page()
    try:
        origin = "http://mermaid.local"
        cdn_allow = (
            "https://cdn.jsdelivr.net/",
            "https://fastly.jsdelivr.net/",
            "https://gcore.jsdelivr.net/",
        )

        def on_route(route) -> None:
            url = route.request.url
            if url.startswith(f"{origin}/"):
                route.fulfill(
                    status=200,
                    content_type="text/html; charset=utf-8",
                    body=html,
                )
                return
            if any(url.startswith(p) for p in cdn_allow):
                route.continue_()
                return
            route.abort()

        page.route("**/*", on_route)
        page.goto(f"{origin}/render", wait_until="load")
        page.wait_for_function(
            "window.__ok === true || window.__ok === false", timeout=120000
        )
        ok = page.evaluate("window.__ok")
        if not ok:
            err = page.evaluate("window.__error")
            raise RuntimeError(f"Mermaid render failed ({kind}): {err}")
        svg = page.evaluate(
            "() => {\n"
            + CROP_SVG_WHITESPACE_JS
            + """
              const svg = document.querySelector('#out svg');
              if (!svg) return null;
              cropSvgWhitespace(svg, 2);
              svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
              return svg.outerHTML;
            }
            """
        )
    finally:
        page.close()

    if not svg:
        raise RuntimeError(f"Mermaid render produced no SVG ({kind})")
    return svg
