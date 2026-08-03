# -*- coding: utf-8 -*-
"""製品版。リポジトリ直下の VERSION を優先し、無いときはパッケージメタデータを使う。"""

from __future__ import annotations

from pathlib import Path

_VERSION_FILE = Path(__file__).resolve().parent.parent / "VERSION"


def read_version() -> str:
    if _VERSION_FILE.is_file():
        for line in _VERSION_FILE.read_text(encoding="utf-8").splitlines():
            text = line.strip()
            if text and not text.startswith("#"):
                return text
    try:
        from importlib.metadata import PackageNotFoundError, version

        return version("ohyna")
    except PackageNotFoundError:
        pass
    except Exception:
        pass
    return "0.0.0"


__version__ = read_version()
