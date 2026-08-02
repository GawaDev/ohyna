# -*- coding: utf-8 -*-
"""図のスタイル定義。

Mermaid の themeVariables に近いキー名を受け付けます。
参考: https://docs.min87.com/ja/mermaid/config/theming
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from typing import Any, Mapping


def _lighten(hex_color: str, amount: float = 0.35) -> str:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return hex_color
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    r = min(255, int(r + (255 - r) * amount))
    g = min(255, int(g + (255 - g) * amount))
    b = min(255, int(b + (255 - b) * amount))
    return f"#{r:02x}{g:02x}{b:02x}"


def _darken(hex_color: str, amount: float = 0.25) -> str:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return hex_color
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    r = max(0, int(r * (1 - amount)))
    g = max(0, int(g * (1 - amount)))
    b = max(0, int(b * (1 - amount)))
    return f"#{r:02x}{g:02x}{b:02x}"


def _hue_shift(
    hex_color: str,
    degrees: float,
    *,
    sat: float | None = None,
    lit: float | None = None,
) -> str:
    """色相をずらした色を返す（表紙マルチブロブ用）。"""
    import colorsys

    h = hex_color.lstrip("#")
    if len(h) != 6:
        return hex_color
    r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    hh = (hh + degrees / 360.0) % 1.0
    if sat is not None:
        ss = max(0.0, min(1.0, sat))
    else:
        ss = min(1.0, max(0.55, ss * 1.25 + 0.1))
    if lit is not None:
        ll = max(0.0, min(1.0, lit))
    else:
        ll = max(0.38, min(0.62, ll))
    r2, g2, b2 = colorsys.hls_to_rgb(hh, ll, ss)
    return f"#{int(r2 * 255):02x}{int(g2 * 255):02x}{int(b2 * 255):02x}"


def _parse_font_size(value: Any, default: float = 14.0) -> float:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().lower().replace("px", "").replace("pt", "")
    try:
        n = float(s)
    except ValueError:
        return default
    # pt 指定っぽい小さい値はおおよそ px 換算
    if isinstance(value, str) and "pt" in str(value).lower():
        return n * 96 / 72
    return n


@dataclass
class DiagramStyle:
    """flowchart SVG 用スタイル（Mermaid themeVariables 互換キーを含む）。"""

    # Mermaid 互換
    primaryColor: str = "#e3f2fd"
    primaryTextColor: str = "#0b5cab"
    primaryBorderColor: str = "#1976d2"
    secondaryColor: str = "#bbdefb"
    lineColor: str = "#1565c0"
    textColor: str = "#0b5cab"
    mainBkg: str = "#e3f2fd"
    nodeBorder: str = "#1976d2"
    nodeTextColor: str = "#0b5cab"
    clusterBkg: str = "#ffffff"
    clusterBorder: str = "#90caf9"
    titleColor: str = "#0b5cab"
    edgeLabelBackground: str = "#ffffff"
    defaultLinkColor: str = "#1565c0"
    fontFamily: str = "Inter, 'Noto Sans JP', system-ui, sans-serif"
    fontSize: str = "14px"
    background: str = "#ffffff"

    # エンジン固有
    decisionFill: str = "#bbdefb"
    decisionBorder: str = "#1565c0"
    edgeWidth: float = 1.7
    nodeStrokeWidth: float = 1.5
    cornerRadius: float = 8.0
    clusterRadius: float = 12.0
    edgeCornerRadius: float = 10.0
    arrowSize: float = 9.0

    @property
    def font_px(self) -> float:
        return _parse_font_size(self.fontSize, 14.0)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any] | None) -> DiagramStyle:
        if not data:
            return cls()
        known = {f.name for f in fields(cls)}
        # Mermaid 別名の吸収
        aliases = {
            "primaryColour": "primaryColor",
            "lineColour": "lineColor",
            "font_family": "fontFamily",
            "font_size": "fontSize",
        }
        raw = {aliases.get(k, k): v for k, v in data.items()}
        # 未指定の派生
        primary = str(raw.get("primaryColor", cls.primaryColor))
        if "mainBkg" not in raw:
            raw["mainBkg"] = primary
        if "primaryBorderColor" not in raw and "nodeBorder" not in raw:
            raw["primaryBorderColor"] = _darken(primary, 0.2)
        if "nodeBorder" not in raw:
            raw["nodeBorder"] = raw.get("primaryBorderColor", cls.nodeBorder)
        if "nodeTextColor" not in raw:
            raw["nodeTextColor"] = raw.get("primaryTextColor", cls.nodeTextColor)
        if "defaultLinkColor" not in raw:
            raw["defaultLinkColor"] = raw.get("lineColor", cls.lineColor)
        if "decisionFill" not in raw:
            raw["decisionFill"] = raw.get("secondaryColor", _darken(primary, 0.05))
        if "decisionBorder" not in raw:
            raw["decisionBorder"] = raw.get("lineColor", cls.lineColor)
        if "edgeLabelBackground" not in raw:
            raw["edgeLabelBackground"] = raw.get("background", "#ffffff")
        if "clusterBkg" not in raw:
            raw["clusterBkg"] = raw.get("background", "#ffffff")
        kwargs = {k: v for k, v in raw.items() if k in known}
        return cls(**kwargs)

    @classmethod
    def from_json_file(cls, path: str | Path) -> DiagramStyle:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        if isinstance(data, dict) and "themeVariables" in data:
            data = data["themeVariables"]
        return cls.from_mapping(data)

    @classmethod
    def preset(cls, name: str) -> DiagramStyle:
        root = Path(__file__).resolve().parent.parent / "styles"
        path = root / f"{name}.json"
        if path.is_file():
            return cls.from_json_file(path)
        presets = {
            "blue": cls(),
            "default": cls(
                primaryColor="#fff4dd",
                primaryTextColor="#333333",
                primaryBorderColor="#d4a017",
                secondaryColor="#ffe0a3",
                lineColor="#333333",
                textColor="#333333",
                mainBkg="#fff4dd",
                nodeBorder="#d4a017",
                nodeTextColor="#333333",
                clusterBkg="#fafafa",
                clusterBorder="#cccccc",
                titleColor="#333333",
                decisionFill="#ffe0a3",
                decisionBorder="#333333",
                defaultLinkColor="#333333",
            ),
            "neutral": cls(
                primaryColor="#f5f5f5",
                primaryTextColor="#111111",
                primaryBorderColor="#555555",
                secondaryColor="#e0e0e0",
                lineColor="#222222",
                textColor="#111111",
                mainBkg="#f5f5f5",
                nodeBorder="#555555",
                nodeTextColor="#111111",
                clusterBkg="#ffffff",
                clusterBorder="#999999",
                titleColor="#111111",
                decisionFill="#e0e0e0",
                decisionBorder="#222222",
                defaultLinkColor="#222222",
            ),
            # 印刷前提: 白地＋スレート濃色アクセント（ページ全体を暗転しない）
            "dark": cls(
                primaryColor="#e8ecf1",
                primaryTextColor="#1a2332",
                primaryBorderColor="#2c3e50",
                secondaryColor="#d5dbe3",
                lineColor="#2c3e50",
                textColor="#1a2332",
                mainBkg="#e8ecf1",
                nodeBorder="#2c3e50",
                nodeTextColor="#1a2332",
                clusterBkg="#ffffff",
                clusterBorder="#8b98a8",
                titleColor="#1a2332",
                edgeLabelBackground="#ffffff",
                background="#ffffff",
                decisionFill="#d5dbe3",
                decisionBorder="#2c3e50",
                defaultLinkColor="#2c3e50",
            ),
            "forest": cls(
                primaryColor="#e8f5e9",
                primaryTextColor="#1b5e20",
                primaryBorderColor="#2e7d32",
                secondaryColor="#c8e6c9",
                lineColor="#1b5e20",
                textColor="#1b5e20",
                mainBkg="#e8f5e9",
                nodeBorder="#2e7d32",
                nodeTextColor="#1b5e20",
                clusterBkg="#ffffff",
                clusterBorder="#81c784",
                titleColor="#1b5e20",
                decisionFill="#c8e6c9",
                decisionBorder="#1b5e20",
                defaultLinkColor="#1b5e20",
            ),
            # 印刷前提: 白地＋赤アクセント
            "red": cls(
                primaryColor="#ffebee",
                primaryTextColor="#b71c1c",
                primaryBorderColor="#c62828",
                secondaryColor="#ffcdd2",
                lineColor="#b71c1c",
                textColor="#b71c1c",
                mainBkg="#ffebee",
                nodeBorder="#c62828",
                nodeTextColor="#b71c1c",
                clusterBkg="#ffffff",
                clusterBorder="#ef9a9a",
                titleColor="#b71c1c",
                edgeLabelBackground="#ffffff",
                background="#ffffff",
                decisionFill="#ffcdd2",
                decisionBorder="#b71c1c",
                defaultLinkColor="#b71c1c",
            ),
        }
        if name not in presets:
            raise KeyError(f"未知のスタイル: {name}（利用可: {', '.join(sorted(set(presets) | _style_files()))}）")
        return presets[name]


def _style_files() -> set[str]:
    root = Path(__file__).resolve().parent.parent / "styles"
    if not root.is_dir():
        return set()
    return {p.stem for p in root.glob("*.json")}


_INIT_RE = re.compile(
    r"%%\{init:\s*(?P<body>.*?)\s*\}%%",
    re.S | re.I,
)


def extract_init_style(mermaid_src: str) -> tuple[str, DiagramStyle | None]:
    """Mermaid の %%{init: ...}%% から theme / themeVariables を読む。"""
    m = _INIT_RE.search(mermaid_src)
    if not m:
        return mermaid_src, None
    body = m.group("body").strip()
    # JS オブジェクト風 → JSON へゆるく変換
    js = body
    js = re.sub(r"'", '"', js)
    js = re.sub(r"(\w+)\s*:", r'"\1":', js)
    js = js.replace("True", "true").replace("False", "false")
    try:
        data = json.loads(js)
    except json.JSONDecodeError:
        return _INIT_RE.sub("", mermaid_src, count=1), None

    style: DiagramStyle | None = None
    theme = data.get("theme")
    variables = data.get("themeVariables") or {}
    if theme and theme != "base" and not variables:
        try:
            style = DiagramStyle.preset(str(theme))
        except KeyError:
            style = None
    if variables:
        base = style or DiagramStyle()
        merged = {**base.to_dict(), **variables}
        style = DiagramStyle.from_mapping(merged)

    cleaned = _INIT_RE.sub("", mermaid_src, count=1)
    return cleaned, style


def list_presets() -> list[str]:
    names = set(_style_files()) | {
        "blue",
        "default",
        "neutral",
        "dark",
        "forest",
        "red",
        "indigo",
        "purple",
        "sakura",
        "orange",
        "celadon",
        "brown",
        "yellow",
        "wine",
        "sky",
        "gold",
    }
    return sorted(names)
