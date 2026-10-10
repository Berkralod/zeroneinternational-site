from pathlib import Path
from html import escape
from html.parser import HTMLParser
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
BASE = 'https://zeroneinternational.com'
LANGUAGES = ['en', 'tr', 'de', 'es', 'fr', 'it', 'pt', 'nl', 'pl', 'ru', 'uk', 'ar', 'hi', 'zh', 'ja']

class Metadata(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_title = False
        self.title = []
        self.description = ''
        self.canonical = ''
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title':
            self.in_title = True
        if tag == 'meta' and a.get('name') == 'description':
            self.description = a.get('content', '')
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonical = a.get('href', '')
    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
    def handle_data(self, data):
        if self.in_title:
            self.title.append(data)

def enrich(site):
    home_files = {code: ('index.html' if code == 'en' else code + '.html') for code in LANGUAGES}
    for name in home_files.values():
        if not (site / name).is_file():
            raise ValueError('Missing localized homepage: ' + name)
    alternate = [(code, BASE + ('/' if code == 'en' else '/' + name)) for code, name in home_files.items()]
    alternate.append(('x-default', BASE + '/'))
    canonical_by_file = {}
    for page in sorted(site.glob('*.html')):
        text = page.read_text(encoding='utf-8')
        meta = Metadata()
        meta.feed(text)
        if not meta.canonical.startswith(BASE + '/') or not meta.description or not meta.title:
            raise ValueError('Missing SEO metadata: ' + page.name)
        canonical_by_file[page.name] = meta.canonical
        text = re.sub(r'<meta\b[^>]*property="og:[^"]+"[^>]*>', '', text, flags=re.I)
        text = re.sub(r'<meta\b[^>]*name="twitter:card"[^>]*>', '', text, flags=re.I)
        text = re.sub(r'<link\b[^>]*rel="alternate"[^>]*hreflang="[^"]+"[^>]*>', '', text, flags=re.I)
        tags = []
        for key, value in [('type', 'website'), ('site_name', 'Zerone International LLC'), ('title', ''.join(meta.title).strip()), ('description', meta.description), ('url', meta.canonical), ('image', BASE + '/assets/hero.jpg')]:
            tags.append('<meta property="og:' + key + '" content="' + escape(value, quote=True) + '">')
        tags.append('<meta name="twitter:card" content="summary_large_image">')
        if page.name in home_files.values():
            tags.extend('<link rel="alternate" hreflang="' + code + '" href="' + url + '">' for code, url in alternate)
        if '</head>' not in text:
            raise ValueError('Missing head closure: ' + page.name)
        page.write_text(text.replace('</head>', ''.join(tags) + '</head>', 1), encoding='utf-8')
    ns = 'http://www.sitemaps.org/schemas/sitemap/0.9'
    xhtml = 'http://www.w3.org/1999/xhtml'
    ET.register_namespace('', ns)
    ET.register_namespace('xhtml', xhtml)
    sitemap = ET.Element('{' + ns + '}urlset')
    for name, canonical in canonical_by_file.items():
        entry = ET.SubElement(sitemap, '{' + ns + '}url')
        ET.SubElement(entry, '{' + ns + '}loc').text = canonical
        if name in home_files.values():
            for code, url in alternate:
                ET.SubElement(entry, '{' + xhtml + '}link', {'rel': 'alternate', 'hreflang': code, 'href': url})
    ET.ElementTree(sitemap).write(site / 'sitemap.xml', encoding='utf-8', xml_declaration=True)
    return len(canonical_by_file)

def main():
    site = ROOT / 'dist'
    count = enrich(site)
    import validate_site
    validate_site.ROOT = site
    if validate_site.main() != 0:
        raise ValueError('SEO-enriched site failed validation')
    print(f'Enriched {count} pages with sharing metadata and {len(LANGUAGES)} homepage languages.')

if __name__ == '__main__':
    main()
