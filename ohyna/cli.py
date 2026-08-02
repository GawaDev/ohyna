# -*- coding: utf-8 -*-
"""CLI: Markdown → PDF / Mermaid flowchart → SVG。"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .engine import render_flowchart_svg
from .style import list_presets


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="ohyna",
        description="ohyna — Markdown → PDF / Mermaid flowchart → SVG",
    )
    p.add_argument("--list-styles", action="store_true", help="スタイル一覧を表示して終了")
    sub = p.add_subparsers(dest="cmd")

    r = sub.add_parser("render", help="flowchart を SVG に変換")
    r.add_argument("input", nargs="?", help=".mmd / .md ファイル（省略時は stdin）")
    r.add_argument("-o", "--output", help="出力 SVG（省略時は stdout）")
    r.add_argument(
        "-s",
        "--style",
        default="blue",
        help=f"プリセット名または JSON パス（利用可: {', '.join(list_presets())}）",
    )

    pdf = sub.add_parser("pdf", help="Markdown を PDF に変換")
    pdf.add_argument("input", type=Path, help=".md ファイル")
    pdf.add_argument(
        "-o",
        "--output",
        type=Path,
        required=True,
        help="出力 PDF ファイル",
    )
    pdf.add_argument("--title", default="", help="表紙タイトル（省略時は文書設定）")
    pdf.add_argument("--subtitle", default="", help="表紙サブタイトル")
    pdf.add_argument("--part-label", default="", help="表紙パートラベル")
    pdf.add_argument("--no-cover", action="store_true", help="表紙なし")
    pdf.add_argument(
        "-s",
        "--style",
        default="blue",
        help="図表スタイル（プリセット名）",
    )
    pdf.add_argument(
        "--theme-css",
        type=Path,
        help="印刷用 CSS（省略時は themes/blue-print.css）",
    )
    pdf.add_argument(
        "--work-dir",
        type=Path,
        help="中間 HTML の出力先（省略時は一時ディレクトリ）",
    )

    s = sub.add_parser(
        "serve",
        help="HTTP サービスを起動（本番はリバースプロキシ配下。開発既定は 127.0.0.1）",
    )
    s.add_argument(
        "--host",
        default="127.0.0.1",
        help="バインド先（本番例: 127.0.0.1 のまま前段プロキシのみ公開、または 0.0.0.0）",
    )
    s.add_argument("--port", type=int, default=8787)

    args = p.parse_args(argv)

    if args.list_styles:
        for name in list_presets():
            print(name)
        return 0

    if args.cmd == "serve":
        from .server import serve

        serve(args.host, args.port)
        return 0

    if args.cmd == "pdf":
        return _cmd_pdf(args)

    if args.cmd != "render":
        p.print_help()
        return 2

    if args.input:
        text = Path(args.input).read_text(encoding="utf-8")
        if "```mermaid" in text:
            import re

            m = re.search(r"```mermaid\n(.*?)```", text, re.S)
            if not m:
                print("mermaid ブロックが見つかりません", file=sys.stderr)
                return 1
            text = m.group(1)
    else:
        text = sys.stdin.read()

    style_arg = args.style
    style_path = Path(style_arg)
    if style_path.is_file():
        svg = render_flowchart_svg(text, style_file=str(style_path))
    else:
        svg = render_flowchart_svg(text, style_arg)

    if args.output:
        Path(args.output).write_text(svg, encoding="utf-8")
        print(f"wrote {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(svg)
        if not svg.endswith("\n"):
            sys.stdout.write("\n")
    return 0


def _cmd_pdf(args: argparse.Namespace) -> int:
    from .pdf import markdown_file_to_pdf

    inp = Path(args.input).resolve()
    if not inp.is_file():
        print(f"ファイルがありません: {inp}", file=sys.stderr)
        return 1
    if inp.suffix.lower() != ".md":
        print(f"Markdown 以外は未対応: {inp}", file=sys.stderr)
        return 1

    out = args.output
    if out.suffix.lower() != ".pdf":
        print("-o は .pdf ファイルを指定してください", file=sys.stderr)
        return 2

    cover_arg = False if args.no_cover else None
    markdown_file_to_pdf(
        inp,
        out,
        with_cover=cover_arg,
        diagram_style=args.style,
        theme_css=args.theme_css,
        work_dir=args.work_dir,
        title=args.title or None,
        subtitle=args.subtitle or None,
        part_label=args.part_label or "",
    )
    print(f"OK {out} ({out.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
