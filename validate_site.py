from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
BASE = "https://zeroneinternational.com"

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.errors = []
        self.links = []
        self.resources = []
        self.lang = ""
        self.canonical = []
        self.description = []
        self.titles = 0
        self.h1s = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            if a["id"] in self.ids:
                self.errors.append("Duplicate id: " + a["id"])
            self.ids.add(a["id"])
        if tag == "html":
            self.lang = a.get("lang", "")
        if tag == "title":
            self.titles += 1
        if tag == "h1":
            self.h1s += 1
        if tag == "a" and "href" in a:
            self.links.append(a["href"])
        if tag in ("img", "script") and a.get("src"):
            self.resources.append(a["src"])
        if tag == "img" and "alt" not in a:
            self.errors.append("Image missing alt attribute")
        if tag == "link":
            rel = a.get("rel", "").split()
            if "stylesheet" in rel:
                self.resources.append(a.get("href", ""))
            if "canonical" in rel:
                self.canonical.append(a.get("href", ""))
        if tag == "meta" and a.get("name", "").lower() == "description":
            self.description.append(a.get("content", ""))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

def target(source, value):
    url = urlsplit(value)
    if url.scheme or url.netloc:
        return None, url.fragment
    path = unquote(url.path)
    result = source if not path else (ROOT / path.lstrip("/") if path.startswith("/") else source.parent / path)
    result = result.resolve()
    if not result.is_relative_to(ROOT):
        raise ValueError("Local path escapes site directory: " + value)
    if result.is_dir():
        result = result / "index.html"
    return result, unquote(url.fragment)

def main():
    pages = {}
    errors = []
    for path in sorted(ROOT.glob("*.html")):
        page = Page()
        page.feed(path.read_text(encoding="utf-8"))
        page.close()
        pages[path] = page
        if not page.lang:
            page.errors.append("Missing document language")
        if page.titles != 1 or page.h1s != 1:
            page.errors.append("Expected one title and one h1")
        if len(page.description) != 1 or not page.description[0].strip():
            page.errors.append("Expected one nonempty description")
        expected = BASE + ("/" if path.name == "index.html" else "/" + path.name)
        if page.canonical != [expected]:
            page.errors.append("Canonical must be " + expected)
        errors.extend(path.name + ": " + error for error in page.errors)
    if not pages:
        errors.append("No HTML pages found")
    for path, page in pages.items():
        for value in page.links + page.resources:
            try:
                resolved, fragment = target(path, value)
            except ValueError as error:
                errors.append(path.name + ": " + str(error))
                continue
            if resolved is None:
                continue
            if not resolved.is_file():
                errors.append(path.name + ": Missing local target " + value)
            elif fragment and resolved in pages and fragment not in pages[resolved].ids:
                errors.append(path.name + ": Missing fragment " + value)
    try:
        tree = ET.parse(ROOT / "sitemap.xml")
        locations = [node.text for node in tree.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
        expected_urls = {BASE + ("/" if path.name == "index.html" else "/" + path.name) for path in pages}
        if len(locations) != len(set(locations)) or set(locations) != expected_urls:
            errors.append("Sitemap must list each HTML page exactly once")
    except (OSError, ET.ParseError) as error:
        errors.append("Invalid or missing sitemap: " + str(error))
    robots = ROOT / "robots.txt"
    if not robots.is_file() or "Sitemap: " + BASE + "/sitemap.xml" not in robots.read_text(encoding="utf-8"):
        errors.append("robots.txt must reference the sitemap")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Validated {len(pages)} HTML pages, local references and sitemap coverage.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
