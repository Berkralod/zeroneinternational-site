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

def main():
    ARTIFACTS.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 8765), partial(Handler, directory=str(SITE)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    results = []
    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for width in (320, 1280):
                context = browser.new_context(viewport={'width': width, 'height': 900}, color_scheme='dark', reduced_motion='reduce')
                for file in sorted(SITE.glob('*.html')):
                    page = context.new_page()
                    page_errors = []
                    page.on('pageerror', lambda error: page_errors.append(str(error)))
                    try:
                        page.add_init_script("localStorage.setItem('zerone-theme','dark');")
                        response = page.goto('http://127.0.0.1:8765/' + file.name, wait_until='networkidle')
                        assert response and response.status == 200, 'Page did not return HTTP 200'
                        picker = page.locator('select.theme-toggle')
                        assert picker.count() == 1, 'Missing language picker'
                        assert picker.locator('option').count() == 15, 'Expected 15 language options'
                        assert page.locator('html').get_attribute('data-theme') == 'dark', 'Expected dark theme'
                        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'Horizontal overflow'
                        dark_bg = page.locator('body').evaluate('(node) => getComputedStyle(node).backgroundColor')
                        page.screenshot(path=str(ARTIFACTS / f'{file.stem}-{width}-dark.png'), full_page=True)
                        page.locator('[data-theme-toggle]').click()
                        assert page.locator('html').get_attribute('data-theme') == 'light', 'Theme button did not switch to light'
                        light_bg = page.locator('body').evaluate('(node) => getComputedStyle(node).backgroundColor')
                        assert dark_bg != light_bg, 'Body color did not change'
                        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'Light theme overflow'
                        page.screenshot(path=str(ARTIFACTS / f'{file.stem}-{width}-light.png'), full_page=True)
                        if width == 320 and page.locator('.mobile-menu summary').count():
                            page.locator('.mobile-menu summary').click()
                            assert page.locator('.mobile-menu nav').is_visible(), 'Mobile menu did not open'
                            page.locator('.mobile-menu summary').click()
                        if page.locator('[data-carousel]').count():
                            region = page.locator('[data-carousel]')
                            assert region.locator('[data-scenario]').count() == 20, 'Expected 20 use cases'
                            assert region.locator('[data-scenario]:visible').count() == 1, 'Expected one visible carousel card'
                            assert region.locator('[data-play]').inner_text() == 'Start rotation', 'Reduced motion preference was not respected'
                            start = region.locator('[data-count]').inner_text()
                            region.locator('[data-next]').click()
                            assert region.locator('[data-count]').inner_text() != start, 'Next control failed'
                            region.locator('[data-prev]').click()
                            assert region.locator('[data-count]').inner_text() == start, 'Previous control failed'
                        assert not page_errors, 'JavaScript errors: ' + '; '.join(page_errors)
                        results.append({'page': file.name, 'width': width, 'result': 'passed'})
                    except Exception as error:
                        errors.append(f'{file.name} at {width}px: {error}')
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
    for error in errors:
        print('::error::' + error.replace('\n', ' '))
    if errors:
        raise SystemExit(1)
    print(f'Passed {len(results)} page/viewport checks with dark and light screenshots.')

if __name__ == '__main__':
    main()
