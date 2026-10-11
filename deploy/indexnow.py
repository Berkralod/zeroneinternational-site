"""Tell Bing and other IndexNow search engines that the published pages changed.

Runs after each GitHub Pages deploy. Reads the URLs from the live sitemap and submits them
with the public IndexNow key from site.config.json. Failures are reported but never fail a deploy.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

config = json.loads((Path(__file__).resolve().parent.parent / "site.config.json").read_text(encoding="utf-8"))
key = config.get("indexnow_key")
if not key:
    sys.exit("No indexnow_key in site.config.json; nothing to do.")
base = config["base_url"].rstrip("/")
host = base.split("://", 1)[1]


HEADERS = {"User-Agent": "zeroneinternational-deploy/1.0 (+https://zeroneinternational.com)"}


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=30) as response:
        return response.read().decode("utf-8")


# GitHub Pages can take a moment to serve the new version; wait until the key file is live.
for attempt in range(10):
    try:
        if fetch(f"{base}/{key}.txt").strip() == key:
            break
    except OSError:
        pass
    time.sleep(15)
else:
    sys.exit("Key file is not reachable yet; skipping IndexNow submission.")

urls = re.findall(r"<loc>([^<]+)</loc>", fetch(f"{base}/sitemap.xml"))
payload = json.dumps({"host": host, "key": key, "keyLocation": f"{base}/{key}.txt", "urlList": urls[:10000]}).encode()
request = urllib.request.Request("https://api.indexnow.org/indexnow", data=payload,
                                 headers={**HEADERS, "Content-Type": "application/json; charset=utf-8"})
# A brand-new key is sometimes rejected (403) until the engine has fetched the key file; retry a few times.
for attempt in range(4):
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            print(f"IndexNow accepted {len(urls)} URLs (HTTP {response.status}).")
            break
    except urllib.error.HTTPError as error:
        print(f"IndexNow answered HTTP {error.code}: {error.read().decode('utf-8', 'replace')[:300]}")
        if error.code not in (403, 429) or attempt == 3:
            sys.exit(1)
        time.sleep(60)
