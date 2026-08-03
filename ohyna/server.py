# -*- coding: utf-8 -*-
"""HTTP サービス + GUI。

GET  /            … GUI
GET  /gui/*       … 静的ファイル
POST /preview     … Markdown → プレビュー HTML（静的解析通過が前提）
POST /pdf         … Markdown → PDF（静的解析通過が前提）
POST /analyze     … Markdown 静的解析（MD / Mermaid / KaTeX / ハイライト）
GET  /styles /health /docs /covers
GET  /llms.txt /llms-full.txt /webmcp.json /robots.txt /sitemap.xml /.well-known/security.txt

本番はリバースプロキシ配下でのサーバ公開を想定する（TLS・認証・レート制限は前段）。
開発時の既定バインドは 127.0.0.1。追加 CORS は OHYNA_ALLOWED_ORIGINS。
公開オリジンは OHYNA_PUBLIC_ORIGIN（任意）。security.txt の Contact は OHYNA_SECURITY_CONTACT（任意）。
"""

from __future__ import annotations

import json
import mimetypes
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from . import __version__
from .cover_assets import COVERS_DIR, cover_background_path
from .paths import ensure_under
from .project_meta import DEMO_GUI_URL, DEMO_ORIGIN, ISSUES_URL, REPO_URL
from .site_meta import (
    build_llms_full,
    build_sitemap_xml,
    public_origin,
    render_llms_txt,
    render_robots_txt,
    render_security_txt,
    site_dir,
)
from .style import list_presets
from .theme import cover_colors

_GUI_DIR = Path(__file__).resolve().parent.parent / "gui"
_DOCS_DIR = Path(__file__).resolve().parent.parent / "docs"
_MAX_BODY = 8 * 1024 * 1024  # 8 MiB


def _extra_allowed_origins() -> set[str]:
    """環境変数 OHYNA_ALLOWED_ORIGINS（カンマ区切り）の追加許可 Origin。"""
    raw = (os.environ.get("OHYNA_ALLOWED_ORIGINS") or "").strip()
    if not raw:
        return set()
    return {part.strip() for part in raw.split(",") if part.strip()}


# GUI ヘルプ（マニュアル／仕様書／ライセンス）。カタログ外のパスは配信しない。
# 画面ヘルプに出す文書のみ（デプロイ先の利用者＝この一覧しか読めない）。
# 開発者・運用者向け（アーキテクチャ / API・CLI / 脅威モデル / 開発者ガイド）は
# リポジトリ内に残し、カタログには載せない。
_DOCS_CATALOG: list[dict[str, str]] = [
    # マニュアル
    {"id": "manual/01-intro.md", "title": "はじめに", "group": "マニュアル"},
    {"id": "manual/02-ui-and-files.md", "title": "画面とファイル操作", "group": "マニュアル"},
    {"id": "manual/03-settings.md", "title": "ドキュメント設定", "group": "マニュアル"},
    {"id": "manual/04-writing.md", "title": "本文の書き方", "group": "マニュアル"},
    {"id": "manual/05-preview-and-pdf.md", "title": "確認と PDF 出力", "group": "マニュアル"},
    {"id": "manual/06-troubleshooting.md", "title": "困ったとき", "group": "マニュアル"},
    # 仕様書（利用者が画面ヘルプで契約を確認できるもの）
    {"id": "spec/00-概要と方針.md", "title": "概要と方針", "group": "仕様書"},
    {"id": "spec/03-文書設定リファレンス.md", "title": "文書設定リファレンス", "group": "仕様書"},
    {"id": "spec/05-印刷とプレビュー.md", "title": "印刷とプレビュー", "group": "仕様書"},
    {"id": "spec/08-入力解読仕様.md", "title": "入力解読仕様", "group": "仕様書"},
    {"id": "spec/09-出力仕様.md", "title": "出力仕様", "group": "仕様書"},
    {"id": "spec/10-準拠仕様マップ.md", "title": "準拠仕様マップ", "group": "仕様書"},
    # ライセンス
    {"id": "license/01-mit.md", "title": "MIT License", "group": "ライセンス"},
    {"id": "license/02-third-party.md", "title": "第三者コンポーネント", "group": "ライセンス"},
]


class Handler(BaseHTTPRequestHandler):
    server_version = f"Ohyna/{__version__}"

    def _origin(self) -> str:
        return public_origin(
            self.headers.get("Host") or "",
            forwarded_proto=self.headers.get("X-Forwarded-Proto"),
        )

    def _text(self, code: int, text: str, content_type: str) -> None:
        data = text.encode("utf-8")
        self._bytes(code, data, content_type)

    def _cors_origin(self) -> str | None:
        """同一ホスト／開発用 localhost／OHYNA_ALLOWED_ORIGINS のみ許可（CORS * は使わない）。"""
        origin = (self.headers.get("Origin") or "").strip()
        if not origin:
            return None
        host = self.headers.get("Host") or ""
        if not host:
            return None
        allowed = {
            f"http://{host}",
            f"https://{host}",
            "http://127.0.0.1:8787",
            "http://localhost:8787",
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        }
        allowed |= _extra_allowed_origins()
        return origin if origin in allowed else None

    def _set_cors(self) -> None:
        origin = self._cors_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._set_cors()
        self.end_headers()
        self.wfile.write(body)

    def _bytes(
        self,
        code: int,
        data: bytes,
        content_type: str,
        *,
        filename: str | None = None,
    ) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self._set_cors()
        self.end_headers()
        self.wfile.write(data)

    def _html(self, code: int, html: str) -> None:
        self._bytes(code, html.encode("utf-8"), "text/html; charset=utf-8")

    def _file(self, path: Path) -> None:
        if not path.is_file():
            self._json(404, {"error": "not found"})
            return
        data = path.read_bytes()
        ctype, _ = mimetypes.guess_type(str(path))
        if path.suffix in (".js", ".mjs", ".cjs"):
            ctype = "text/javascript; charset=utf-8"
        elif path.suffix == ".css":
            ctype = "text/css; charset=utf-8"
        elif path.suffix == ".html":
            ctype = "text/html; charset=utf-8"
            # OGP / canonical の __OHYNA_ORIGIN__ を公開オリジンへ置換
            if b"__OHYNA_ORIGIN__" in data:
                origin = self._origin().encode("utf-8")
                data = data.replace(b"__OHYNA_ORIGIN__", origin)
        elif path.suffix == ".wasm":
            ctype = "application/wasm"
        elif path.suffix == ".md":
            ctype = "text/markdown; charset=utf-8"
        elif path.suffix in (".webmanifest",) or path.name.endswith(
            "manifest.webmanifest"
        ):
            ctype = "application/manifest+json; charset=utf-8"
        elif path.suffix == ".json" and "manifest" in path.name:
            ctype = "application/manifest+json; charset=utf-8"
        elif path.suffix == ".webp":
            ctype = "image/webp"
        elif path.suffix == ".png":
            ctype = "image/png"
        self._bytes(200, data, ctype or "application/octet-stream")

    def do_OPTIONS(self) -> None:  # noqa: N802
        origin = self._cors_origin()
        if not origin:
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path in ("/", "/gui", "/gui/"):
            self._file(_GUI_DIR / "index.html")
            return
        if path.startswith("/gui/"):
            rel = path[len("/gui/") :]
            if not rel or ".." in Path(rel).parts:
                self._json(400, {"error": "invalid path"})
                return
            try:
                full = ensure_under(_GUI_DIR, rel, label="gui path")
            except ValueError:
                self._json(400, {"error": "invalid path"})
                return
            self._file(full)
            return
        if path in ("/health", "/api/health"):
            self._json(
                200,
                {
                    "ok": True,
                    "service": "Ohyna",
                    "version": __version__,
                    "gui": True,
                    "repository": REPO_URL,
                    "demo": DEMO_ORIGIN,
                    "demoGui": DEMO_GUI_URL,
                    "issues": ISSUES_URL,
                    "origin": self._origin(),
                    "bindHint": "production: reverse-proxy + TLS + auth in front",
                    "endpoints": [
                        "GET /",
                        "GET /gui/",
                        "GET /docs",
                        "GET /docs/<file>.md",
                        "GET /llms.txt",
                        "GET /llms-full.txt",
                        "GET /webmcp.json",
                        "GET /robots.txt",
                        "GET /sitemap.xml",
                        "GET /.well-known/security.txt",
                        "POST /preview",
                        "POST /pdf",
                        "POST /analyze",
                        "GET /styles",
                        "GET /covers/<style>/<pattern>",
                        "GET /health",
                    ],
                    "webmcp": {
                        "page": "/gui/",
                        "catalog": "/webmcp.json",
                        "note": "Tools register in the browser tab via WebMCP (not a server MCP transport)",
                    },
                    "presets": list_presets(),
                },
            )
            return
        if path == "/llms.txt":
            self._text(
                200,
                render_llms_txt(self._origin()),
                "text/plain; charset=utf-8",
            )
            return
        if path == "/llms-full.txt":
            self._text(
                200,
                build_llms_full(self._origin(), _DOCS_CATALOG),
                "text/plain; charset=utf-8",
            )
            return
        if path == "/webmcp.json":
            catalog = site_dir() / "webmcp.json"
            if not catalog.is_file():
                self._json(404, {"error": "webmcp catalog missing"})
                return
            self._text(
                200,
                catalog.read_text(encoding="utf-8"),
                "application/json; charset=utf-8",
            )
            return
        if path == "/robots.txt":
            self._text(
                200,
                render_robots_txt(self._origin()),
                "text/plain; charset=utf-8",
            )
            return
        if path == "/sitemap.xml":
            doc_ids = [
                e["id"]
                for e in _DOCS_CATALOG
                if (_DOCS_DIR / e["id"]).is_file()
            ]
            self._text(
                200,
                build_sitemap_xml(self._origin(), doc_ids),
                "application/xml; charset=utf-8",
            )
            return
        if path == "/.well-known/security.txt":
            self._text(
                200,
                render_security_txt(self._origin()),
                "text/plain; charset=utf-8",
            )
            return
        if path == "/styles":
            themes = {}
            for name in list_presets():
                c1, c2, c3 = cover_colors(name)
                themes[name] = {
                    "cover1": c1,
                    "cover2": c2,
                    "cover3": c3,
                    "coverFg": "#ffffff",
                }
            self._json(200, {"presets": list_presets(), "themes": themes})
            return
        if path.startswith("/covers/"):
            rel = unquote(path[len("/covers/") :])
            parts = Path(rel).parts
            if len(parts) != 2 or ".." in parts:
                self._json(400, {"error": "invalid cover path"})
                return
            style, filename = parts
            stem = Path(filename).stem
            ext = Path(filename).suffix.lower()
            if ext not in (".webp", ".png", ""):
                self._json(400, {"error": "invalid cover extension"})
                return
            pattern = stem if ext else filename
            try:
                candidate = cover_background_path(style, pattern)
                if not candidate.is_file():
                    alt = candidate.with_suffix(".png")
                    candidate = alt if alt.is_file() else candidate
                full = ensure_under(
                    COVERS_DIR,
                    f"{candidate.parent.name}/{candidate.name}",
                    label="cover",
                )
            except ValueError:
                self._json(400, {"error": "invalid cover path"})
                return
            if not full.is_file():
                self._json(404, {"error": "cover image not found"})
                return
            self._file(full)
            return
        if path in ("/docs", "/docs/"):
            items = []
            for entry in _DOCS_CATALOG:
                full = _DOCS_DIR / entry["id"]
                if full.is_file():
                    items.append({**entry, "url": f"/docs/{entry['id']}"})
            self._json(200, {"docs": items})
            return
        if path.startswith("/docs/"):
            rel = path[len("/docs/") :]
            if not rel or ".." in Path(rel).parts or not rel.endswith(".md"):
                self._json(400, {"error": "invalid docs path"})
                return
            allowed = {e["id"] for e in _DOCS_CATALOG}
            if rel not in allowed:
                self._json(404, {"error": "not found"})
                return
            try:
                full = ensure_under(_DOCS_DIR, rel, label="docs path")
            except ValueError:
                self._json(400, {"error": "invalid docs path"})
                return
            self._file(full)
            return
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            self._json(400, {"error": "invalid Content-Length"})
            return
        if length < 0 or length > _MAX_BODY:
            self._json(413, {"error": f"request body too large (max {_MAX_BODY} bytes)"})
            return
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid json"})
            return
        if not isinstance(data, dict):
            self._json(400, {"error": "json object required"})
            return

        if path == "/pdf":
            self._handle_pdf(data)
            return
        if path == "/preview":
            self._handle_preview(data)
            return
        if path == "/analyze":
            self._handle_analyze(data)
            return
        self._json(404, {"error": "not found"})

    def _public_error(self, e: Exception) -> str:
        msg = str(e).splitlines()[0][:240]
        return msg or e.__class__.__name__

    def _run_analyze(self, markdown: str) -> tuple[list, int, int] | None:
        """静的解析を実行。失敗時はエラー JSON を送って None。"""
        from .analyze_cache import analyze_markdown_cached

        try:
            diagnostics = analyze_markdown_cached(str(markdown))
        except Exception as e:  # noqa: BLE001
            self._json(400, {"error": self._public_error(e)})
            return None
        errors = sum(1 for d in diagnostics if d.get("severity") == "error")
        warnings = sum(1 for d in diagnostics if d.get("severity") == "warning")
        return diagnostics, errors, warnings

    def _reject_if_analyze_fails(self, markdown: str) -> bool:
        """error があれば 422 を返して True（呼び出し側は中断）。"""
        result = self._run_analyze(markdown)
        if result is None:
            return True
        diagnostics, errors, warnings = result
        if errors == 0:
            return False
        self._json(
            422,
            {
                "ok": False,
                "error": f"静的解析エラーが {errors} 件あるため処理できません",
                "diagnostics": diagnostics,
                "errors": errors,
                "warnings": warnings,
            },
        )
        return True

    def _handle_analyze(self, data: dict) -> None:
        markdown = data.get("markdown") or ""
        result = self._run_analyze(str(markdown))
        if result is None:
            return
        diagnostics, errors, warnings = result
        self._json(
            200,
            {
                "ok": errors == 0,
                "diagnostics": diagnostics,
                "errors": errors,
                "warnings": warnings,
            },
        )

    def _handle_preview(self, data: dict) -> None:
        from .pdf import markdown_to_preview_html

        markdown = data.get("markdown") or ""
        if not str(markdown).strip():
            self._json(400, {"error": "markdown is required"})
            return
        if self._reject_if_analyze_fails(str(markdown)):
            return
        try:
            html = markdown_to_preview_html(str(markdown))
        except Exception as e:  # noqa: BLE001
            self._json(400, {"error": self._public_error(e)})
            return
        self._json(200, {"html": html})

    def _handle_pdf(self, data: dict) -> None:
        from .pdf import markdown_to_pdf

        markdown = data.get("markdown") or ""
        if not str(markdown).strip():
            self._json(400, {"error": "markdown is required"})
            return
        if self._reject_if_analyze_fails(str(markdown)):
            return
        try:
            with tempfile.TemporaryDirectory(prefix="ohyna-api-") as tmp:
                pdf_bytes = markdown_to_pdf(
                    str(markdown),
                    out_path=Path(tmp) / "out.pdf",
                )
        except Exception as e:  # noqa: BLE001
            self._json(400, {"error": self._public_error(e)})
            return
        self._bytes(200, pdf_bytes, "application/pdf", filename="document.pdf")

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def create_httpd(host: str = "127.0.0.1", port: int = 8787) -> ThreadingHTTPServer:
    """HTTP サーバを生成する（port=0 なら空きポートを割り当て）。"""
    if host not in ("127.0.0.1", "localhost", "::1"):
        print(
            f"WARNING: binding to {host}. "
            "For public deployment put TLS, authentication, and rate limiting "
            "on a reverse proxy in front of this process. "
            "Do not expose the raw Python server to the Internet.",
            file=sys.stderr,
        )
    extra = sorted(_extra_allowed_origins())
    if extra:
        print(f"CORS extra origins: {', '.join(extra)}", file=sys.stderr)
    return ThreadingHTTPServer((host, port), Handler)


def serve(host: str = "127.0.0.1", port: int = 8787) -> None:
    httpd = create_httpd(host, port)
    print(f"Ohyna GUI  http://{host}:{port}/")
    print(
        "API  POST /preview /pdf /analyze  "
        "GET /styles /docs /llms.txt /sitemap.xml /health"
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
        httpd.server_close()
