# -*- coding: utf-8 -*-
"""コードフェンスの共通解読（Ohyna Fence Grammar の単一実装）。

解析（analyze）と変換（pdf）は本モジュールの規則だけを使う。
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

_FENCE_OPEN_RE = re.compile(r"^(\s{0,3})(`{3,}|~{3,})(.*)$")

# 図になる言語トークン（ASCII 小文字・完全一致）
MERMAID_LANG = "mermaid"

# ディスプレイ数式になる言語トークン（ASCII 小文字・完全一致）
MATH_FENCE_LANGS = frozenset({"math", "latex", "katex", "tex", "stex"})

# エンジン専用（通常の Language Registry 解決の対象外）
ENGINE_FENCE_LANGS = frozenset({MERMAID_LANG}) | MATH_FENCE_LANGS

# ``mermaid code`` を Markdown に渡すときの正規化言語識別子
MERMAID_CODE_LANG = "mermaid-code"


class FenceKind(str, Enum):
    CODE = "code"
    MERMAID_DIAGRAM = "mermaid-diagram"
    MERMAID_CODE = "mermaid-code"
    MATH = "math"


@dataclass(frozen=True)
class FenceBlock:
    """1 つの閉じたフェンス。

    line / end_line は 1-based（開き行・閉じ行）。
    marker は '`' または '~'。
    lang は info 先頭トークンを小文字化した文字列（空可）。
    arguments は先頭以降のトークン（小文字）。
    """

    lang: str
    body: str
    line: int
    end_line: int
    marker: str
    info: str
    arguments: tuple[str, ...] = ()

    @property
    def kind(self) -> FenceKind:
        return classify_fence(self)


def iter_fences(text: str) -> tuple[list[FenceBlock], list[tuple[int, str]]]:
    """Ohyna Fence Grammar でフェンスを走査する。

    戻り値: (閉じたブロック一覧, 未閉じエラーの (行, メッセージ) 一覧)

    規則（info ::= language argument*）:
    - 行頭インデントはスペース 0〜3
    - 開き: backtick または tilde が 3 つ以上、続けて info 文字列
    - 言語トークン: info を空白分割した先頭。大文字は小文字へ正規化
    - 追加トークン: 先頭以降（小文字化）
    - 閉じ: 同じ文字種で長さ以上、かつ info が空
    """
    lines = text.splitlines()
    blocks: list[FenceBlock] = []
    errors: list[tuple[int, str]] = []
    open_i: int | None = None
    open_lang = ""
    open_info = ""
    open_args: tuple[str, ...] = ()
    open_marker = ""
    open_len = 0
    body: list[str] = []

    for i, line in enumerate(lines):
        m = _FENCE_OPEN_RE.match(line)
        if not m:
            if open_i is not None:
                body.append(line)
            continue
        marker = m.group(2)[0]
        length = len(m.group(2))
        info = m.group(3).strip()
        if open_i is None:
            open_i = i
            open_info = info
            tokens = [t.lower() for t in info.split()] if info else []
            open_lang = tokens[0] if tokens else ""
            open_args = tuple(tokens[1:])
            open_marker = marker
            open_len = length
            body = []
            continue
        if marker == open_marker and length >= open_len and info == "":
            blocks.append(
                FenceBlock(
                    lang=open_lang,
                    body="\n".join(body),
                    line=open_i + 1,
                    end_line=i + 1,
                    marker=open_marker,
                    info=open_info,
                    arguments=open_args,
                )
            )
            open_i = None
            body = []
            continue
        body.append(line)

    if open_i is not None:
        msg = (
            f"コードフェンス（{open_lang}）が閉じられていません"
            if open_lang
            else "コードフェンスが閉じられていません"
        )
        errors.append((open_i + 1, msg))
    return blocks, errors


def classify_fence(f: FenceBlock) -> FenceKind:
    """フェンスの表示種別（図／コード／数式）。"""
    if f.marker != "`":
        return FenceKind.CODE

    if f.lang == MERMAID_LANG:
        if not f.arguments:
            return FenceKind.MERMAID_DIAGRAM
        if f.arguments == ("code",):
            return FenceKind.MERMAID_CODE
        return FenceKind.CODE

    if f.lang in MATH_FENCE_LANGS and not f.arguments:
        return FenceKind.MATH

    return FenceKind.CODE


def is_mermaid_diagram_fence(f: FenceBlock) -> bool:
    """変換・検証の対象となる Mermaid ダイアグラムフェンスか。"""
    return classify_fence(f) == FenceKind.MERMAID_DIAGRAM


def is_mermaid_code_fence(f: FenceBlock) -> bool:
    """Mermaid 文法でハイライトするコードフェンスか（図にしない）。"""
    return classify_fence(f) == FenceKind.MERMAID_CODE


def is_mermaid_fence_mode_error(f: FenceBlock) -> bool:
    """``mermaid`` に未知の追加トークンがあるか。"""
    return (
        f.marker == "`"
        and f.lang == MERMAID_LANG
        and bool(f.arguments)
        and f.arguments != ("code",)
    )


def is_math_fence(f: FenceBlock) -> bool:
    """ディスプレイ数式フェンスか（backtick のみ）。"""
    return classify_fence(f) == FenceKind.MATH


def replace_engine_fences(text: str) -> tuple[str, list[str], list[str]]:
    """図・数式フェンスをプレースホルダへ置換し、``mermaid code`` を正規化する。

    戻り値: (置換後テキスト, Mermaid ソース一覧, 数式 TeX 一覧)
    """
    blocks, _ = iter_fences(text)
    if not blocks:
        return text, [], []

    if not text:
        return text, [], []

    raw_lines = text.split("\n")
    ends_with_nl = text.endswith("\n")

    mermaid_srcs: list[str] = []
    math_srcs: list[str] = []
    # line は 1-based → 0-based。end 含む。None = 行削除
    overrides: dict[int, str | None] = {}
    for f in blocks:
        start = f.line - 1
        end = f.end_line - 1
        if is_mermaid_diagram_fence(f):
            ph = f"\n\n@@@MERMAID{len(mermaid_srcs)}@@@\n\n"
            mermaid_srcs.append(f.body.strip())
            overrides[start] = ph
            for i in range(start + 1, end + 1):
                overrides[i] = None
        elif is_math_fence(f):
            ph = f"\n\n@@@MATH{len(math_srcs)}@@@\n\n"
            math_srcs.append(f.body.strip())
            overrides[start] = ph
            for i in range(start + 1, end + 1):
                overrides[i] = None
        elif is_mermaid_code_fence(f):
            # 開き行だけ Language Registry 識別子へ正規化（本文・閉じはそのまま）
            m = _FENCE_OPEN_RE.match(raw_lines[start])
            if m:
                indent, ticks = m.group(1), m.group(2)
                overrides[start] = f"{indent}{ticks}{MERMAID_CODE_LANG}"

    if not overrides:
        return text, [], []

    out: list[str] = []
    for i, line in enumerate(raw_lines):
        if i in overrides:
            val = overrides[i]
            if val is None:
                continue
            out.append(val.rstrip("\n"))
            continue
        out.append(line)

    rebuilt = "\n".join(out)
    if ends_with_nl and not rebuilt.endswith("\n"):
        rebuilt += "\n"
    return rebuilt, mermaid_srcs, math_srcs
