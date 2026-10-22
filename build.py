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

import markdown
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from markupsafe import Markup, escape

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
TEMPLATES = ROOT / "templates"
STATIC = ROOT / "static"
DIST = ROOT / "dist"
BUILD_META = ROOT / "build"
BLOG = CONTENT / "blog"
# Small-business plans: English-only pages under /plans/ (content/plans/*.md); /local/ was the old path.
PLANS = CONTENT / "plans"
PLANS_PATH = "/plans/"
PLANS_ORDER = ["index", "pricing", "long-island", "suffolk-county", "nassau-county", "the-hamptons", "manhattan",
               "privacy", "terms"]
# Region plan pages linked site-wide ("Where we work"): slug -> place name (a proper noun, not translated).
REGION_PAGES = {"long-island": "Long Island", "suffolk-county": "Suffolk County", "nassau-county": "Nassau County",
                "the-hamptons": "The Hamptons", "manhattan": "Manhattan"}
# Free tools: English-only pages under /tools/ (content/tools/*.md), same front matter as the plan pages.
TOOLS = CONTENT / "tools"
TOOLS_PATH = "/tools/"
TOOLS_ORDER = ["index", "missed-call-calculator", "google-business-profile-checklist"]
# English search titles and descriptions for local-service use cases (the other languages keep the
# translated "<title> | Use case" pattern): slug -> (title tag, meta description).
CASE_SEO = {
    "after-hours-calls-for-contractors": (
        "After-Hours Call Answering for Contractors – LI & NYC",
        "Contractors miss calls while they work. An AI assistant answers 24/7, asks your intake questions and "
        "texts you urgent jobs right away."),
    "website-for-home-services": (
        "Websites for Home Service Companies – Long Island & NYC",
        "A fast, mobile-friendly website with your services, service areas, real photos and one-tap call and "
        "quote buttons, plus Google profile care."),
    "restaurant-phone-calls": (
        "Restaurant Phone Answering with AI – Hours & Reservations",
        "Answer questions about hours, the menu and reservations during the dinner rush, with a written note "
        "for the staff after every call."),
    "ai-receptionist-for-offices": (
        "AI Receptionist for Professional Offices – After Hours",
        "An AI assistant answers when the line is busy or the office is closed, says it is an AI and sends each "
        "appointment request in writing."),
}
# Local guides (English plan pages) linked from related use cases: use-case slug -> plan page slug.
CASE_GUIDES = {
    "after-hours-calls-for-contractors": "long-island/ai-receptionist-home-services",
    "website-for-home-services": "long-island/contractor-websites",
    "google-business-profile-cleanup": "suffolk-county/google-business-profile",
}
# Local-service use cases (English slugs) that also link the region pages.
REGION_CASES = ["website-for-home-services", "ai-receptionist-for-offices", "after-hours-calls-for-contractors",
                "restaurant-phone-calls"]
# Old paths that moved (content/redirects.json): "/old/path/" -> "/new/path/".
REDIRECTS = CONTENT / "redirects.json"
# Based in New York, serving the whole country: New York City and Long Island first.
AREA_SERVED = [
    {"@type": "Country", "name": "United States"},
    {"@type": "City", "name": "New York City"},
    {"@type": "AdministrativeArea", "name": "Nassau County, New York"},
    {"@type": "AdministrativeArea", "name": "Suffolk County, New York"},
]

PAGE_IDS = [
    "home", "services", "service_presence", "service_phone", "service_automation", "service_web",
    "service_mobile", "products", "use_cases", "company", "contact", "payment", "blog", "developers",
    "privacy", "terms", "cookies",
]
TEMPLATE_FOR = {
    "home": "home.html",
    "services": "services.html",
    "service_presence": "service.html",
    "service_phone": "service.html",
    "service_automation": "service.html",
    "service_web": "service.html",
    "service_mobile": "service.html",
    "products": "products.html",
    "use_cases": "use_cases.html",
    "company": "company.html",
    "contact": "contact.html",
    "payment": "payment.html",
    "blog": "blog.html",
    "developers": "developers.html",
    "privacy": "legal.html",
    "terms": "legal.html",
    "cookies": "legal.html",
    "case": "use_case.html",
}
PARENT = {
    "service_presence": "services",
    "service_phone": "services",
    "service_automation": "services",
    "service_web": "services",
    "service_mobile": "services",
    "case": "use_cases",
}
SERVICE_PAGE = {"presence": "service_presence", "phone": "service_phone", "automation": "service_automation",
                "web": "service_web", "mobile": "service_mobile"}
# Which service each of the twenty use cases belongs to (same order in every language).
CASE_SERVICES = ["presence"] * 4 + ["phone"] * 4 + ["automation"] * 4 + ["web"] * 4 + ["mobile"] * 4
# Optional portrait for the company page; the founder section works without it.
FOUNDER_PHOTO = "/assets/img/founder.jpg"
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*$")
HASHED_SUFFIXES = {".css", ".js"}
# The AI sales assistant (see docs/ASISTAN.md) is published only when site.config.json has an
# assistant_endpoint; until then its files are left out of dist/ and the CSP stays unchanged.
ASSISTANT_ASSETS = {"assets/js/assistant.js", "assets/css/assistant.css"}
TURNSTILE_ORIGIN = "https://challenges.cloudflare.com"
LINK_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


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
        for page in SERVICE_PAGE.values():
            if not data["slugs"][page].startswith(data["slugs"]["services"] + "/"):
                errors.append(f"{code}: slug for {page} must live under the services slug")
    if errors:
        raise BuildError("Content problems:\n  " + "\n  ".join(errors))
    return content


FRONT_MATTER_RE = re.compile(r"\A---\n(.*?)\n---\n", re.S)


def load_posts():
    """Blog posts: content/blog/<slug>.md with 'key: value' front matter (title, description, date, tags)."""
    posts = []
    for path in sorted(BLOG.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        match = FRONT_MATTER_RE.match(text)
        if not match:
            raise BuildError(f"{path.name}: missing '---' front matter")
        meta = {}
        for line in match.group(1).splitlines():
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
        for key in ("title", "description", "date"):
            if not meta.get(key):
                raise BuildError(f"{path.name}: front matter needs '{key}'")
        if not SLUG_RE.match(path.stem):
            raise BuildError(f"{path.name}: file name must be a lowercase slug")
        try:
            published = dt.date.fromisoformat(meta["date"])
            updated = dt.date.fromisoformat(meta.get("updated") or meta["date"])
        except ValueError as exc:
            raise BuildError(f"{path.name}: dates must look like 2026-10-11 ({exc})") from None
        body = text[match.end():]
        posts.append({
            "slug": path.stem,
            "title": meta["title"],
            "description": meta["description"],
            "date": published.isoformat(),
            "updated": max(published, updated).isoformat(),
            "tags": [tag.strip() for tag in meta.get("tags", "").split(",") if tag.strip()],
            "minutes": max(1, round(len(re.findall(r"\w+", body)) / 220)),
            "faq": faq_items(body),
            "html": Markup(markdown.markdown(body, extensions=["extra", "sane_lists"], output_format="html")),
        })
    posts.sort(key=lambda p: (p["date"], p["title"]), reverse=True)
    for post in posts:
        post["related"] = related_posts(post, posts)
    return posts


FAQ_HEADING_RE = re.compile(r"^## (?:FAQ|Frequently asked questions)\s*$", re.M | re.I)


def faq_items(body):
    """Question/answer pairs from a markdown '## FAQ' section ('### Question' + answer paragraphs),
    as plain text for FAQPage structured data. The section stays visible on the page as written."""
    match = FAQ_HEADING_RE.search(body)
    if not match:
        return []
    section = re.split(r"^## ", body[match.end():], maxsplit=1, flags=re.M)[0]
    items = []
    for block in re.split(r"^### ", section, flags=re.M)[1:]:
        question, _, answer = block.partition("\n")
        answer = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", answer)  # [text](url) -> text
        answer = re.sub(r"[*_`]", "", " ".join(answer.split()))
        if question.strip() and answer:
            items.append((question.strip(), answer))
    return items


def load_section_pages(folder, base_path, order, label):
    """English-only markdown pages of a site section: <folder>/<slug>.md, with index.md as the hub.

    Front matter: title, description, nav (label in the section menu), updated; optional heading (the H1
    when it should differ from the title tag), version (legal texts), script (a page script under
    /assets/js/), service (adds Service structured data with that name). Files in sub-folders become
    nested pages (plans/long-island/contractor-websites.md -> /plans/long-island/contractor-websites/)
    and stay out of the section menu. Top-level pages follow `order`, any others alphabetically."""
    pages = []
    for path in folder.rglob("*.md"):
        slug = path.relative_to(folder).with_suffix("").as_posix()
        text = path.read_text(encoding="utf-8")
        match = FRONT_MATTER_RE.match(text)
        if not match:
            raise BuildError(f"{label}/{slug}.md: missing '---' front matter")
        meta = {}
        for line in match.group(1).splitlines():
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
        for key in ("title", "description", "nav", "updated"):
            if not meta.get(key):
                raise BuildError(f"{label}/{slug}.md: front matter needs '{key}'")
        if not SLUG_RE.match(slug) or slug.endswith("/index"):
            raise BuildError(f"{label}/{slug}.md: file names must be lowercase slugs")
        try:
            updated = dt.date.fromisoformat(meta["updated"]).isoformat()
        except ValueError as exc:
            raise BuildError(f"{label}/{slug}.md: dates must look like 2026-10-17 ({exc})") from None
        script = meta.get("script", "")
        if script and not re.fullmatch(r"/assets/js/[a-z0-9-]+\.js", script):
            raise BuildError(f"{label}/{slug}.md: script must look like /assets/js/name.js")
        body = text[match.end():]
        parent = slug.rpartition("/")[0]
        pages.append({
            "slug": slug,
            "path": base_path if slug == "index" else f"{base_path}{slug}/",
            "parent": parent,
            "title": meta["title"],
            "heading": meta.get("heading") or meta["title"],
            "description": meta["description"],
            "nav": meta["nav"],
            "version": meta.get("version", ""),
            "script": script,
            "service": meta.get("service", ""),
            "updated": updated,
            "faq": faq_items(body),
            "html": Markup(markdown.markdown(body, extensions=["extra", "sane_lists"], output_format="html")),
        })
    rank = {slug: i for i, slug in enumerate(order)}
    pages.sort(key=lambda page: (rank.get(page["slug"].partition("/")[0], len(rank)), page["slug"]))
    if pages and pages[0]["slug"] != "index":
        raise BuildError(f"content/{label}/ needs an index.md for the hub page")
    slugs = {page["slug"] for page in pages}
    for page in pages:
        if page["parent"] and page["parent"] not in slugs:
            raise BuildError(f"{label}/{page['slug']}.md: needs a {page['parent']}.md parent page")
    return pages


def load_plan_pages():
    """Small-business plan pages, English only: content/plans/<slug>.md, with index.md as the /plans/ hub."""
    return load_section_pages(PLANS, PLANS_PATH, PLANS_ORDER, "plans")


def load_tool_pages():
    """Free tools, English only: content/tools/<slug>.md, with index.md as the /tools/ hub."""
    return load_section_pages(TOOLS, TOOLS_PATH, TOOLS_ORDER, "tools")


def load_redirects():
    """Moved paths from content/redirects.json; both sides must be site paths ending in '/'."""
    redirects = load_json(REDIRECTS)
    for old, new in redirects.items():
        for path in (old, new):
            if not re.fullmatch(r"/([a-z0-9-]+/)*", path):
                raise BuildError(f"redirects.json: {path!r} must look like /some/path/")
    return redirects


def related_posts(post, posts, limit=3):
    """Other posts that share the most tags with this one, newest first among equals."""
    tags = {tag.lower() for tag in post["tags"]}
    others = [p for p in posts if p["slug"] != post["slug"]]
    # posts is already sorted newest first, so a stable sort keeps recency as the tie-breaker.
    others.sort(key=lambda p: -len(tags & {tag.lower() for tag in p["tags"]}))
    return others[:limit]


def page_title(name, *suffixes, limit=60, keep_brand=False):
    """'name | suffix' with the first (longest) suffix that keeps the title within the limit.

    When none fits, the bare name is used, or the last (shortest) suffix with keep_brand."""
    for suffix in suffixes:
        title = f"{name} | {suffix}"
        if len(title) <= limit:
            return title
    return f"{name} | {suffixes[-1]}" if keep_brand else name


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

    def post_path(self, slug):
        """Blog posts are published in the default language only, under its blog index."""
        return f"{self.path(self.default, 'blog')}{slug}/"

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


def copy_static(skip=()):
    manifest = {}
    for src in sorted(STATIC.rglob("*")):
        if src.is_dir():
            continue
        rel = src.relative_to(STATIC)
        if rel.as_posix() in skip:
            continue
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


def origin_of(url):
    """'https://host[:port]' of an absolute URL (the assistant endpoint is validated before this runs)."""
    match = re.match(r"https://[^/]+", url)
    if not match:
        raise BuildError(f"not an https URL: {url!r}")
    return match.group(0)


def csp(config):
    script = ["'self'"]
    connect = ["'self'"]
    form = ["'self'"]
    frame = []
    if config.get("formspree_form_id"):
        connect.append("https://formspree.io")
        form.append("https://formspree.io")
    if config.get("cloudflare_analytics_token"):
        script.append("https://static.cloudflareinsights.com")
        connect.append("https://cloudflareinsights.com")
    if config.get("assistant_endpoint"):
        # Chat requests go to the Cloudflare Worker; Turnstile (bot check) runs a script and an iframe.
        connect.append(origin_of(config["assistant_endpoint"]))
        script.append(TURNSTILE_ORIGIN)
        frame.append(TURNSTILE_ORIGIN)
    return "; ".join([
        "default-src 'none'",
        f"script-src {' '.join(script)}",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        f"connect-src {' '.join(connect)}",
        *([f"frame-src {' '.join(frame)}"] if frame else []),
        "manifest-src 'self'",
        f"form-action {' '.join(form)}",
        "base-uri 'none'",
        "object-src 'none'",
    ])


# --------------------------------------------------------------------------- AI sales assistant

PAGE_DESCRIPTIONS = {
    "home": "Home page: overview of services, where we work, use cases and FAQ",
    "services": "Overview of all services, with the services FAQ",
    "service_presence": "Websites & Google presence: websites, Google Business Profile, local SEO, reviews, monthly plans",
    "service_phone": "AI phone assistant: answers calls 24/7, questions, messages, appointments, call summaries",
    "service_automation": "Automation & bots: data entry, documents, notifications, scheduled tasks, integrations",
    "service_web": "Web applications: dashboards, internal tools, customer portals with user roles",
    "service_mobile": "Mobile apps: iOS and Android apps for teams on site, in the field or on the road",
    "products": "Our own products: Ava the AI receptionist and business automation kits (early-access list)",
    "use_cases": "All 20 use cases: websites, AI phone assistant, automation, web and mobile apps",
    "company": "About the company: who we are, vision, mission, values, location",
    "contact": "Contact form to start a project or ask for a quote",
    "payment": "Pay an invoice: card via Stripe, Square invoices, PayPal",
    "blog": "Blog with guides on websites, Google Business Profile, local SEO, AI receptionists and automation",
    "developers": "Planned business-automation APIs (Ava call summaries, lead webhooks, documents, reports) and the developer early-access list",
    "privacy": "Privacy policy (also covers this AI assistant)",
    "terms": "Terms of use",
    "cookies": "Cookie policy",
}


def assistant_catalog(site, config, posts, plan_pages=()):
    """Every link the assistant may hand out: id -> {desc, urls per language, labels per language}.

    The Worker shows the model only these ids and maps the ids it returns back to URLs; the widget
    accepts a link only when it matches this catalogue too. Nothing else can become a link."""
    langs = site.langs
    content = site.content
    links = {}

    def page_label(t, pid):
        if pid == "home":
            return t["ui"]["home"]
        if pid in SERVICE_PAGE.values():
            key = next(k for k, v in SERVICE_PAGE.items() if v == pid)
            return t["services_list"][key]["name"]
        if pid in t["nav"]:
            return t["nav"][pid]
        return t["pages"][pid]["h1"]

    for pid in PAGE_IDS:
        links[pid] = {
            "desc": PAGE_DESCRIPTIONS[pid],
            "urls": {code: site.abs(site.path(code, pid)) for code in langs},
            "labels": {code: page_label(content[code], pid) for code in langs},
        }
    en = content[site.default]
    for i, case in enumerate(en["cases"]):
        links[f"case{i + 1}"] = {
            "desc": f"Use case: {case['title']} ({CASE_SERVICES[i]})",
            "urls": {code: site.abs(site.path(code, "case", i)) for code in langs},
            "labels": {code: content[code]["cases"][i]["title"] for code in langs},
        }

    def external(link_id, url, desc, label):
        links[link_id] = {
            "desc": desc,
            "urls": {code: url for code in langs},
            "labels": {code: label(content[code]) for code in langs},
        }

    if config.get("booking_url"):
        external("booking", config["booking_url"], "Book a call with the team (calendar)",
                 lambda t: t["pages"]["contact"]["booking"])
    if config.get("whatsapp_number"):
        external("whatsapp", f"https://wa.me/{config['whatsapp_number']}", "Message the team on WhatsApp",
                 lambda t: t["pages"]["contact"]["whatsapp"])
    if config.get("telegram_username"):
        external("telegram", f"https://t.me/{config['telegram_username']}", "Message the team on Telegram",
                 lambda t: t["pages"]["contact"]["telegram"])
    if config.get("stripe_payment_url"):
        external("pay_card", config["stripe_payment_url"], "Pay an invoice or quote by card on Stripe's page",
                 lambda t: t["pages"]["payment"]["stripe"]["button"])
    if config.get("square_payment_url"):
        external("pay_square", config["square_payment_url"], "Pay on Square's page",
                 lambda t: t["pages"]["payment"]["square"]["button"])
    if config.get("paypal_url"):
        external("pay_paypal", config["paypal_url"], "Pay an invoice with PayPal",
                 lambda t: t["pages"]["payment"]["paypal"]["button"])
    for page in plan_pages:  # English only, so every language links to the same page
        section = "tools" if page["path"].startswith(TOOLS_PATH) else "plans"
        link_id = section if page["slug"] == "index" else f"{section}_{page['slug'].replace('/', '-')}"
        kind = "Free tool" if section == "tools" else "Small-business plans"
        hub_label = (lambda code: content[code]["footer"]["tools"]) if section == "tools" else (
            lambda code: content[code]["nav"]["plans"])
        links[link_id] = {
            "desc": f"{kind} (English page): {page['title']} – {page['description']}",
            "urls": {code: site.abs(page["path"]) for code in langs},
            "labels": {code: (hub_label(code) if page["slug"] == "index" else page["title"]) for code in langs},
        }
    for post in posts:
        url = site.abs(site.post_path(post["slug"]))
        links[f"post-{post['slug']}"[:64]] = {
            "desc": f"Blog post (English): {post['title']}",
            "urls": {code: url for code in langs},
            "labels": {code: post["title"] for code in langs},
        }
    for link_id in links:
        if not LINK_ID_RE.match(link_id):
            raise BuildError(f"assistant link id {link_id!r} is not a short lowercase id")
    return links


def assistant_knowledge(site, config):
    """Business facts for the assistant's system prompt, in English, taken from content/en.json."""
    t = site.content[site.default]
    p = t["pages"]
    out = []
    add = out.append
    add(f"Company: {config['legal_name']} ({config['site_name']}), founded by {config['founder']}, "
        f"based in {config['address']['locality']}, {config['address']['region']}, {config['address']['country']}; "
        "serves businesses across the United States: New York City (Manhattan, Brooklyn, Queens, the Bronx, Staten "
        "Island) and Long Island (Nassau, Suffolk, the Hamptons) first, where in-person meetings are possible, and "
        "every other state remotely. The website is in 15 languages; the team communicates in English and Turkish.")
    add(" ".join(p["company"]["about"]["text"]))
    add(f"Mission: {p['company']['mission']['text']}")
    add("Values: " + "; ".join(f"{v['title']}: {v['text']}" for v in p["company"]["values"]["items"]))
    add("\nSERVICES")
    for key, page_id in SERVICE_PAGE.items():
        service = t["services_list"][key]
        page = p[page_id]
        add(f"- {service['name']} (link id {page_id}): {service['short']} {page['lede']}")
        add("  Features: " + "; ".join(f"{f['title']} ({f['text']})" for f in page["features"]))
        add("  Notes: " + " ".join(page["notes"]))
    add(f"Role-based access: {t['roles']['intro']} " + "; ".join(f"{r['title']}: {r['text']}" for r in t["roles"]["items"]))
    add(f"Where we work: {p['home']['reach']['text']} " + "; ".join(p["home"]["reach"]["areas"]))
    add("Small-business plans (websites, Google Business Profile, reviews, AI phone add-on) are described in English "
        "on the plans pages (link ids plans and plans_pricing): Starter from $149 a month, Growth from $249 a month, "
        "AI phone assistant add-on +$149 a month; prices exclude applicable sales tax.")
    add("\nOUR OWN PRODUCTS (Ava answers our own line; both are opening to clients step by step; visitors can join the early-access list on the products page)")
    add(p["products"]["lede"])
    for item in p["products"]["items"]:
        add(f"- {item['name']}: {item['text']} Planned features: " + "; ".join(item["features"]))
    add("\nPLANNED DEVELOPER APIS (plans only, nothing is live; early-access list on the developers page)")
    add(p["developers"]["products"]["intro"])
    for item in p["developers"]["products"]["items"]:
        add(f"- {item['name']}: {item['text']}")
    add("Access model: " + "; ".join(f"{a['title']}: {a['text']}" for a in p["developers"]["access"]["items"]))
    add("\nPROCESS")
    add(t["process"]["intro"])
    for i, step in enumerate(t["process"]["steps"], 1):
        add(f"{i}. {step['title']}: {step['text']}")
    add(p["contact"]["lede"])
    add("\nPAYMENTS (hosted payment pages only; the website never sees card details)")
    pay = p["payment"]
    add(pay["lede"])
    if config.get("stripe_payment_url"):
        add(f"- {pay['stripe']['title']} (link id pay_card): {pay['stripe']['text']}")
    add(f"- {pay['square']['title']}: {pay['square']['text']} {pay['square']['note']}")
    if config.get("paypal_url"):
        add(f"- {pay['paypal']['title']} (link id pay_paypal): {pay['paypal']['text']}")
    add("Security: " + " ".join(pay["security"]["items"]))
    add("\nFREQUENTLY ASKED QUESTIONS (published answers; you may repeat them, as indications only)")
    faqs = p["home"]["faq"]["items"] + p["services"]["faq"]["items"] + pay["faq"]["items"] + p["developers"]["faq"]["items"]
    for item in faqs:
        add(f"Q: {item['q']} A: {item['a']}")
    add("\nCONTACT")
    add("Contact form on the contact page (link id contact); we aim to reply within two business days.")
    add(f"E-mail: {config['email_user']}@{config['email_domain']}")
    if config.get("telephone"):
        add(f"Phone: {config['telephone']} (answered 24/7 by Ava, our AI phone assistant, in English)")
    if config.get("sms_number"):
        add(f"Text messages (SMS): {config['sms_number']} (read and answered by the team)")
    for key, label, link_id in (("booking_url", "Book a call", "booking"), ("whatsapp_number", "WhatsApp", "whatsapp"),
                                ("telegram_username", "Telegram", "telegram")):
        if config.get(key):
            add(f"{label}: link id {link_id}")
    return "\n".join(out)


def assistant_data(site, config, posts, plan_pages=()):
    """Everything the Worker needs from the site: the link catalogue and the business facts."""
    data = {
        "languages": site.langs,
        "default_language": site.default,
        "base_url": site.base,
        "links": assistant_catalog(site, config, posts, plan_pages),
        "knowledge": assistant_knowledge(site, config),
    }
    data["version"] = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:10]
    return data


# --------------------------------------------------------------------------- structured data

def jsonld_script(items):
    text = json.dumps({"@context": "https://schema.org", "@graph": items}, ensure_ascii=False, separators=(",", ":"))
    return Markup(text.replace("</", "<\\/"))


def organization(site):
    c = site.config
    return {
        # ProfessionalService is a LocalBusiness: lets Google tie the site to the Long Island / NYC service area.
        # Locality only: the street address is never published.
        "@type": ["Organization", "ProfessionalService"],
        "@id": site.abs("/#organization"),
        "name": c["site_name"],
        "legalName": c["legal_name"],
        "url": site.abs("/"),
        "logo": {"@type": "ImageObject", "url": site.abs("/assets/icons/logo-600.png"), "width": 600, "height": 197},
        "founder": {"@type": "Person", "@id": site.abs("/#founder"), "name": c["founder"]},
        "address": {
            "@type": "PostalAddress",
            "addressLocality": c["address"]["locality"],
            "addressRegion": c["address"]["region"],
            "addressCountry": c["address"]["country"],
            **({"postalCode": c["address"]["postal_code"]} if c["address"].get("postal_code") else {}),
        },
        **({"telephone": c["telephone"]} if c.get("telephone") else {}),
        "priceRange": "$$",
        "image": site.abs("/assets/icons/logo-600.png"),
        "areaServed": AREA_SERVED,
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
    for key in ("formspree_form_id", "booking_url", "whatsapp_number", "telegram_username", "paypal_url",
                "square_payment_url", "stripe_payment_url", "cloudflare_analytics_token",
                "google_site_verification", "bing_site_verification",
                "assistant_endpoint", "assistant_turnstile_sitekey"):
        value = os.environ.get(f"ZERONE_{key.upper()}")
        if value:
            config[key] = value.strip()
    if config.get("formspree_form_id") and not re.fullmatch(r"[A-Za-z0-9]{6,12}", config["formspree_form_id"]):
        raise BuildError("formspree_form_id must be the short form ID, e.g. 'xayzabcd'")
    checks = {
        "booking_url": r"https://[A-Za-z0-9.-]+(/[A-Za-z0-9._~/%-]*)?",
        "whatsapp_number": r"[0-9]{7,15}",
        "telegram_username": r"[A-Za-z][A-Za-z0-9_]{4,31}",
        # Hosted payment pages only: the card form always lives on Stripe's, Square's or PayPal's own domain.
        "paypal_url": r"https://(www\.)?(paypal\.com|paypal\.me|paypal\.biz)/[A-Za-z0-9._/?=&-]+",
        "square_payment_url": r"https://(square\.link|checkout\.square\.site|squareup\.com)/[A-Za-z0-9._/?=&-]+",
        "stripe_payment_url": r"https://buy\.stripe\.com/[A-Za-z0-9_-]+",
        "cloudflare_analytics_token": r"[A-Za-z0-9]{16,64}",
        "google_site_verification": r"[A-Za-z0-9_-]{10,100}",
        "bing_site_verification": r"[A-Za-z0-9_-]{10,100}",
        "telephone": r"\+[0-9][0-9-]{6,18}",
        "founder_linkedin": r"https://www\.linkedin\.com/in/[A-Za-z0-9-]+/",
        "youtube_url": r"https://www\.youtube\.com/@[A-Za-z0-9._-]+",
        "sms_number": r"\+[0-9][0-9-]{6,18}",
        "indexnow_key": r"[a-f0-9]{32}",
        # The Cloudflare Worker of the AI assistant, e.g. https://zerone-assistant.<account>.workers.dev
        "assistant_endpoint": r"https://[A-Za-z0-9.-]+(:[0-9]{2,5})?(/[A-Za-z0-9._~-]+)*/?",
        "assistant_turnstile_sitekey": r"[0-9]x[A-Za-z0-9_-]{8,64}",
    }
    for key, pattern in checks.items():
        if config.get(key) and not re.fullmatch(pattern, config[key]):
            raise BuildError(f"{key} has an unexpected format: {config[key]!r}")
    content = load_content(config)
    site = Site(config, content)
    posts = load_posts()
    plan_pages = load_plan_pages()
    tool_pages = load_tool_pages()
    moved = load_redirects()
    if check_only:
        print(f"Content OK: {len(site.langs)} languages, identical structure.")
        return

    if DIST.exists():
        shutil.rmtree(DIST)
    if BUILD_META.exists():
        shutil.rmtree(BUILD_META)
    DIST.mkdir()
    BUILD_META.mkdir()
    assistant_on = bool(config.get("assistant_endpoint"))
    assets = copy_static(skip=() if assistant_on else ASSISTANT_ASSETS)
    founder_photo = FOUNDER_PHOTO in assets

    # The Worker is deployed with this file (.github/workflows/assistant-deploy.yml), also while
    # the widget is still switched off on the site.
    worker_data = assistant_data(site, config, posts, plan_pages + tool_pages)
    (BUILD_META / "assistant-data.json").write_text(
        json.dumps(worker_data, ensure_ascii=False, indent=1), encoding="utf-8")
    assistant_json = None
    if assistant_on:
        public = {"version": worker_data["version"],
                  "links": {k: {"urls": v["urls"], "labels": v["labels"]} for k, v in worker_data["links"].items()}}
        text = json.dumps(public, ensure_ascii=False, separators=(",", ":"))
        catalog_path = f"/assets/assistant-catalog.{hashlib.sha256(text.encode()).hexdigest()[:10]}.json"
        (DIST / catalog_path.lstrip("/")).write_text(text, encoding="utf-8")

        def assistant_json(lang):
            """Settings and texts for the chat widget, embedded in each page as JSON (never as script)."""
            t = content[lang]
            settings = {
                "endpoint": config["assistant_endpoint"].rstrip("/"),
                "sitekey": config.get("assistant_turnstile_sitekey", ""),
                "lang": lang,
                "dir": t["meta"]["dir"],
                "catalog": catalog_path,
                "privacy": site.path(lang, "privacy"),
                "contact": site.path(lang, "contact"),
                "t": {**t["assistant"], "privacy": t["pages"]["privacy"]["h1"],
                      "consent_link": t["form"]["consent_link"], "name": t["form"]["name"],
                      "contact": t["nav"]["contact"]},
            }
            return Markup(json.dumps(settings, ensure_ascii=False).replace("</", "<\\/"))

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
        assistant=assistant_on,
        assistant_json=assistant_json,
        year=dt.date.today().year,
        case_services=CASE_SERVICES,
        service_page=SERVICE_PAGE,
        all_langs=[content[c]["meta"] for c in site.langs],
        # Form answers reach the inbox in English whatever language the visitor used.
        form_en=content[config["default_language"]]["form"],
        post_url=lambda slug: site.post_path(slug),
        plans_path=PLANS_PATH,
        tools_path=TOOLS_PATH,
        regions=[(PLANS_PATH + slug + "/", name) for slug, name in REGION_PAGES.items()],
        region_cases={i for i, c in enumerate(content[config["default_language"]]["cases"]) if c["slug"] in REGION_CASES},
        case_guides={i: next((PLANS_PATH + p["slug"] + "/", p["heading"]) for p in plan_pages if p["slug"] == CASE_GUIDES[c["slug"]])
                     for i, c in enumerate(content[config["default_language"]]["cases"]) if c["slug"] in CASE_GUIDES},
        founder_photo=FOUNDER_PHOTO if FOUNDER_PHOTO in assets else None,
        founder_photo_webp=FOUNDER_PHOTO.replace(".jpg", ".webp"),
        logo=lambda suffix: Markup(logo_source.replace("logo-globe", f"logo-globe-{suffix}")),
    )

    template_mtime = git_date(TEMPLATES, STATIC, ROOT / "build.py")
    today = dt.date.today().isoformat()
    lastmod = {}
    for lang in site.langs:
        dates = [d for d in (git_date(CONTENT / f"{lang}.json"), template_mtime) if d]
        lastmod[lang] = max(dates) if dates else today
    newest_post = max((p["updated"] for p in posts), default=None)
    feed_path = site.path(site.default, "blog") + "feed.xml"
    env.globals["site_feed"] = feed_path  # every page advertises the (English) blog feed
    env.globals["page_script"] = ""  # only the free tools load a page script

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
            label = t["ui"]["case_label"]
            title = page_title(case["title"], f"{label} – {config['site_name']}", f"{label} – Zerone", keep_brand=True)
            joiner = "" if lang in ("zh", "ja") else " "
            description = f"{case['summary']}{joiner}{case['challenge']}"
            if lang == "en" and case["slug"] in CASE_SEO:
                title, description = CASE_SEO[case["slug"]]
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
            crumbs.append((t["nav"]["blog"] if page_id == "blog" else heading, here))

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
        elif page_id in ("payment", "developers"):
            faq = t["pages"][page_id]["faq"]["items"]
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
                "areaServed": AREA_SERVED,
                "url": site.abs(here),
            })
        if page_id == "company":
            graph.append({
                "@type": "Person",
                "@id": site.abs("/#founder"),
                "name": config["founder"],
                "jobTitle": "Founder & CEO",
                "worksFor": {"@id": site.abs("/#organization")},
                "url": site.abs(site.path(site.default, "company")),
                "knowsLanguage": ["en", "tr", "ar"],
                **({"image": site.abs(FOUNDER_PHOTO)} if founder_photo else {}),
                **({"sameAs": [config["founder_linkedin"]]} if config.get("founder_linkedin") else {}),
            })
        if page_id == "products":
            # Neither product is sold on its own yet: no offers, prices or ratings are claimed.
            for i, item in enumerate(t["pages"]["products"]["items"]):
                graph.append({
                    "@type": "SoftwareApplication",
                    "@id": site.abs(here) + f"#product-{i + 1}",
                    "name": item["name"],
                    "description": item["text"],
                    "applicationCategory": "BusinessApplication",
                    "featureList": item["features"],
                    "creativeWorkStatus": t["ui"]["in_development"],
                    "inLanguage": lang,
                    "url": site.abs(here),
                    "author": {"@id": site.abs("/#organization")},
                    "publisher": {"@id": site.abs("/#organization")},
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
            og_type="website",
            posts=posts,
            feed_url=feed_path if page_id == "blog" else None,
        )
        html = env.get_template(TEMPLATE_FOR[page_id]).render(**ctx)
        out = DIST / here.lstrip("/") / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")
        rendered += 1
        page_mod = max(lastmod[lang], newest_post) if page_id == "blog" and newest_post else lastmod[lang]
        sitemap_entries.append((site.abs(here), page_mod, alternates))

    # Blog posts (default language only): hreflang points to themselves and x-default.
    t = content[site.default]
    for post in posts:
        lang = site.default
        here = site.post_path(post["slug"])

        def url(target, case=None, _lang=lang):
            return site.path(_lang, target, case)

        alternates = [(lang, site.abs(here)), ("x-default", site.abs(here))]
        crumbs = [(t["ui"]["home"], url("home")), (t["nav"]["blog"], url("blog")), (post["title"], here)]
        graph = [
            organization(site),
            {
                "@type": "BlogPosting",
                "@id": site.abs(here) + "#article",
                "headline": post["title"],
                "description": post["description"],
                "datePublished": post["date"],
                "dateModified": post["updated"],
                "inLanguage": lang,
                "keywords": ", ".join(post["tags"]),
                "image": site.abs("/assets/icons/og-image.png"),
                "author": {"@type": "Person", "@id": site.abs("/#founder"), "name": config["founder"],
                           "url": site.abs(url("company"))},
                "publisher": {"@id": site.abs("/#organization")},
                "mainEntityOfPage": site.abs(here),
                "isPartOf": {"@type": "Blog", "@id": site.abs(url("blog")) + "#blog", "url": site.abs(url("blog"))},
            },
            {
                "@type": "BreadcrumbList",
                "@id": site.abs(here) + "#breadcrumb",
                "itemListElement": [
                    {"@type": "ListItem", "position": i + 1, "name": name, "item": site.abs(link)}
                    for i, (name, link) in enumerate(crumbs)
                ],
            },
        ]
        if post["faq"]:
            graph.append({
                "@type": "FAQPage",
                "@id": site.abs(here) + "#faq",
                "mainEntity": [
                    {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
                    for q, a in post["faq"]
                ],
            })
        ctx = dict(
            lang=lang, meta=t["meta"], t=t, page=post, page_id="post", post=post,
            case=None, case_index=None, service_key=None,
            title=page_title(post["title"], config["site_name"], "Zerone"), description=post["description"],
            canonical=site.abs(here), here=here, url=url, abs_url=site.abs, alternates=alternates,
            # Other languages have no translation yet, so the language menu leads to their blog index.
            lang_links=[(content[c]["meta"], here if c == lang else site.path(c, "blog")) for c in site.langs],
            crumbs=crumbs, jsonld=jsonld_script(graph), suggest_json=None, og_locales=[],
            robots="index,follow", og_type="article", posts=posts, feed_url=feed_path,
        )
        out = DIST / here.lstrip("/") / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(env.get_template("post.html").render(**ctx), encoding="utf-8")
        rendered += 1
        sitemap_entries.append((site.abs(here), post["updated"], alternates))

    # Small-business plan pages and free tools (English only, like blog posts): hreflang points to
    # themselves and x-default.
    def faq_node(here, items):
        return {
            "@type": "FAQPage",
            "@id": site.abs(here) + "#faq",
            "mainEntity": [
                {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
                for q, a in items
            ],
        }

    sections = [
        (plan_pages, PLANS_PATH, "plans", "plans.html", lambda t: t["nav"]["plans"]),
        (tool_pages, TOOLS_PATH, "tools", "tools.html", lambda t: t["footer"]["tools"]),
    ]
    for section_pages, base_path, section_id, template, hub_name in sections:
        by_slug = {page["slug"]: page for page in section_pages}
        for page in section_pages:
            lang = site.default
            t = content[lang]
            here = page["path"]

            def url(target, case=None, _lang=lang):
                return site.path(_lang, target, case)

            alternates = [(lang, site.abs(here)), ("x-default", site.abs(here))]
            crumbs = [(t["ui"]["home"], url("home")), (hub_name(t), base_path)]
            if page["parent"]:
                parent = by_slug[page["parent"]]
                crumbs.append((parent["heading"], parent["path"]))
            if page["slug"] != "index":
                crumbs.append((page["heading"], here))
            graph = [
                organization(site),
                {
                    "@type": "WebPage",
                    "@id": site.abs(here) + "#webpage",
                    "url": site.abs(here),
                    "name": page["title"],
                    "description": page["description"],
                    "inLanguage": lang,
                    "dateModified": page["updated"],
                    "isPartOf": {"@id": site.abs("/#website")},
                    "about": {"@id": site.abs("/#organization")},
                    "breadcrumb": {"@id": site.abs(here) + "#breadcrumb"},
                },
                {
                    "@type": "BreadcrumbList",
                    "@id": site.abs(here) + "#breadcrumb",
                    "itemListElement": [
                        {"@type": "ListItem", "position": i + 1, "name": name, "item": site.abs(link)}
                        for i, (name, link) in enumerate(crumbs)
                    ],
                },
            ]
            service_name = page["service"] or (
                "ZERONE International — Small Business Plans" if section_id == "plans" and page["slug"] == "index" else "")
            if service_name:
                graph.append({
                    "@type": "Service",
                    "@id": site.abs(here) + "#service",
                    "name": service_name,
                    "description": page["description"],
                    "provider": {"@id": site.abs("/#organization")},
                    "areaServed": AREA_SERVED,
                    "url": site.abs(here),
                })
            if page["faq"]:
                graph.append(faq_node(here, page["faq"]))
            ctx = dict(
                lang=lang, meta=t["meta"], t=t, page=page, page_id=section_id,
                plan_pages=[p for p in section_pages if not p["parent"]], section_pages=section_pages,
                case=None, case_index=None, service_key=None,
                title=page_title(page["title"], config["site_name"], "Zerone"), description=page["description"],
                canonical=site.abs(here), here=here, url=url, abs_url=site.abs, alternates=alternates,
                # The pages exist in English only, so the language menu leads to each language's home page.
                lang_links=[(content[c]["meta"], here if c == lang else site.path(c, "home")) for c in site.langs],
                crumbs=crumbs, jsonld=jsonld_script(graph), suggest_json=None, og_locales=[],
                robots="index,follow", og_type="website", posts=posts, feed_url=None,
                page_script=page["script"],
            )
            out = DIST / here.lstrip("/") / "index.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(env.get_template(template).render(**ctx), encoding="utf-8")
            rendered += 1
            sitemap_entries.append((site.abs(here), page["updated"], alternates))

    # RSS feed of the blog.
    def rfc822(day):
        return dt.datetime.fromisoformat(day).replace(hour=12, tzinfo=dt.timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")

    feed = ['<?xml version="1.0" encoding="UTF-8"?>',
            '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>',
            f"<title>{xml_escape(t['nav']['blog'] + ' – ' + config['site_name'])}</title>",
            f"<link>{site.abs(site.path(site.default, 'blog'))}</link>",
            f"<description>{xml_escape(t['pages']['blog']['description'])}</description>",
            f"<language>{site.default}</language>",
            f'<atom:link href="{site.abs(feed_path)}" rel="self" type="application/rss+xml"/>']
    for post in posts:
        link = site.abs(site.post_path(post["slug"]))
        feed.append(f"<item><title>{xml_escape(post['title'])}</title><link>{link}</link>"
                    f'<guid isPermaLink="true">{link}</guid><pubDate>{rfc822(post["date"])}</pubDate>'
                    f"<description>{xml_escape(post['description'])}</description></item>")
    feed.append("</channel></rss>")
    (DIST / feed_path.lstrip("/")).write_text("\n".join(feed) + "\n", encoding="utf-8")

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
            og_type="website", posts=posts, feed_url=None,
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
    redirects.update(moved)
    redirect_tpl = env.get_template("redirect.html")
    for old, new in redirects.items():
        if old == "/index.html":
            continue  # served by the new home page itself
        out = DIST / old.lstrip("/")
        if old.endswith("/"):
            out = out / "index.html"
        if out.exists():
            raise BuildError(f"redirects.json: {old} is a live page, it cannot be redirected")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(redirect_tpl.render(target=new, absolute=site.abs(new)), encoding="utf-8")
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
        "assistant_enabled": assistant_on,
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
