# -*- coding: utf-8 -*-
"""パス拘束ユーティリティ（ディレクトリ脱出防止）。"""

from __future__ import annotations

from pathlib import Path


def ensure_under(root: Path, candidate: Path | str, *, label: str = "path") -> Path:
    """candidate が root 配下に解決されることを保証する。"""
    root_r = root.resolve()
    cand = Path(candidate)
    full = cand.resolve() if cand.is_absolute() else (root_r / cand).resolve()
    try:
        full.relative_to(root_r)
    except ValueError as e:
        raise ValueError(f"{label} escapes allowed root: {candidate}") from e
    return full


def styles_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "styles"


def resolve_bundled_style_file(name: str) -> Path:
    """styleFile を styles/ 配下の JSON に限定して解決する。"""
    raw = str(name or "").strip()
    if not raw:
        raise ValueError("styleFile is empty")
    base = Path(raw).name  # ディレクトリ成分を捨てる
    if not base.endswith(".json"):
        base = f"{base}.json"
    return ensure_under(styles_dir(), base, label="styleFile")
