# -*- coding: utf-8 -*-
"""Markdown YAML front matter（単票の表紙・スタイル定義）。

文書設定はトップレベルではなく ``ohyna:`` 配下のみ。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import yaml

from .design import DocumentDesign

_FM_RE = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)", re.DOTALL)
_LEADING_HTML_COMMENT_RE = re.compile(r"\A\s*<!--.*?-->\s*", re.DOTALL)

OHYNA_KEY = "ohyna"


class FrontmatterError(ValueError):
    """front matter 区切りは存在するが YAML として不正なときの例外。"""

# 読み書きする公式キー（これ以外は ohyna 配下でも無視しない＝スキーマ外）
OHYNA_KEYS = (
    "cover",
    "title",
    "subtitle",
    "label",
    "meta",
    "author",
    "version",
    "date",
    "style",
    "lang",
    "rounded",
    "radius",
    "font",
    "fontFamily",
    "fontMono",
    "fontSize",
    "lineHeight",
    "letterSpacing",
    "coverGradient",
    "coverPattern",
    "headingBand",
    "tableHeaderFill",
    "pageSize",
    "pageOrientation",
    "marginPreset",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
    "pageHeader",
    "pageHeaderText",
    "pageFooter",
    "pageFooterText",
    "toc",
    "tocDepth",
    "codeLineNumbers",
    "codeWrap",
    "codeFontSize",
    "linkUnderline",
    "linkThemeColor",
    "watermark",
    "watermarkText",
    "design",
)

_REJECTED_KEYS = ("partLabel", "engine")


@dataclass
class DocumentFrontmatter:
    """単票用に正規化した front matter + 本文。"""

    body: str
    raw: dict[str, Any] = field(default_factory=dict)
    cover: bool | None = None
    title: str | None = None
    subtitle: str = ""
    label: str = ""
    meta: list[str] = field(default_factory=list)
    style: str | None = None
    lang: str | None = None
    design: DocumentDesign = field(default_factory=DocumentDesign)


def _strip_leading_html_comments(text: str) -> str:
    """front matter 前の説明用 HTML コメントを除去する。"""
    while True:
        nxt = _LEADING_HTML_COMMENT_RE.sub("", text, count=1)
        if nxt == text:
            return text
        text = nxt


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """先頭の YAML front matter を分離する。無い場合は ({}, text)。"""
    if not text:
        return {}, ""
    if text.startswith("\ufeff"):
        text = text[1:]
    text = _strip_leading_html_comments(text)
    m = _FM_RE.match(text)
    if not m:
        return {}, text
    raw_yaml = m.group(1)
    body = text[m.end() :]
    try:
        data = yaml.safe_load(raw_yaml)
    except yaml.YAMLError as e:
        problem = getattr(e, "problem", None) or str(e)
        raise FrontmatterError(f"YAML の構文エラー: {problem}") from e
    if data is None:
        return {}, body
    if not isinstance(data, dict):
        raise FrontmatterError("front matter はオブジェクトである必要があります")
    return data, body


def extract_ohyna_config(data: dict[str, Any] | None) -> dict[str, Any]:
    """FM 全体から ``ohyna:`` ブロックのみを取り出す。"""
    data = dict(data or {})
    for key in _REJECTED_KEYS:
        if key in data:
            raise ValueError(f"キー '{key}' は使えません")
        nested = data.get(OHYNA_KEY)
        if isinstance(nested, dict) and key in nested:
            raise ValueError(f"キー '{OHYNA_KEY}.{key}' は使えません")

    value = data.get(OHYNA_KEY)
    if not isinstance(value, dict):
        return {}
    return dict(value)


def _as_str_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        lines = [ln.strip() for ln in value.splitlines()]
        return [ln for ln in lines if ln]
    if isinstance(value, (list, tuple)):
        out: list[str] = []
        for item in value:
            s = str(item).strip()
            if s:
                out.append(s)
        return out
    s = str(value).strip()
    return [s] if s else []


def normalize_frontmatter(data: dict[str, Any] | None) -> DocumentFrontmatter:
    """認識キーを DocumentFrontmatter に正規化する。"""
    root = dict(data or {})
    cfg = extract_ohyna_config(root)
    cover_val = cfg.get("cover")
    cover: bool | None
    if cover_val is None:
        cover = None
    else:
        cover = bool(cover_val)
    title = cfg.get("title")
    title_s = str(title).strip() if title is not None else None
    if title_s == "":
        title_s = None
    style = cfg.get("style")
    lang = cfg.get("lang")
    return DocumentFrontmatter(
        body="",
        raw=root,
        cover=cover,
        title=title_s,
        subtitle=str(cfg.get("subtitle") or ""),
        label=str(cfg.get("label") or ""),
        meta=_as_str_list(cfg.get("meta")),
        style=str(style).strip() if style not in (None, "") else None,
        lang=str(lang).strip() if lang not in (None, "") else None,
        design=DocumentDesign.from_mapping(cfg),
    )


def parse_document(text: str) -> DocumentFrontmatter:
    """text を FM + 本文に分け、正規化して返す。"""
    data, body = parse_frontmatter(text)
    doc = normalize_frontmatter(data)
    doc.body = body
    return doc


def _ordered_ohyna_dict(cfg: dict[str, Any]) -> dict[str, Any]:
    ordered: dict[str, Any] = {}
    for key in OHYNA_KEYS:
        if key in cfg:
            ordered[key] = cfg[key]
    for key, value in cfg.items():
        if key not in ordered:
            ordered[key] = value
    return ordered


def merge_frontmatter(text: str, meta: dict[str, Any]) -> str:
    """既存 FM の文書設定を meta で差し替え（本文・他キーは維持）。

    空値のキーは出力しない。文書設定は常に ``ohyna:`` に書く。
    """
    current, body = parse_frontmatter(text)
    try:
        cfg = extract_ohyna_config(current)
    except ValueError:
        raw = current.get(OHYNA_KEY)
        cfg = dict(raw) if isinstance(raw, dict) else {}
        for key in _REJECTED_KEYS:
            cfg.pop(key, None)
            current.pop(key, None)

    for key, value in meta.items():
        if key in _REJECTED_KEYS:
            continue
        if value is None:
            cfg.pop(key, None)
            continue
        if key == "meta":
            lst = _as_str_list(value)
            if not lst:
                cfg.pop("meta", None)
            else:
                cfg["meta"] = lst
            continue
        if isinstance(value, str) and not value.strip():
            cfg.pop(key, None)
            continue
        cfg[key] = value

    for key in _REJECTED_KEYS:
        cfg.pop(key, None)

    out: dict[str, Any] = {}
    for key, value in current.items():
        if key == OHYNA_KEY:
            continue
        if key in OHYNA_KEYS or key in _REJECTED_KEYS:
            continue
        out[key] = value

    ordered = _ordered_ohyna_dict(cfg)
    if ordered:
        out[OHYNA_KEY] = ordered

    if not out:
        return body.lstrip("\n") if body.startswith("\n") else body

    dumped = yaml.safe_dump(
        out,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
    ).rstrip() + "\n"
    if not body:
        body_out = "\n"
    elif body.startswith("\n"):
        body_out = body
    else:
        body_out = "\n" + body
    return f"---\n{dumped}---{body_out}"


def resolve_cover_fields(
    text: str,
    *,
    title: str | None = None,
    subtitle: str | None = None,
    part_label: str | None = None,
    meta_lines: list[str] | None = None,
    with_cover: bool | None = None,
    diagram_style: str | None = None,
    lang: str | None = None,
    default_cover: bool = True,
) -> DocumentFrontmatter:
    """本文から FM を除き、明示引数（非空）を優先して表紙項目を解決する。"""
    doc = parse_document(text)

    if title not in (None, ""):
        doc.title = str(title)

    if subtitle not in (None, ""):
        doc.subtitle = str(subtitle)
    elif not doc.subtitle:
        doc.subtitle = ""

    if part_label not in (None, ""):
        doc.label = str(part_label)

    if meta_lines:
        doc.meta = [str(x).strip() for x in meta_lines if str(x).strip()]

    if with_cover is not None:
        doc.cover = bool(with_cover)
    elif doc.cover is None:
        doc.cover = default_cover

    if diagram_style not in (None, ""):
        doc.style = str(diagram_style)

    if lang not in (None, ""):
        doc.lang = str(lang)

    return doc
