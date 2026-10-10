from pathlib import Path
from html import escape
import json
import re
import shutil
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
BASE = "https://zeroneinternational.com"

def render(code, d):
    e = lambda value: escape(value, quote=True)
    nav = "".join('<a href="' + href + '">' + e(label) + '</a>' for href, label in zip([code + '.html', '#about', '#vision', '#mission', '#contact', '#faq'], d['nav']))
    faq = "".join('<details><summary>' + e(q) + '</summary><p>' + e(a) + '</p></details>' for q, a in d['faq'])
    blocks = "".join('<section id="' + ident + '"><h2>' + e(d['nav'][i]) + '</h2><p>' + e(d[ident]) + '</p></section>' for ident, i in [('about', 1), ('vision', 2), ('mission', 3)])
    return ('<!DOCTYPE html>\n<html lang="' + code + '" dir="' + ('rtl' if code == 'ar' else 'ltr') + '" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zerone International LLC | ' + e(d['headline']) + '</title><meta name="description" content="' + e(d['intro']) + '"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;self&#39;; style-src &#39;self&#39;; img-src &#39;self&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><link rel="canonical" href="' + BASE + '/' + code + '.html"><link rel="stylesheet" href="home.css?v=2"><link rel="stylesheet" href="theme.css?v=1"><script src="theme.js?v=4" defer></script></head><body><a class="skip" href="#main">' + e(d['skip']) + '</a><header><div class="wrap top"><a class="brand" href="' + code + '.html">ZERONE INTERNATIONAL LLC</a><nav class="desktop-menu" aria-label="' + e(d['menu']) + '">' + nav + '</nav><div class="tools"><details class="mobile-menu"><summary>' + e(d['menu']) + '</summary><nav aria-label="' + e(d['menu']) + '">' + nav + '</nav></details><button class="theme-toggle" type="button" data-theme-toggle data-light-label="' + e(d['light']) + '" data-dark-label="' + e(d['dark']) + '">' + e(d['light']) + '</button></div></div></header><main id="main"><div class="wrap"><section class="hero"><div><p class="eyebrow">Zerone International LLC</p><h1>' + e(d['headline']) + '</h1><p class="lede">' + e(d['intro']) + '</p><a class="button" href="#services">' + e(d['cta']) + '</a></div><img class="hero-image" src="assets/hero.jpg" alt="Zerone International" width="1200" height="900" fetchpriority="high"></section>' + blocks + '<section id="services"><h2>' + e(d['cta']) + '</h2><p>' + e(d['services']) + '</p><p>' + e(d['roles']) + '</p><p>' + e(d['development']) + '</p><a class="button" href="mailto:berk@zeroneinternational.com?subject=Custom%20software%20project">' + e(d['cta']) + '</a></section><section id="faq"><h2>' + e(d['nav'][5]) + '</h2>' + faq + '</section><section id="contact"><h2>' + e(d['nav'][4]) + '</h2><p>' + e(d['contact']) + '</p><a class="button" href="mailto:berk@zeroneinternational.com?subject=Custom%20software%20project">berk@zeroneinternational.com</a></section></div></main><footer><div class="wrap foot"><span>© 2026 Zerone International LLC</span><a href="company.html#scenario-heading" lang="en">' + e(d['examples']) + '</a><a href="index.html" lang="en">English</a></div></footer></body></html>\n')

def main():
    data = json.loads((ROOT / 'locales.json').read_text(encoding='utf-8'))
    required = {'name', 'language', 'nav', 'headline', 'intro', 'about', 'vision', 'mission', 'services', 'roles', 'development', 'faq', 'contact', 'cta', 'light', 'dark', 'skip', 'menu', 'examples'}
    for code, d in data.items():
        if not re.fullmatch('[a-z]{2}', code) or not required.issubset(d) or len(d['nav']) != 6:
            raise ValueError('Invalid locale: ' + code)
        if (ROOT / (code + '.html')).exists():
            raise ValueError('Generated locale would overwrite source: ' + code)
    dest = ROOT / 'dist'
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir()
    for pattern in ('*.html', '*.css', '*.js'):
        for source in ROOT.glob(pattern):
            shutil.copy2(source, dest / source.name)
    shutil.copytree(ROOT / 'assets', dest / 'assets')
    shutil.copy2(ROOT / 'robots.txt', dest / 'robots.txt')
    for code, d in data.items():
        (dest / (code + '.html')).write_text(render(code, d), encoding='utf-8')
    options = [['en', 'English', 'index.html'], ['tr', 'Türkçe', 'tr.html'], ['de', 'Deutsch', 'de.html'], ['es', 'Español', 'es.html']]
    options.extend([code, d['name'], code + '.html'] for code, d in data.items())
    labels = {'en': 'Language', 'tr': 'Dil', 'de': 'Sprache', 'es': 'Idioma'}
    labels.update({code: d['language'] for code, d in data.items()})
    script = (dest / 'theme.js').read_text(encoding='utf-8')
    script, n = re.subn(r'var languages=\[.*?\];', lambda match: 'var languages=' + json.dumps(options, ensure_ascii=False) + ';', script)
    script, m = re.subn(r'var labels=\{.*?\};', lambda match: 'var labels=' + json.dumps(labels, ensure_ascii=False) + ';', script)
    if n != 1 or m != 1:
        raise ValueError('Could not update the language picker')
    (dest / 'theme.js').write_text(script, encoding='utf-8')
    ns = 'http://www.sitemaps.org/schemas/sitemap/0.9'
    ET.register_namespace('', ns)
    sitemap = ET.Element('{' + ns + '}urlset')
    for page in sorted(dest.glob('*.html')):
        entry = ET.SubElement(sitemap, '{' + ns + '}url')
        ET.SubElement(entry, '{' + ns + '}loc').text = BASE + ('/' if page.name == 'index.html' else '/' + page.name)
    ET.ElementTree(sitemap).write(dest / 'sitemap.xml', encoding='utf-8', xml_declaration=True)
    import validate_site
    validate_site.ROOT = dest
    if validate_site.main() != 0:
        raise ValueError('Generated site failed validation')
    print(f'Built {len(list(dest.glob("*.html")))} pages with {len(options)} languages.')

if __name__ == '__main__':
    main()
