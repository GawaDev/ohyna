# -*- coding: utf-8 -*-
"""Ohyna Language Registry 用の Mermaid コードハイライト（Pygments）。

図描画エンジンとは独立。``mermaid code`` フェンスの成果物色分けに使う。
"""

from __future__ import annotations

from pygments.lexer import RegexLexer
from pygments.token import Comment, Keyword, Name, Number, Operator, String, Text

# Pygments の _load_lexers が module.__all__ を参照するため必須
__all__ = ["MermaidLexer"]

_DIAGRAM_KW = (
    r"flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|"
    r"erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|"
    r"C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|mindmap|timeline|"
    r"zenuml|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|"
    r"kanban|architecture(?:-beta)?|radar(?:-beta)?|treemap(?:-beta)?|venn|"
    r"ishikawa|wardley|cynefin|treeview"
)

_FLOW_KW = (
    r"subgraph|end|direction|TD|TB|BT|RL|LR|participant|actor|Note|loop|alt|"
    r"opt|else|par|and|critical|break|rect|activate|deactivate|title|section|"
    r"dateFormat|axisFormat|excludes|includes|todayMarker|class|classDef|click|"
    r"style|linkStyle|callback"
)


class MermaidLexer(RegexLexer):
    """最小限の Mermaid ソース色分け。厳密な構文解析はしない。"""

    name = "Ohyna Mermaid"
    aliases = ["mermaid-code", "ohyna-mermaid"]
    filenames: list[str] = []
    mimetypes: list[str] = []

    tokens = {
        "root": [
            (r"%%\{[\s\S]*?\}%%", Comment.Preproc),
            (r"%%.*$", Comment),
            (rf"\b(?:{_DIAGRAM_KW})\b", Keyword),
            (rf"\b(?:{_FLOW_KW})\b", Keyword),
            (r'"[^"\n]*"', String),
            (r"'[^'\n]*'", String),
            (r"\|[^|\n]*\|", String),
            (r"-->|---|-\.->|==>|-->>|->>|->|--|~~", Operator),
            (r"&&&?", Operator),
            # ハイフンを識別子に含めない（A-->B を A-- / > / B に壊さない）
            (r"[A-Za-z_][\w]*", Name),
            (r"\d+(?:\.\d+)?", Number),
            (r"\s+", Text),
            (r".", Text),
        ]
    }


_REGISTERED = False


def register_mermaid_lexer() -> None:
    """Pygments に ``mermaid-code`` / ``ohyna-mermaid`` を登録する（冪等・スレッド安全寄り）。"""
    global _REGISTERED
    import pygments.lexers as lexers_mod

    # LEXERS 値: (module, Lexer.name, aliases, filenames, mimetypes)
    # 2 番目はクラス名ではなく cls.name（Pygments の _lexer_cache キー）
    entry = (
        "ohyna.mermaid_lexer",
        MermaidLexer.name,
        tuple(MermaidLexer.aliases),
        tuple(MermaidLexer.filenames),
        tuple(MermaidLexer.mimetypes),
    )
    lexers_mod.LEXERS["MermaidLexer"] = entry
    # 直接キャッシュへ載せて、再 import 失敗や走査漏れでも解決できるようにする
    cache = getattr(lexers_mod, "_lexer_cache", None)
    if isinstance(cache, dict):
        cache[MermaidLexer.name] = MermaidLexer
    alias_cache = getattr(lexers_mod, "_alias_cache", None)
    if isinstance(alias_cache, dict):
        for alias in MermaidLexer.aliases:
            alias_cache[alias] = MermaidLexer
    _REGISTERED = True
