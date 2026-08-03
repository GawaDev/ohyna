# -*- coding: utf-8 -*-
"""表紙背景アセット（themes/covers/{style}/{pattern}.webp）。"""

from __future__ import annotations

import base64
import re
from functools import lru_cache
from pathlib import Path

_PACKAGE_DIR = Path(__file__).resolve().parent
_SERVICE_ROOT = _PACKAGE_DIR.parent
COVERS_DIR = _SERVICE_ROOT / "themes" / "covers"
COVER_IMAGE_EXT = ".webp"


def cover_background_path(style_name: str, pattern: str) -> Path:
    style = (style_name or "blue").strip().lower() or "blue"
    pat = (pattern or "noise").strip().lower() or "noise"
    safe_style = re.sub(r"[^a-z0-9_-]+", "", style)
    safe_pat = re.sub(r"[^a-z0-9_-]+", "", pat)
    return COVERS_DIR / safe_style / f"{safe_pat}{COVER_IMAGE_EXT}"


@lru_cache(maxsize=64)
def cover_background_data_uri(style_name: str, pattern: str) -> str | None:
    """画像があれば data URI。無ければ None（単色フォールバック）。"""
    path = cover_background_path(style_name, pattern)
    candidates = [path, path.with_suffix(".png")]
    for cand in candidates:
        if not cand.is_file():
            continue
        raw = cand.read_bytes()
        if not raw:
            continue
        mime = "image/webp" if cand.suffix.lower() == ".webp" else "image/png"
        b64 = base64.standard_b64encode(raw).decode("ascii")
        return f"data:{mime};base64,{b64}"
    return None
