"""Hourly check of the live website. Exits with an error (and lists every problem) when something is wrong.

Checks: every sitemap URL answers 200, key pages carry their SEO and security tags, unknown pages
answer 404, http and www redirect to https://zeroneinternational.com, and the TLS certificate is
not about to expire.

Usage:  python3 deploy/health_check.py [--no-cert-expiry] [base_url]   (default: base_url from site.config.json)

--no-cert-expiry skips only the "certificate expires soon" warning (the TLS handshake is still
checked). The post-deploy smoke test uses it, because rolling back a build cannot renew a certificate.
"""
import datetime as dt
import json
import re
import socket
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
config = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
flags = {arg for arg in sys.argv[1:] if arg.startswith("--")}
positional = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
BASE = (positional[0] if positional else config["base_url"]).rstrip("/")
CHECK_CERT_EXPIRY = "--no-cert-expiry" not in flags
HOST = urllib.parse.urlsplit(BASE).hostname
HEADERS = {"User-Agent": "zeroneinternational-health-check/1.0 (+https://zeroneinternational.com)"}
CERT_WARN_DAYS = 21
problems = []


def get(url, method="GET"):
    """Return (status, final_url, body). Redirects are followed; HTTP errors are returned, not raised."""
    request = urllib.request.Request(url, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8", "replace") if method == "GET" else ""
            return response.status, response.url, body
    except urllib.error.HTTPError as error:
        return error.code, url, ""
    except OSError as error:
        return None, url, str(error)


def check_page(path, *must_contain):
    status, _, body = get(BASE + path)
    if status != 200:
        problems.append(f"{path}: HTTP {status} {body[:120] if status is None else ''}".strip())
        return
    for needle in must_contain:
        if needle not in body:
            problems.append(f"{path}: missing {needle!r}")


# Key pages and files.
page_tags = ('rel="canonical"', 'http-equiv="Content-Security-Policy"', 'hreflang="x-default"', "application/ld+json")
for path in ("/", "/tr/", "/contact/", "/ar/", "/ja/contact/"):
    check_page(path, *page_tags)
check_page("/robots.txt", "Sitemap:")
check_page("/.well-known/security.txt", "Contact:")
if config.get("indexnow_key"):
    check_page(f"/{config['indexnow_key']}.txt", config["indexnow_key"])

status, _, _ = get(BASE + "/this-page-should-not-exist-health-check/")
if status != 404:
    problems.append(f"unknown page answered HTTP {status}, expected 404")

# Every URL in the sitemap must load.
status, _, sitemap = get(BASE + "/sitemap.xml")
urls = re.findall(r"<loc>([^<]+)</loc>", sitemap) if status == 200 else []
if not urls:
    problems.append(f"/sitemap.xml: HTTP {status}, no URLs found")
with ThreadPoolExecutor(max_workers=8) as pool:
    for url, (code, _, _) in zip(urls, pool.map(lambda u: get(u, "HEAD"), urls)):
        if code != 200:
            problems.append(f"{url}: HTTP {code}")

# Redirects and certificate only make sense for the real https site.
if BASE.startswith("https://"):
    for variant in (f"http://{HOST}/", f"https://www.{HOST}/"):
        _, final, _ = get(variant)
        if not final.startswith(BASE + "/"):
            problems.append(f"{variant} ends at {final}, expected {BASE}/")
    try:
        context = ssl.create_default_context()
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        with socket.create_connection((HOST, 443), timeout=30) as sock:
            with context.wrap_socket(sock, server_hostname=HOST) as tls:
                expires = dt.datetime.fromtimestamp(ssl.cert_time_to_seconds(tls.getpeercert()["notAfter"]), dt.timezone.utc)
        days = (expires - dt.datetime.now(dt.timezone.utc)).days
        if CHECK_CERT_EXPIRY and days < CERT_WARN_DAYS:
            problems.append(f"TLS certificate expires in {days} days ({expires:%Y-%m-%d})")
    except (OSError, ssl.SSLError, KeyError) as error:
        problems.append(f"TLS check failed: {error}")

print(f"Checked {len(urls)} sitemap URLs and the key pages of {BASE}.")
if problems:
    print(f"{len(problems)} problem(s):")
    for problem in problems[:100]:
        print(f"- {problem}")
    sys.exit(1)
print("Everything looks healthy.")
