# -*- coding: utf-8 -*-
"""静的解析結果の短命プロセス内キャッシュ。

GUI の /analyze → /preview|/pdf 連打で同じ Markdown を二重解析しない。
"""

from __future__ import annotations

import hashlib
import threading
import time
from typing import Any

_LOCK = threading.Lock()
_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_CACHE_MAX = 64
_TTL_SEC = 60.0


def _key(markdown: str) -> str:
    return hashlib.sha256(markdown.encode("utf-8")).hexdigest()


def get_cached_diagnostics(markdown: str) -> list[dict[str, Any]] | None:
    key = _key(markdown)
    now = time.monotonic()
    with _LOCK:
        hit = _CACHE.get(key)
        if hit is None:
            return None
        ts, diags = hit
        if now - ts > _TTL_SEC:
            _CACHE.pop(key, None)
            return None
        # 参照を動かして簡易 LRU
        _CACHE.pop(key)
        _CACHE[key] = (ts, diags)
        # 呼び出し側が破壊してもキャッシュを汚さない
        return [dict(d) for d in diags]


def store_diagnostics(markdown: str, diagnostics: list[dict[str, Any]]) -> None:
    key = _key(markdown)
    now = time.monotonic()
    with _LOCK:
        _CACHE[key] = (now, [dict(d) for d in diagnostics])
        while len(_CACHE) > _CACHE_MAX:
            _CACHE.pop(next(iter(_CACHE)))


def analyze_markdown_cached(markdown: str) -> list[dict[str, Any]]:
    """キャッシュがあれば返し、なければ analyze_markdown して格納する。"""
    cached = get_cached_diagnostics(markdown)
    if cached is not None:
        return cached
    from .analyze import analyze_markdown

    diags = analyze_markdown(markdown)
    store_diagnostics(markdown, diags)
    return [dict(d) for d in diags]
