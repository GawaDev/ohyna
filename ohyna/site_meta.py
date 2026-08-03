# -*- coding: utf-8 -*-
"""公開サイトメタ（llms.txt / sitemap / robots / security.txt）。"""

from __future__ import annotations

import os
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

_SITE_DIR = Path(__file__).resolve().parent.parent / "site"
_DOCS_DIR = Path(__file__).resolve().parent.parent / "docs"


def site_dir() -> Path:
    return _SITE_DIR


def public_origin(host: str, *, forwarded_proto: str | None = None) -> str:
    """絶対 URL 用オリジン。OHYNA_PUBLIC_ORIGIN があればそれを優先。"""
    env = (os.environ.get("OHYNA_PUBLIC_ORIGIN") or "").strip().rstrip("/")
    if env:
        return env
    host = (host or "").strip() or "127.0.0.1:1717"
    proto = (forwarded_proto or "").split(",")[0].strip().lower()
    if proto not in ("http", "https"):
        # 開発ホストは http、それ以外は https を既定
        if host.startswith("127.0.0.1") or host.startswith("localhost"):
            proto = "http"
        else:
            proto = "https"
    return f"{proto}://{host}"


def _read_site_text(name: str) -> str:
    path = _SITE_DIR / name
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def render_llms_txt(origin: str) -> str:
    """相対リンクを絶対 URL に展開した llms.txt。"""
    raw = _read_site_text("llms.txt")
    if not raw:
        return "# Ohyna\n\n> Markdown → PDF\n"
    lines: list[str] = []
    for line in raw.splitlines():
        if "](/" in line:
            line = line.replace("](/", f"]({origin}/")
        lines.append(line)
    return "\n".join(lines) + ("\n" if not raw.endswith("\n") else "")


def render_robots_txt(origin: str) -> str:
    raw = _read_site_text("robots.txt")
    if not raw:
        return "User-agent: *\nAllow: /\n"
    return raw.replace("Sitemap: /sitemap.xml", f"Sitemap: {origin}/sitemap.xml")


def render_security_txt(origin: str) -> str:
    raw = _read_site_text("security.txt")
    contact = (os.environ.get("OHYNA_SECURITY_CONTACT") or "").strip()
    lines: list[str] = []
    for line in raw.splitlines():
        if line.startswith("Contact:") and contact:
            lines.append(f"Contact: {contact}")
            continue
        if line.startswith("Canonical:"):
            lines.append(f"Canonical: {origin}/.well-known/security.txt")
            continue
        if line.startswith("Policy:"):
            lines.append(f"Policy: {origin}/llms.txt")
            continue
        lines.append(line)
    body = "\n".join(lines).rstrip() + "\n"
    return body


def build_sitemap_xml(origin: str, doc_ids: list[str]) -> str:
    """GUI・ヘルプ・サイトメタの sitemap.xml。"""
    urlset = ET.Element(
        "urlset",
        attrib={"xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9"},
    )
    paths = [
        "/",
        "/gui/",
        "/llms.txt",
        "/llms-full.txt",
        "/webmcp.json",
        "/robots.txt",
        "/sitemap.xml",
        "/.well-known/security.txt",
        "/health",
        "/docs",
        "/styles",
    ]
    for doc_id in doc_ids:
        paths.append(f"/docs/{doc_id}")

    lastmod = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for path in paths:
        url_el = ET.SubElement(urlset, "url")
        loc = ET.SubElement(url_el, "loc")
        loc.text = urljoin(origin + "/", path.lstrip("/"))
        lm = ET.SubElement(url_el, "lastmod")
        lm.text = lastmod
        # トップとヘルプをやや優先
        pri = ET.SubElement(url_el, "priority")
        if path in ("/", "/gui/", "/llms.txt", "/webmcp.json"):
            pri.text = "1.0"
        elif path.startswith("/docs/"):
            pri.text = "0.8"
        else:
            pri.text = "0.4"

    ET.indent(urlset, space="  ")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        + ET.tostring(urlset, encoding="unicode")
        + "\n"
    )


def build_llms_full(origin: str, catalog: list[dict[str, str]]) -> str:
    """ヘルプカタログ文書を連結した llms-full.txt。"""
    parts: list[str] = [
        "# Ohyna — llms-full",
        "",
        f"> 生成オリジン: {origin}",
        "",
        "以下は画面ヘルプ（カタログ掲載）の本文連結です。",
        "",
    ]
    for entry in catalog:
        path = _DOCS_DIR / entry["id"]
        if not path.is_file():
            continue
        title = entry.get("title") or entry["id"]
        url = f"{origin}/docs/{entry['id']}"
        parts.append(f"# {title}")
        parts.append("")
        parts.append(f"Source: {url}")
        parts.append("")
        parts.append(path.read_text(encoding="utf-8").strip())
        parts.append("")
        parts.append("---")
        parts.append("")
    return "\n".join(parts)
