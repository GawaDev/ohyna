# -*- coding: utf-8 -*-
"""Mermaid ソース → SVG（公式 Mermaid.js）。"""

from __future__ import annotations

import threading
from collections.abc import Mapping
from typing import Any

from .style import DiagramStyle, extract_init_style

_SVG_CACHE: dict[str, str] = {}
_SVG_CACHE_MAX = 256
_SVG_CACHE_LOCK = threading.Lock()


def render_flowchart_svg(
    mermaid_src: str,
    style: DiagramStyle | Mapping[str, Any] | str | None = None,
    *,
    style_file: str | None = None
) -> str:
    """Mermaid ソースを SVG 文字列へ（公式 Mermaid.js・全図種）。

    style:
      - DiagramStyle
      - dict（themeVariables）
      - プリセット名（blue / default / neutral / dark / forest / red）
      - None（ソース内 %%{init}%% または blue）

    """
    import hashlib
    import json

    from .mermaid_js import render_with_mermaid_js

    src, init_style = extract_init_style(mermaid_src)
    resolved: DiagramStyle
    if style_file:
        resolved = DiagramStyle.from_json_file(style_file)
    elif isinstance(style, DiagramStyle):
        resolved = style
    elif isinstance(style, Mapping):
        resolved = DiagramStyle.from_mapping(style)
    elif isinstance(style, str):
        resolved = DiagramStyle.preset(style)
    elif init_style is not None:
        resolved = init_style
    else:
        resolved = DiagramStyle.preset("blue")

    cache_key = hashlib.sha256(
        (
            src
            + "\0"
            + json.dumps(resolved.to_dict(), sort_keys=True, ensure_ascii=False)
        ).encode("utf-8")
    ).hexdigest()
    with _SVG_CACHE_LOCK:
        cached = _SVG_CACHE.get(cache_key)
    if cached is not None:
        return cached

    svg = render_with_mermaid_js(src, resolved)
    with _SVG_CACHE_LOCK:
        if len(_SVG_CACHE) >= _SVG_CACHE_MAX:
            _SVG_CACHE.pop(next(iter(_SVG_CACHE)))
        _SVG_CACHE[cache_key] = svg
    return svg
