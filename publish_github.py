from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
from urllib.request import Request, urlopen

REPO = 'Berkralod/zeroneinternational-site'
API = 'https://api.github.com/repos/' + REPO
EXPECTED_MAIN = 'ded1914f299e735b3d74e82a0e7e571b0f2165a1'
LANGUAGES = {'en', 'tr', 'de', 'es', 'fr', 'it', 'pt', 'nl', 'pl', 'ru', 'uk', 'ar', 'hi', 'zh', 'ja'}

def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()

def api(path, method='GET'):
    headers = {'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10'}
    request = Request(API + path, headers=headers, method=method, data=b'' if method == 'POST' else None)
    with urlopen(request, timeout=30) as response:
        return json.load(response)

def web(url):
    request = Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'Zerone-release-check'})
    with urlopen(request, timeout=30) as response:
        return response.read()

def validate_release(site):
    data = json.loads((site / 'language-coverage.json').read_text(encoding='utf-8'))
    if data.get('language_count') != 15 or data.get('total_cases') != 300 or set(data.get('cases_per_language', {})) != LANGUAGES or any(v != 20 for v in data['cases_per_language'].values()):
        raise ValueError('Invalid release language coverage')
    if len(list(site.glob('*.html'))) != 17 or b'assets/logo.webp' not in (site / 'index.html').read_bytes():
        raise ValueError('Invalid release pages or logo')
    if any(path.is_symlink() for path in site.rglob('*')):
        raise ValueError('Release must not contain symlinks')
    return {str(path.relative_to(site)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(site.rglob('*')) if path.is_file()}

def main():
    summary = 'Release not completed'
    try:
        if os.environ.get('GITHUB_REPOSITORY') != REPO:
            raise ValueError('Unexpected repository')
        source_sha = os.environ['SOURCE_SHA']
        if not re.fullmatch('[0-9a-f]{40}', source_sha):
            raise ValueError('Invalid source SHA')
        site = Path(os.environ['RELEASE_DIRECTORY']).resolve()
        fingerprints = validate_release(site)
        root = Path.cwd()
        cname_bytes = (root / 'CNAME').read_bytes()
        domain = cname_bytes.decode('ascii').strip()
        pages = api('/pages')
        if pages.get('source') != {'branch': 'main', 'path': '/'} or pages.get('build_type', 'legacy') != 'legacy':
            raise ValueError('Existing Pages source must be main root with branch publishing')
        if not domain or not re.fullmatch('[A-Za-z0-9.-]+', domain) or (pages.get('cname') or '').lower() != domain.lower():
            raise ValueError('Existing custom domain mismatch; settings were not changed')
        head = git('rev-parse', 'HEAD')
        record = {'source_sha': source_sha, 'files': fingerprints}
        if head == EXPECTED_MAIN:
            for item in root.iterdir():
                if item.name in ('.git', 'CNAME'):
                    continue
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()
            for item in site.iterdir():
                if item.name in ('.git', 'CNAME'):
                    raise ValueError('Unexpected release entry')
                if item.is_dir():
                    shutil.copytree(item, root / item.name)
                else:
                    shutil.copy2(item, root / item.name)
            (root / '.nojekyll').touch()
            (root / 'release.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
            (root / 'README.md').write_text('Published static site. Source code remains on the site-v2 branch. Do not merge raw source over this publication output. DNS and Railway are unchanged.\n', encoding='utf-8')
            if (root / 'CNAME').read_bytes() != cname_bytes:
                raise ValueError('Custom domain file changed')
            git('config', 'user.name', 'github-actions[bot]')
            git('config', 'user.email', 'github-actions[bot]@users.noreply.github.com')
            git('add', '-A')
            git('commit', '-m', 'Publish validated site from ' + source_sha)
            git('push', 'origin', 'HEAD:refs/heads/main')
            head = git('rev-parse', 'HEAD')
        else:
            existing = json.loads((root / 'release.json').read_text(encoding='utf-8'))
            if existing != record or any(not (root / name).is_file() or hashlib.sha256((root / name).read_bytes()).hexdigest() != digest for name, digest in fingerprints.items()):
                raise ValueError('Main changed outside this approved release; stopped without force push')
        api('/pages/builds', 'POST')
        for attempt in range(36):
            status = api('/pages/builds/latest')
            if status.get('commit') == head:
                if status.get('status') == 'built':
                    break
                if status.get('status') == 'errored':
                    raise ValueError('GitHub Pages build failed')
            time.sleep(5)
        else:
            raise TimeoutError('Pages build not confirmed for publication commit ' + head)
        live = 'https://' + domain
        for attempt in range(24):
            try:
                remote = json.loads(web(live + '/release.json?v=' + head))
                coverage = json.loads(web(live + '/language-coverage.json?v=' + head))
                logo_hash = hashlib.sha256(web(live + '/assets/logo.webp?v=' + head)).hexdigest()
                home = web(live + '/?v=' + head)
                if remote == record and coverage.get('language_count') == 15 and coverage.get('total_cases') == 300 and logo_hash == fingerprints['assets/logo.webp'] and b'assets/logo.webp' in home:
                    summary = 'LIVE verified: 15 languages, 300 cases, official logo'
                    print(summary + ' at ' + live)
                    return
            except Exception:
                pass
            time.sleep(5)
        raise TimeoutError('Publication commit created, but live version is not yet verified')
    except Exception as error:
        summary = 'Release failed: ' + str(error)
        raise
    finally:
        output = os.environ.get('GITHUB_OUTPUT')
        if output:
            with open(output, 'a', encoding='utf-8') as stream:
                stream.write('summary=' + summary.replace('\n', ' ').replace('\r', ' ')[:200] + '\n')

if __name__ == '__main__':
    main()
