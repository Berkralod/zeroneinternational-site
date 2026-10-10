from pathlib import Path
from html import escape
import json
import re

ROOT = Path(__file__).resolve().parent

def add_cases(site, source):
    d = json.loads(source.read_text(encoding='utf-8'))
    code = d['language']
    if not re.fullmatch('[a-z]{2}', code) or source.stem != 'cases_' + code:
        raise ValueError('Invalid case locale: ' + source.name)
    rows = d['cases']
    if len(rows) != 20 or any(len(row) != 2 or not all(isinstance(value, str) and value.strip() for value in row) for row in rows):
        raise ValueError('Expected 20 title/description pairs')
    if len({row[0] for row in rows}) != 20:
        raise ValueError('Duplicate case title')
    page = site / ('index.html' if code == 'en' else code + '.html')
    text = page.read_text(encoding='utf-8')
    e = lambda value: escape(value, quote=True)
    cards = ''.join('<article class="feature" data-scenario><span class="number">' + str(i).zfill(2) + '</span><h3>' + e(title) + '</h3><p>' + e(description) + '</p><span class="badge">' + e(d['badge']) + '</span></article>' for i, (title, description) in enumerate(rows, 1))
    section = '<section id="localized-cases" data-carousel data-play-label="' + e(d['play']) + '" data-pause-label="' + e(d['pause']) + '"><h2>' + e(d['heading']) + '</h2><p>' + e(d['disclaimer']) + '</p><div data-carousel-controls hidden><button class="theme-toggle" type="button" data-prev>' + e(d['previous']) + '</button> <button class="theme-toggle" type="button" data-play>' + e(d['pause']) + '</button> <button class="theme-toggle" type="button" data-next>' + e(d['next']) + '</button><p class="note" data-count aria-live="off"></p></div><div class="grid" data-card-list>' + cards + '</div></section>'
    text = re.sub(r'<section id="localized-cases".*?</section>', '', text, flags=re.S)
    if '<section id="faq"' not in text:
        raise ValueError('Missing insertion point: ' + page.name)
    text = text.replace('<section id="faq"', section + '<section id="faq"', 1)
    if 'src="scenarios.js' not in text:
        text = text.replace('</head>', '<script src="scenarios.js?v=2" defer></script></head>', 1)
    page.write_text(text, encoding='utf-8')

if __name__ == '__main__':
    for source in sorted(ROOT.glob('cases_*.json')):
        add_cases(ROOT / 'dist', source)
    import validate_site
    validate_site.ROOT = ROOT / 'dist'
    if validate_site.main() != 0:
        raise SystemExit(1)
