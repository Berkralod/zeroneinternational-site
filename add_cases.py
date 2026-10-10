from pathlib import Path
from html import escape
from html.parser import HTMLParser
import json
import re

ROOT = Path(__file__).resolve().parent
LANGUAGES = {'en', 'tr', 'de', 'es', 'fr', 'it', 'pt', 'nl', 'pl', 'ru', 'uk', 'ar', 'hi', 'zh', 'ja'}
FIELDS = {'language', 'heading', 'disclaimer', 'badge', 'previous', 'next', 'pause', 'play', 'cases'}

class Counter(HTMLParser):
    def __init__(self):
        super().__init__()
        self.count = 0
    def handle_starttag(self, tag, attrs):
        if tag == 'article' and 'data-scenario' in dict(attrs):
            self.count += 1

def check(d, stem):
    if set(d) != FIELDS or d['language'] not in LANGUAGES - {'en'} or stem != 'cases_' + d['language']:
        raise ValueError('Invalid case locale: ' + stem)
    if any(not isinstance(d[key], str) or not d[key].strip() for key in FIELDS - {'cases'}):
        raise ValueError('Missing locale text: ' + stem)
    rows = d['cases']
    if len(rows) != 20 or any(len(row) != 2 or not all(isinstance(v, str) and v.strip() for v in row) for row in rows):
        raise ValueError('Expected 20 title/description pairs: ' + stem)
    if len({row[0] for row in rows}) != 20:
        raise ValueError('Duplicate case title: ' + stem)

def add_cases(site, d):
    code = d['language']
    page = site / (code + '.html')
    text = page.read_text(encoding='utf-8')
    e = lambda value: escape(value, quote=True)
    cards = ''.join('<article class="feature" data-scenario><span class="number" dir="ltr">' + str(i).zfill(2) + '</span><h3>' + e(title) + '</h3><p>' + e(description) + '</p><span class="badge">' + e(d['badge']) + '</span></article>' for i, (title, description) in enumerate(d['cases'], 1))
    section = '<section id="localized-cases" aria-labelledby="localized-cases-title" data-carousel data-play-label="' + e(d['play']) + '" data-pause-label="' + e(d['pause']) + '"><h2 id="localized-cases-title">' + e(d['heading']) + '</h2><p>' + e(d['disclaimer']) + '</p><div data-carousel-controls hidden><button class="theme-toggle" type="button" data-prev>' + e(d['previous']) + '</button> <button class="theme-toggle" type="button" data-play>' + e(d['pause']) + '</button> <button class="theme-toggle" type="button" data-next>' + e(d['next']) + '</button><p class="note" data-count dir="ltr" aria-live="off"></p></div><div class="grid" data-card-list>' + cards + '</div></section>'
    text = re.sub(r'<section id="localized-cases".*?</section>', '', text, flags=re.S)
    if '<section id="faq"' not in text:
        raise ValueError('Missing insertion point: ' + page.name)
    text = text.replace('<section id="faq"', section + '<section id="faq"', 1)
    if 'src="scenarios.js' not in text:
        text = text.replace('</head>', '<script src="scenarios.js?v=2" defer></script></head>', 1)
    page.write_text(text, encoding='utf-8')

def main():
    data = {}
    for source in sorted(ROOT.glob('cases_*.json')):
        d = json.loads(source.read_text(encoding='utf-8'))
        check(d, source.stem)
        if d['language'] in data:
            raise ValueError('Duplicate locale: ' + d['language'])
        data[d['language']] = d
    if set(data) != LANGUAGES - {'en'}:
        raise ValueError('Incomplete case languages: ' + ', '.join(sorted((LANGUAGES - {'en'}) - set(data))))
    site = ROOT / 'dist'
    for d in data.values():
        add_cases(site, d)
    pages = {'en': 'company.html', **{code: code + '.html' for code in data}}
    counts = {}
    for code, name in pages.items():
        parser = Counter()
        parser.feed((site / name).read_text(encoding='utf-8'))
        if parser.count != 20:
            raise ValueError('Expected 20 rendered cases: ' + name)
        counts[code] = parser.count
    report = {'language_count': len(counts), 'total_cases': sum(counts.values()), 'cases_per_language': counts, 'pages': pages}
    (site / 'language-coverage.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    import validate_site
    validate_site.ROOT = site
    if validate_site.main() != 0:
        raise SystemExit(1)
    print(f'Validated {len(counts)} case languages and {sum(counts.values())} rendered cases.')

if __name__ == '__main__':
    main()
