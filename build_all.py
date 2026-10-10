from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent

def main():
    data = json.loads((ROOT / 'locales.json').read_text(encoding='utf-8'))
    for source in sorted(ROOT.glob('locales_*.json')):
        additions = json.loads(source.read_text(encoding='utf-8'))
        for code, content in additions.items():
            if code in data:
                raise ValueError('Duplicate locale: ' + code)
            data[code] = content
    with tempfile.TemporaryDirectory(prefix='zerone-build-') as temporary:
        work = Path(temporary) / 'source'
        shutil.copytree(ROOT, work, ignore=shutil.ignore_patterns('.git', 'dist', 'output', '__pycache__', '.env', '.env.*'))
        (work / 'locales.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        subprocess.run([sys.executable, str(work / 'build_site.py')], cwd=work, check=True)
        subprocess.run([sys.executable, str(work / 'enrich_seo.py')], cwd=work, check=True)
        dest = ROOT / 'dist'
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(work / 'dist', dest)

if __name__ == '__main__':
    main()
