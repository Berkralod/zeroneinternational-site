from pathlib import Path
import base64
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent
CSS = '.brand{display:inline-flex;align-items:center;max-width:180px;min-width:0}.brand img{display:block;width:180px;max-width:100%;height:auto;border-radius:4px}@media(max-width:800px){.brand{max-width:140px}header nav{flex-wrap:wrap}}'

def apply(site, data):
    raw = base64.b64decode(data['base64'], validate=True)
    if hashlib.sha256(raw).hexdigest() != data['sha256'] or raw[:4] != b'RIFF' or raw[8:12] != b'WEBP':
        raise ValueError('Invalid logo asset')
    (site / 'assets').mkdir(exist_ok=True)
    (site / 'assets' / 'logo.webp').write_bytes(raw)
    (site / 'brand.css').write_text(CSS, encoding='utf-8')
    image = '<img src="assets/logo.webp" alt="Zerone International LLC" width="' + str(data['width']) + '" height="' + str(data['height']) + '" decoding="async">'
    for page in sorted(site.glob('*.html')):
        text = page.read_text(encoding='utf-8')
        text, count = re.subn(r'(<a\b[^>]*class="brand"[^>]*>).*?(</a>)', lambda m: m[1] + image + m[2], text, flags=re.S)
        if count != 1:
            raise ValueError('Expected one brand link: ' + page.name)
        if 'href="brand.css' not in text:
            text = text.replace('</head>', '<link rel="stylesheet" href="brand.css?v=1"></head>', 1)
        page.write_text(text, encoding='utf-8')

if __name__ == '__main__':
    apply(ROOT / 'dist', json.loads((ROOT / 'brand_asset.json').read_text(encoding='utf-8')))
    import validate_site
    validate_site.ROOT = ROOT / 'dist'
    if validate_site.main() != 0:
        raise SystemExit(1)
