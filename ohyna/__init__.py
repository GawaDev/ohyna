# -*- coding: utf-8 -*-
"""Ohyna（Open Hybrid Note App／おひな）— Markdown → PDF / Mermaid → SVG。

ソース: https://github.com/GawaDev/ohyna  
デモ: https://ohyna.onrender.com/

参考:
- https://docs.min87.com/ja/mermaid/intro/
- https://docs.min87.com/ja/mermaid/config/theming
"""

from .engine import render_flowchart_svg
from .frontmatter import (
    FrontmatterError,
    extract_ohyna_config,
    merge_frontmatter,
    parse_document,
    parse_frontmatter,
)
from .pdf import (
    MarkdownOptions,
    html_to_pdf,
    markdown_file_to_pdf,
    markdown_to_html_fragment,
    markdown_to_pdf,
    markdown_to_preview_html,
)
from .style import DiagramStyle, extract_init_style, list_presets

__all__ = [
    "DiagramStyle",
    "MarkdownOptions",
    "extract_init_style",
    "FrontmatterError",
    "extract_ohyna_config",
    "html_to_pdf",
    "list_presets",
    "markdown_file_to_pdf",
    "markdown_to_html_fragment",
    "markdown_to_pdf",
    "markdown_to_preview_html",
    "merge_frontmatter",
    "parse_document",
    "parse_frontmatter",
    "render_flowchart_svg",
]

__version__ = "1.0.0"
