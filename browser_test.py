from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
SITE = ROOT / 'dist'
ARTIFACTS = ROOT / 'browser-artifacts'

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

def inspect(page, file, width):
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script("localStorage.setItem('zerone-theme','dark');")
    response = page.goto('http://127.0.0.1:8765/' + file.name, wait_until='networkidle')
    assert response and response.status == 200, 'Page did not return HTTP 200'
    picker = page.locator('select.theme-toggle')
    assert picker.count() == 1, 'Missing language picker'
    assert picker.locator('option').count() == 15, 'Expected 15 language options'
    backgrounds = []
    for theme in ('dark', 'light'):
        if theme == 'light':
            page.locator('[data-theme-toggle]').click()
        assert page.locator('html').get_attribute('data-theme') == theme, 'Theme switch failed'
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'Horizontal overflow'
        backgrounds.append(page.locator('body').evaluate('(node) => getComputedStyle(node).backgroundColor'))
        page.screenshot(path=str(ARTIFACTS / f'{file.stem}-{width}-{theme}.png'), full_page=True)
    assert backgrounds[0] != backgrounds[1], 'Body color did not change'
    if width == 320 and page.locator('.mobile-menu summary').count():
        page.locator('.mobile-menu summary').click()
        assert page.locator('.mobile-menu nav').is_visible(), 'Mobile menu did not open'
        page.locator('.mobile-menu summary').click()
    for region in page.locator('[data-carousel]').all():
        assert region.locator('[data-scenario]').count() == 20, 'Expected 20 use cases'
        assert region.locator('[data-scenario]:visible').count() == 1, 'Expected one visible carousel card'
        assert region.get_attribute('data-rotation') == 'paused', 'Reduced motion preference was not respected'
        start = region.locator('[data-count]').inner_text()
        region.locator('[data-next]').click()
        assert region.locator('[data-count]').inner_text() != start, 'Next control failed'
        region.locator('[data-prev]').click()
        assert region.locator('[data-count]').inner_text() == start, 'Previous control failed'
    assert not errors, 'JavaScript errors: ' + '; '.join(errors)

def main():
    files = sorted(SITE.glob('*.html'))
    assert len(files) >= 15, 'Expected at least 15 built pages'
    ARTIFACTS.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 8765), partial(Handler, directory=str(SITE)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    results = []
    failures = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width in (320, 1280):
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme='dark', reduced_motion='reduce')
                for file in files:
                    page = context.new_page()
                    try:
                        inspect(page, file, width)
                        results.append({'page': file.name, 'width': width, 'result': 'passed'})
                    except Exception as error:
                        failures.append(f'{file.name} at {width}px: {error}')
                        results.append({'page': file.name, 'width': width, 'result': 'failed', 'error': str(error)})
                        page.screenshot(path=str(ARTIFACTS / f'{file.stem}-{width}-failure.png'), full_page=True)
                    finally:
                        page.close()
                context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    (ARTIFACTS / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    for error in failures:
        print('::error::' + error.replace('\n', ' '))
    if failures:
        raise SystemExit(1)
    print(f'Passed {len(results)} page/viewport checks with dark and light screenshots.')

if __name__ == '__main__':
    main()
