#!/usr/bin/env python3
"""Build the Zerone International static site into ./dist.

Every language is rendered from the same templates and from content/<lang>.json.
content/en.json is the reference: every other language file must have exactly the
same structure, so a section can never silently disappear in one language.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from markupsafe import Markup, escape

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
TEMPLATES = ROOT / "templates"
STATIC = ROOT / "static"
DIST = ROOT / "dist"
BUILD_META = ROOT / "build"

PAGE_IDS = [
    "home", "services", "service_automation", "service_web", "service_mobile",
    "products", "use_cases", "company", "contact", "privacy", "terms", "cookies",
]
TEMPLATE_FOR = {
    "home": "home.html",
    "services": "services.html",
    "service_automation": "service.html",
    "service_web": "service.html",
    "service_mobile": "service.html",
    "products": "products.html",
    "use_cases": "use_cases.html",
    "company": "company.html",
    "contact": "contact.html",
    "privacy": "legal.html",
    "terms": "legal.html",
    "cookies": "legal.html",
    "case": "use_case.html",
}
PARENT = {
    "service_automation": "services",
    "service_web": "services",
    "service_mobile": "services",
    "case": "use_cases",
}
SERVICE_PAGE = {"automation": "service_automation", "web": "service_web", "mobile": "service_mobile"}
# Which service each of the twenty use cases belongs to (same order in every language).
CASE_SERVICES = [
    "automation", "automation", "automation", "web", "automation",
    "web", "web", "web", "web", "web",
    "web", "mobile", "mobile", "mobile", "automation",
    "web", "automation", "mobile", "web", "automation",
]
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*$")
HASHED_SUFFIXES = {".css", ".js"}


class BuildError(Exception):
    pass


# --------------------------------------------------------------------------- content

def load_json(path: Path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def shape_errors(ref, other, path="$"):
    """Yield differences between the reference structure and another language."""
    if type(ref) is not type(other):
        yield f"{path}: expected {type(ref).__name__}, found {type(other).__name__}"
        return
    if isinstance(ref, dict):
        for key in ref:
            if key not in other:
                yield f"{path}.{key}: missing"
        for key in other:
            if key not in ref:
                yield f"{path}.{key}: not in en.json"
        for key in ref:
            if key in other:
                yield from shape_errors(ref[key], other[key], f"{path}.{key}")
    elif isinstance(ref, list):
        if len(ref) != len(other):
            yield f"{path}: expected {len(ref)} items, found {len(other)}"
        for i, (a, b) in enumerate(zip(ref, other)):
            yield from shape_errors(a, b, f"{path}[{i}]")
    elif isinstance(ref, str):
        if not other.strip():
            yield f"{path}: empty text"


def load_content(config):
    langs = config["languages"]
    default = config["default_language"]
    content = {code: load_json(CONTENT / f"{code}.json") for code in langs}
    errors = []
    ref = content[default]
    for code in langs:
        data = content[code]
        if data["meta"]["code"] != code:
            errors.append(f"{code}: meta.code is {data['meta']['code']!r}")
        errors += [f"{code}: {e}" for e in shape_errors(ref, data)]
        if len(data["cases"]) != len(CASE_SERVICES):
            errors.append(f"{code}: expected {len(CASE_SERVICES)} use cases")
        slugs = list(data["slugs"].values()) + [c["slug"] for c in data["cases"]]
        for slug in slugs:
            if not SLUG_RE.match(slug):
                errors.append(f"{code}: invalid slug {slug!r}")
        case_slugs = [c["slug"] for c in data["cases"]]
        if len(set(case_slugs)) != len(case_slugs):
            errors.append(f"{code}: duplicate use-case slugs")
        if len(set(data["slugs"].values())) != len(data["slugs"]):
            errors.append(f"{code}: duplicate page slugs")
        for page in ("service_automation", "service_web", "service_mobile"):
            if not data["slugs"][page].startswith(data["slugs"]["services"] + "/"):
                errors.append(f"{code}: slug for {page} must live under the services slug")
    if errors:
        raise BuildError("Content problems:\n  " + "\n  ".join(errors))
    return content


# --------------------------------------------------------------------------- urls

class Site:
    def __init__(self, config, content):
        self.config = config
        self.content = content
        self.langs = config["languages"]
        self.default = config["default_language"]
        self.base = config["base_url"].rstrip("/")

    def path(self, lang, page_id, case_index=None):
        data = self.content[lang]
        if page_id == "home":
            slug = ""
        elif page_id == "case":
            slug = f"{data['slugs']['use_cases']}/{data['cases'][case_index]['slug']}"
        else:
            slug = data["slugs"][page_id]
        parts = [p for p in ("" if lang == self.default else lang, slug) if p]
        return "/" + "/".join(parts) + ("/" if parts else "")

    def abs(self, path):
        return self.base + path

    def pages(self):
        """Every (lang, page_id, case_index) that is rendered as an indexable page."""
        for lang in self.langs:
            for page_id in PAGE_IDS:
                yield lang, page_id, None
            for i in range(len(CASE_SERVICES)):
                yield lang, "case", i


# --------------------------------------------------------------------------- assets

def git_date(*paths):
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", *[str(p) for p in paths]],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip()
        return out or None
    except (OSError, subprocess.CalledProcessError):
        return None


def git_commit():
    try:
        sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except OSError:  # no git, e.g. inside the Docker build
        sha = ""
    return sha or os.environ.get("RAILWAY_GIT_COMMIT_SHA") or os.environ.get("GITHUB_SHA") or None


def copy_static():
    manifest = {}
    for src in sorted(STATIC.rglob("*")):
        if src.is_dir():
            continue
        rel = src.relative_to(STATIC)
        if rel.parts[0] == "assets" and src.suffix in HASHED_SUFFIXES:
            digest = hashlib.sha256(src.read_bytes()).hexdigest()[:10]
            out_rel = rel.with_name(f"{src.stem}.{digest}{src.suffix}")
        else:
            out_rel = rel
        dest = DIST / out_rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dest)
        manifest["/" + rel.as_posix()] = "/" + out_rel.as_posix()
    return manifest


def csp(config):
    script = ["'self'"]
    connect = ["'self'"]
    form = ["'self'"]
    if config.get("formspree_form_id"):
        connect.append("https://formspree.io")
        form.append("https://formspree.io")
    if config.get("cloudflare_analytics_token"):
        script.append("https://static.cloudflareinsights.com")
        connect.append("https://cloudflareinsights.com")
    return "; ".join([
        "default-src 'none'",
        f"script-src {' '.join(script)}",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        f"connect-src {' '.join(connect)}",
        "manifest-src 'self'",
        f"form-action {' '.join(form)}",
        "base-uri 'none'",
        "object-src 'none'",
    ])


# --------------------------------------------------------------------------- structured data

def jsonld_script(items):
    text = json.dumps({"@context": "https://schema.org", "@graph": items}, ensure_ascii=False, separators=(",", ":"))
    return Markup(text.replace("</", "<\\/"))


def organization(site):
    c = site.config
    return {
        "@type": "Organization",
        "@id": site.abs("/#organization"),
        "name": c["site_name"],
        "legalName": c["legal_name"],
        "url": site.abs("/"),
        "logo": {"@type": "ImageObject", "url": site.abs("/assets/icons/logo-600.png"), "width": 600, "height": 197},
        "founder": {"@type": "Person", "name": c["founder"]},
        "address": {
            "@type": "PostalAddress",
            "addressLocality": c["address"]["locality"],
            "addressRegion": c["address"]["region"],
            "addressCountry": c["address"]["country"],
        },
        **({"telephone": c["telephone"]} if c.get("telephone") else {}),
        "areaServed": "Worldwide",
        "knowsLanguage": site.langs,
        "contactPoint": {
            "@type": "ContactPoint",
            "contactType": "sales",
            "url": site.abs(site.path(site.default, "contact")),
            "availableLanguage": ["en", "tr"],
            **({"telephone": c["telephone"]} if c.get("telephone") else {}),
        },
        **({"sameAs": c["same_as"]} if c.get("same_as") else {}),
    }


# --------------------------------------------------------------------------- render

def build(check_only=False):
    config = load_json(ROOT / "site.config.json")
    if os.environ.get("ZERONE_LANGS"):  # development shortcut: build a subset of languages
        config["languages"] = os.environ["ZERONE_LANGS"].split(",")
    # Settings can also come from the environment (e.g. GitHub repository variables).
    for key in ("formspree_form_id", "booking_url", "whatsapp_number", "telegram_username", "cloudflare_analytics_token",
                "google_site_verification", "bing_site_verification"):
        value = os.environ.get(f"ZERONE_{key.upper()}")
        if value:
            config[key] = value.strip()
    if config.get("formspree_form_id") and not re.fullmatch(r"[A-Za-z0-9]{6,12}", config["formspree_form_id"]):
        raise BuildError("formspree_form_id must be the short form ID, e.g. 'xayzabcd'")
    checks = {
        "booking_url": r"https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~/%-]*)?",
        "whatsapp_number": r"[0-9]{7,15}",
        "telegram_username": r"[A-Za-z][A-Za-z0-9_]{4,31}",
        "cloudflare_analytics_token": r"[A-Za-z0-9]{16,64}",
        "google_site_verification": r"[A-Za-z0-9_-]{10,100}",
        "bing_site_verification": r"[A-Za-z0-9_-]{10,100}",
        "telephone": r"\+[0-9][0-9-]{6,18}",
        "indexnow_key": r"[a-f0-9]{32}",
    }
    for key, pattern in checks.items():
        if config.get(key) and not re.fullmatch(pattern, config[key]):
            raise BuildError(f"{key} has an unexpected format: {config[key]!r}")
    content = load_content(config)
    site = Site(config, content)
    if check_only:
        print(f"Content OK: {len(site.langs)} languages, identical structure.")
        return

    if DIST.exists():
        shutil.rmtree(DIST)
    if BUILD_META.exists():
        shutil.rmtree(BUILD_META)
    DIST.mkdir()
    BUILD_META.mkdir()
    assets = copy_static()

    env = Environment(
        loader=FileSystemLoader(TEMPLATES),
        autoescape=select_autoescape(["html", "xml", "svg"]),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )

    def asset(path):
        if path not in assets:
            raise BuildError(f"Unknown asset {path}")
        return assets[path]

    def with_link(text, url, label):
        """Insert a link into translated text that contains a {link} placeholder."""
        before, _, after = str(text).partition("{link}")
        return Markup(f"{escape(before)}<a href=\"{escape(url)}\">{escape(label)}</a>{escape(after)}")

    env.filters["with_link"] = with_link
    logo_source = (TEMPLATES / "partials" / "logo.svg").read_text(encoding="utf-8")
    env.globals.update(
        asset=asset,
        config=config,
        csp=csp(config),
        year=dt.date.today().year,
        case_services=CASE_SERVICES,
        service_page=SERVICE_PAGE,
        all_langs=[content[c]["meta"] for c in site.langs],
        # Form answers reach the inbox in English whatever language the visitor used.
        form_en=content[config["default_language"]]["form"],
        logo=lambda suffix: Markup(logo_source.replace("logo-globe", f"logo-globe-{suffix}")),
    )

    template_mtime = git_date(TEMPLATES, STATIC, ROOT / "build.py")
    today = dt.date.today().isoformat()
    lastmod = {}
    for lang in site.langs:
        dates = [d for d in (git_date(CONTENT / f"{lang}.json"), template_mtime) if d]
        lastmod[lang] = max(dates) if dates else today

    sitemap_entries = []
    rendered = 0
    for lang, page_id, case_index in site.pages():
        t = content[lang]
        here = site.path(lang, page_id, case_index)

        def url(target, case=None, _lang=lang):
            return site.path(_lang, target, case)

        alternates = [(code, site.abs(site.path(code, page_id, case_index))) for code in site.langs]
        alternates.append(("x-default", site.abs(site.path(site.default, page_id, case_index))))

        if page_id == "case":
            case = t["cases"][case_index]
            service_key = CASE_SERVICES[case_index]
            page = case
            title = f"{case['title']} | {t['ui']['case_label']} – {config['site_name']}"
            joiner = "" if lang in ("zh", "ja") else " "
            description = f"{case['summary']}{joiner}{case['challenge']}"
            heading = case["title"]
        else:
            case = None
            service_key = next((k for k, v in SERVICE_PAGE.items() if v == page_id), None)
            page = t["pages"][page_id]
            title = page["title"]
            description = page["description"]
            heading = page["h1"]

        crumbs = [(t["ui"]["home"], url("home"))]
        parent = PARENT.get(page_id)
        if parent:
            crumbs.append((t["pages"][parent]["h1"], url(parent)))
        if page_id != "home":
            crumbs.append((heading, here))

        graph = [
            organization(site),
            {
                "@type": "WebSite",
                "@id": site.abs("/#website"),
                "url": site.abs("/"),
                "name": config["site_name"],
                "publisher": {"@id": site.abs("/#organization")},
                "inLanguage": site.langs,
            },
            {
                "@type": "WebPage",
                "@id": site.abs(here) + "#webpage",
                "url": site.abs(here),
                "name": title,
                "description": description,
                "inLanguage": lang,
                "isPartOf": {"@id": site.abs("/#website")},
                "about": {"@id": site.abs("/#organization")},
                **({"breadcrumb": {"@id": site.abs(here) + "#breadcrumb"}} if len(crumbs) > 1 else {}),
            },
        ]
        if len(crumbs) > 1:
            graph.append({
                "@type": "BreadcrumbList",
                "@id": site.abs(here) + "#breadcrumb",
                "itemListElement": [
                    {"@type": "ListItem", "position": i + 1, "name": name, "item": site.abs(link)}
                    for i, (name, link) in enumerate(crumbs)
                ],
            })
        faq = None
        if page_id == "home":
            faq = t["pages"]["home"]["faq"]["items"]
        elif page_id == "services":
            faq = t["pages"]["services"]["faq"]["items"]
        if faq:
            graph.append({
                "@type": "FAQPage",
                "@id": site.abs(here) + "#faq",
                "inLanguage": lang,
                "mainEntity": [
                    {"@type": "Question", "name": item["q"],
                     "acceptedAnswer": {"@type": "Answer", "text": item["a"]}}
                    for item in faq
                ],
            })
        if service_key:
            graph.append({
                "@type": "Service",
                "@id": site.abs(here) + "#service",
                "name": t["services_list"][service_key]["name"],
                "description": description,
                "provider": {"@id": site.abs("/#organization")},
                "areaServed": "Worldwide",
                "url": site.abs(here),
            })
        if page_id == "use_cases":
            graph.append({
                "@type": "ItemList",
                "itemListElement": [
                    {"@type": "ListItem", "position": i + 1, "name": c["title"], "url": site.abs(url("case", i))}
                    for i, c in enumerate(t["cases"])
                ],
            })

        suggest = {
            code: {
                "name": content[code]["meta"]["name"],
                "url": site.path(code, page_id, case_index),
                "msg": content[code]["ui"]["suggest"],
                "go": content[code]["ui"]["suggest_switch"],
                "dismiss": content[code]["ui"]["dismiss"],
            }
            for code in site.langs
        }

        ctx = dict(
            lang=lang,
            meta=t["meta"],
            t=t,
            page=page,
            page_id=page_id,
            case=case,
            case_index=case_index,
            service_key=service_key,
            title=title,
            description=description,
            canonical=site.abs(here),
            here=here,
            url=url,
            abs_url=site.abs,
            alternates=alternates,
            lang_links=[(content[c]["meta"], site.path(c, page_id, case_index)) for c in site.langs],
            crumbs=crumbs,
            jsonld=jsonld_script(graph),
            suggest_json=Markup(json.dumps(suggest, ensure_ascii=False).replace("</", "<\\/")),
            og_locales=[content[c]["meta"]["og_locale"] for c in site.langs if c != lang],
            robots="index,follow",
        )
        html = env.get_template(TEMPLATE_FOR[page_id]).render(**ctx)
        out = DIST / here.lstrip("/") / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")
        rendered += 1
        sitemap_entries.append((site.abs(here), lastmod[lang], alternates))

    # 404 pages: one per language for servers that support it (Railway/nginx),
    # and the root /404.html that GitHub Pages serves for every missing path.
    notfound = {
        code: {
            "title": content[code]["pages"]["notfound"]["title"],
            "h1": content[code]["pages"]["notfound"]["h1"],
            "text": content[code]["pages"]["notfound"]["text"],
            "home": content[code]["pages"]["notfound"]["home"],
            "url": site.path(code, "home"),
            "dir": content[code]["meta"]["dir"],
        }
        for code in site.langs
    }
    for lang in site.langs:
        t = content[lang]
        ctx = dict(
            lang=lang, meta=t["meta"], t=t, page=t["pages"]["notfound"], page_id="notfound",
            title=t["pages"]["notfound"]["title"], description=t["pages"]["notfound"]["text"],
            canonical=None, here=site.path(lang, "home"),
            url=lambda target, case=None, _lang=lang: site.path(_lang, target, case),
            abs_url=site.abs, alternates=[],
            lang_links=[(content[c]["meta"], site.path(c, "home")) for c in site.langs],
            crumbs=[], jsonld=None, suggest_json=None, og_locales=[], robots="noindex,follow",
            notfound_json=Markup(json.dumps(notfound, ensure_ascii=False).replace("</", "<\\/")),
            case=None, case_index=None, service_key=None,
        )
        html = env.get_template("404.html").render(**ctx)
        target = DIST / ("404.html" if lang == site.default else f"{lang}/404.html")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8")

    # Old URLs from the previous site keep working.
    redirects = {"/company.html": site.path(site.default, "company"),
                 "/services.html": site.path(site.default, "services"),
                 "/index.html": "/"}
    for code in site.langs:
        if code != site.default:
            redirects[f"/{code}.html"] = site.path(code, "home")
    redirect_tpl = env.get_template("redirect.html")
    for old, new in redirects.items():
        if old == "/index.html":
            continue  # served by the new home page itself
        (DIST / old.lstrip("/")).write_text(
            redirect_tpl.render(target=new, absolute=site.abs(new)), encoding="utf-8")
    # /index.html is excluded: nginx serves "/" through it internally, a redirect would loop.
    (BUILD_META / "redirects.conf").write_text(
        "".join(f"location = {old} {{ return 301 {new}; }}\n"
                for old, new in redirects.items() if old != "/index.html"),
        encoding="utf-8")
    # Server-side CSP for Railway/nginx: the meta tag in each page stays the stricter one,
    # the header adds frame-ancestors (not allowed in <meta>) and allows every optional service.
    header_csp = csp({**config, "formspree_form_id": "x", "cloudflare_analytics_token": "x"})
    header_csp += "; frame-ancestors 'none'; upgrade-insecure-requests"
    (BUILD_META / "csp.conf").write_text(
        f'add_header Content-Security-Policy "{header_csp}" always;\n', encoding="utf-8")
    langs_re = "|".join(c for c in site.langs if c != site.default)
    (BUILD_META / "languages.conf").write_text(
        f"map $uri $zerone_not_found {{\n    default /404.html;\n    ~^/({langs_re})/ /$1/404.html;\n}}\n",
        encoding="utf-8")

    # sitemap.xml with hreflang alternates
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
             'xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for loc, mod, alts in sitemap_entries:
        lines.append(f"<url><loc>{xml_escape(loc)}</loc><lastmod>{mod}</lastmod>")
        for code, href in alts:
            lines.append(f'<xhtml:link rel="alternate" hreflang="{code}" href="{xml_escape(href)}"/>')
        lines.append("</url>")
    lines.append("</urlset>")
    (DIST / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")

    (DIST / "robots.txt").write_text(
        f"User-agent: *\nAllow: /\n\nSitemap: {site.abs('/sitemap.xml')}\n", encoding="utf-8")

    expires = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=365)).strftime("%Y-%m-%dT00:00:00Z")
    well_known = DIST / ".well-known"
    well_known.mkdir(exist_ok=True)
    (well_known / "security.txt").write_text(
        f"Contact: {site.abs(site.path(site.default, 'contact'))}\n"
        f"Expires: {expires}\n"
        "Preferred-Languages: en, tr\n"
        f"Canonical: {site.abs('/.well-known/security.txt')}\n"
        f"Policy: {site.abs(site.path(site.default, 'terms'))}\n",
        encoding="utf-8")

    en = content[site.default]
    (DIST / "manifest.webmanifest").write_text(json.dumps({
        "name": config["legal_name"],
        "short_name": config["site_name"],
        "description": en["pages"]["home"]["description"],
        "start_url": "/",
        "scope": "/",
        "display": "minimal-ui",
        "background_color": "#f5f6f8",
        "theme_color": "#203a4b",
        "icons": [
            {"src": "/assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/assets/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }, indent=2), encoding="utf-8")

    if config.get("indexnow_key"):  # proves ownership to Bing/IndexNow; the key is public by design
        (DIST / f"{config['indexnow_key']}.txt").write_text(config["indexnow_key"], encoding="utf-8")
    (DIST / ".nojekyll").write_text("", encoding="utf-8")
    cname = ROOT / "CNAME"
    if cname.exists():
        shutil.copyfile(cname, DIST / "CNAME")

    build_info = {
        "commit": git_commit(),
        "built_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "languages": site.langs,
        "pages": rendered,
        "formspree_configured": bool(config.get("formspree_form_id")),
    }
    (BUILD_META / "build-info.json").write_text(json.dumps(build_info, indent=2), encoding="utf-8")
    print(f"Built {rendered} pages in {len(site.langs)} languages into {DIST.relative_to(ROOT)}/")
    if not config.get("formspree_form_id"):
        print("WARNING: formspree_form_id is empty in site.config.json - forms fall back to e-mail.")


if __name__ == "__main__":
    try:
        build(check_only="--check" in sys.argv)
    except BuildError as exc:
        print(f"BUILD FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
