#!/usr/bin/env python3
"""Static checks for the built site in ./dist.

Fails (exit code 1) on broken links, missing or wrong SEO tags, non-reciprocal
hreflang alternates, CSP violations (inline scripts/styles), invalid JSON-LD,
sitemap mismatches and anything that looks like a leaked secret.
"""
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
CONFIG = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
BASE = CONFIG["base_url"].rstrip("/")
LANGS = CONFIG["languages"]
DEFAULT = CONFIG["default_language"]

SECRET_PATTERNS = [
    re.compile(r"ghp_[A-Za-z0-9]{30,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{30,}"),
    re.compile(r"sk-[A-Za-z0-9]{32,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"xox[abpr]-[A-Za-z0-9-]{10,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"AIza[0-9A-Za-z_-]{35}"),
]


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lang = None
        self.dir = None
        self.title = ""
        self._in_title = False
        self.h1 = 0
        self.meta = {}
        self.links = []          # (rel, href, hreflang)
        self.refs = []           # (tag, attr, url)
        self.ids = []
        self.imgs_without_alt = 0
        self.inline_scripts = []
        self.style_attrs = 0
        self.style_tags = 0
        self.jsonld = []
        self._script_type = None
        self._script_buf = []
        self._svg_depth = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.append(a["id"])
        if "style" in a:
            self.style_attrs += 1
        if tag == "html":
            self.lang = a.get("lang")
            self.dir = a.get("dir")
        elif tag == "svg":
            self._svg_depth += 1
        elif tag == "title" and not self._svg_depth:
            self._in_title = True
        elif tag == "h1":
            self.h1 += 1
        elif tag == "meta":
            key = a.get("name") or a.get("property") or a.get("http-equiv")
            if key:
                self.meta.setdefault(key.lower(), []).append(a.get("content", ""))
        elif tag == "link":
            self.links.append((a.get("rel", ""), a.get("href", ""), a.get("hreflang")))
            if a.get("href"):
                self.refs.append(("link", "href", a["href"]))
        elif tag == "a" and a.get("href"):
            self.refs.append(("a", "href", a["href"]))
        elif tag == "img":
            if "alt" not in a:
                self.imgs_without_alt += 1
            if a.get("src"):
                self.refs.append(("img", "src", a["src"]))
        elif tag == "script":
            if a.get("src"):
                self.refs.append(("script", "src", a["src"]))
                self._script_type = "external"
            else:
                self._script_type = a.get("type", "text/javascript")
                self._script_buf = []
        elif tag == "style":
            self.style_tags += 1
        elif tag == "form" and a.get("action"):
            self.refs.append(("form", "action", a["action"]))

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "svg":
            self._svg_depth -= 1
        elif tag == "script":
            body = "".join(self._script_buf)
            if self._script_type == "application/ld+json":
                self.jsonld.append(body)
            elif self._script_type not in ("external", "application/json") and body.strip():
                self.inline_scripts.append(body[:60])
            self._script_type = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._script_type and self._script_type != "external":
            self._script_buf.append(data)


def display_width(text: str) -> int:
    """Approximate search-result width: CJK characters count double."""
    return sum(2 if ord(ch) >= 0x2E80 else 1 for ch in text)


def local_target(url: str):
    """Map an internal URL to a file in dist; None for external URLs."""
    parsed = urlparse(url)
    if parsed.scheme in ("mailto", "tel", "sms", "data", "javascript"):
        return None
    if parsed.scheme in ("http", "https"):
        if not url.startswith(BASE):
            return None
        parsed = urlparse(url[len(BASE):] or "/")
    path = parsed.path
    if not path:
        return None
    if path.endswith("/"):
        path += "index.html"
    return DIST / path.lstrip("/"), parsed.fragment


def url_for_file(f: Path) -> str:
    rel = f.relative_to(DIST).as_posix()
    if rel == "index.html":
        return BASE + "/"
    if rel.endswith("/index.html"):
        return BASE + "/" + rel[: -len("index.html")]
    return BASE + "/" + rel


REQUIRED_PROPERTIES = {
    "Organization": ("@id", "name", "url", "logo", "address", "contactPoint"),
    "WebPage": ("@id", "url", "name", "inLanguage"),
    "BlogPosting": ("headline", "datePublished", "dateModified", "author", "publisher", "image"),
    "Person": ("@id", "name"),
    "SoftwareApplication": ("name", "description", "applicationCategory"),
    "Service": ("name", "provider"),
    "FAQPage": ("mainEntity",),
}


def structured_data_problems(data):
    """Required properties per schema.org type, plus a working logo and contact point for the organization."""
    nodes = data.get("@graph", [data]) if isinstance(data, dict) else []
    if not isinstance(data, dict) or data.get("@context") != "https://schema.org":
        yield "@context must be https://schema.org"
    for node in nodes:
        kind = node.get("@type")
        for key in REQUIRED_PROPERTIES.get(kind, ()):
            if not node.get(key):
                yield f"{kind} is missing {key}"
        if kind == "Organization":
            logo = node.get("logo") or {}
            target = local_target(logo.get("url", "")) if isinstance(logo, dict) else None
            if not target or not target[0].is_file():
                yield f"Organization logo does not exist: {logo}"
            point = node.get("contactPoint") or {}
            if not point.get("contactType") or not (point.get("telephone") or point.get("url") or point.get("email")):
                yield "Organization contactPoint needs contactType and a telephone, url or e-mail"
            if "streetAddress" in (node.get("address") or {}):
                yield "Organization address must stay locality/region only"


def main() -> int:
    if not DIST.is_dir():
        print("dist/ not found - run build.py first", file=sys.stderr)
        return 1
    errors, warnings = [], []
    pages = {}
    for f in sorted(DIST.rglob("*.html")):
        p = Page()
        p.feed(f.read_text(encoding="utf-8"))
        pages[f] = p

    redirect_stubs = {f for f, p in pages.items() if "refresh" in p.meta}
    ids_cache = {f: set(p.ids) for f, p in pages.items()}
    indexable = set()

    for f, p in pages.items():
        rel = f.relative_to(DIST).as_posix()
        if f in redirect_stubs:
            continue
        err = lambda msg: errors.append(f"{rel}: {msg}")
        robots = (p.meta.get("robots") or [""])[0]
        is_index = "noindex" not in robots
        first = rel.split("/")[0]
        expected_lang = first if first in LANGS and first != DEFAULT else DEFAULT
        if rel.endswith("404.html"):
            expected_lang = first if first in LANGS and "/" in rel else DEFAULT
        if p.lang != expected_lang:
            err(f"lang is {p.lang!r}, expected {expected_lang!r}")
        if p.dir not in ("ltr", "rtl"):
            err("missing dir attribute")
        if not p.title.strip():
            err("empty <title>")
        if p.h1 != 1:
            err(f"{p.h1} <h1> elements")
        desc = p.meta.get("description", [])
        if len(desc) != 1 or not desc[0].strip():
            err("needs exactly one meta description")
        elif is_index and not 50 <= display_width(desc[0]) <= 175:
            warnings.append(f"{rel}: description width {display_width(desc[0])}")
        if is_index and display_width(p.title) > 80:
            warnings.append(f"{rel}: title width {display_width(p.title)}")
        if "content-security-policy" not in p.meta:
            err("missing Content-Security-Policy meta")
        if p.inline_scripts:
            err(f"inline script blocked by CSP: {p.inline_scripts[0]!r}")
        if p.style_attrs or p.style_tags:
            err("inline style blocked by CSP")
        if p.imgs_without_alt:
            err(f"{p.imgs_without_alt} images without alt")
        dupes = {i for i in p.ids if p.ids.count(i) > 1}
        if dupes:
            err(f"duplicate ids: {sorted(dupes)}")
        for block in p.jsonld:
            try:
                data = json.loads(block)
            except ValueError as exc:
                err(f"invalid JSON-LD: {exc}")
                continue
            for problem in structured_data_problems(data):
                err(f"JSON-LD: {problem}")

        canon = [h for r, h, _ in p.links if r == "canonical"]
        if is_index:
            indexable.add(f)
            if canon != [url_for_file(f)]:
                err(f"canonical {canon} should be {url_for_file(f)}")
            alts = {hl: h for r, h, hl in p.links if r == "alternate" and hl}
            # Pages exist in every language, except blog posts, which are only in their own language.
            single_language = set(alts) == {p.lang, "x-default"} and alts.get("x-default") == url_for_file(f)
            if set(alts) != set(LANGS) | {"x-default"} and not single_language:
                err(f"hreflang set is {sorted(alts)}")
            if alts.get(p.lang) != url_for_file(f):
                err("hreflang for own language does not point to itself")
            for code, href in alts.items():
                target = local_target(href)
                if not target or not target[0].exists():
                    err(f"hreflang {code} -> missing page {href}")
                    continue
                back = {hl: h for r, h, hl in pages[target[0]].links if r == "alternate" and hl}
                if back.get(p.lang) != url_for_file(f):
                    err(f"hreflang {code} is not reciprocal")
            for key in ("og:title", "og:description", "og:url", "og:image", "twitter:card"):
                if key not in p.meta:
                    err(f"missing {key}")

        for tag, attr, url in p.refs:
            target = local_target(url)
            if target is None:
                continue
            path, fragment = target
            if not path.resolve().is_relative_to(DIST.resolve()):
                err(f"{tag} {attr} escapes site root: {url}")
            elif not path.exists():
                err(f"broken {tag} {attr}: {url}")
            elif fragment and path.suffix == ".html" and fragment not in ids_cache.get(path, set()):
                err(f"missing fragment #{fragment} in {url}")

    # sitemap
    tree = ElementTree.parse(DIST / "sitemap.xml")
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locs = {el.text for el in tree.getroot().findall("s:url/s:loc", ns)}
    expected = {url_for_file(f) for f in indexable}
    for missing in sorted(expected - locs):
        errors.append(f"sitemap.xml: missing {missing}")
    for extra in sorted(locs - expected):
        errors.append(f"sitemap.xml: unexpected {extra}")
    robots_txt = (DIST / "robots.txt").read_text(encoding="utf-8")
    if f"Sitemap: {BASE}/sitemap.xml" not in robots_txt:
        errors.append("robots.txt does not reference the sitemap")
    if not (DIST / ".well-known" / "security.txt").exists():
        errors.append("missing .well-known/security.txt")
    if not (DIST / "CNAME").exists():
        errors.append("missing CNAME (custom domain would be lost)")

    # secrets anywhere in the published output
    for f in DIST.rglob("*"):
        if f.is_file() and f.suffix in (".html", ".js", ".css", ".json", ".txt", ".xml", ".webmanifest", ""):
            text = f.read_text(encoding="utf-8", errors="ignore")
            for pattern in SECRET_PATTERNS:
                if pattern.search(text):
                    errors.append(f"{f.relative_to(DIST)}: looks like a secret ({pattern.pattern[:20]}…)")

    for w in warnings:
        print(f"warning: {w}")
    for e in errors:
        print(f"ERROR: {e}")
    print(f"Checked {len(pages)} HTML files ({len(indexable)} indexable, {len(redirect_stubs)} redirects): "
          f"{len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
