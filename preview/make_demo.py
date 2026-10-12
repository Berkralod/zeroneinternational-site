#!/usr/bin/env python3
"""Builds preview/assistant-demo.html: the real assistant widget on a mock page, with a mocked backend.

The page is self-contained (inline CSS and JS, which is allowed for this preview only; it is never part
of dist/). It works when opened directly from disk or served, and needs no network.

Usage:  python3 build.py && python3 preview/make_demo.py
(build.py writes build/assistant-data.json, from which the demo takes the link catalogue.)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "preview" / "assistant-demo.html"
LANGS = ("en", "tr", "ar")


def main():
    content = {code: json.loads((ROOT / "content" / f"{code}.json").read_text(encoding="utf-8")) for code in LANGS}
    data = json.loads((ROOT / "build" / "assistant-data.json").read_text(encoding="utf-8"))
    catalog = {
        link_id: {"urls": {c: v["urls"][c] for c in LANGS}, "labels": {c: v["labels"][c] for c in LANGS}}
        for link_id, v in data["links"].items()
        if not link_id.startswith("case")
    }
    settings = {}
    for code in LANGS:
        t = content[code]
        prefix = "" if code == "en" else f"/{code}"
        settings[code] = {
            "endpoint": "https://assistant.demo.invalid",
            "sitekey": "",
            "lang": code,
            "dir": t["meta"]["dir"],
            "catalog": "/assets/assistant-catalog.0000000000.json",
            "privacy": f"{prefix}/{t['slugs']['privacy']}/",
            "contact": f"{prefix}/{t['slugs']['contact']}/",
            "t": {**t["assistant"], "privacy": t["pages"]["privacy"]["h1"], "consent_link": t["form"]["consent_link"],
                  "name": t["form"]["name"], "contact": t["nav"]["contact"]},
        }
    site_css = (ROOT / "static/assets/css/site.css").read_text(encoding="utf-8")
    site_css = re.sub(r"@font-face\s*\{[^}]*\}\s*", "", site_css)  # no font files in a single-file preview
    widget_css = (ROOT / "static/assets/css/assistant.css").read_text(encoding="utf-8")
    widget_js = (ROOT / "static/assets/js/assistant.js").read_text(encoding="utf-8")
    mock_js = (ROOT / "preview" / "demo-mock.js").read_text(encoding="utf-8")
    page = (ROOT / "preview" / "demo-page.html").read_text(encoding="utf-8")

    def safe(text):
        return text.replace("</", "<\\/")

    html = (page
            .replace("/*SITE_CSS*/", site_css)
            .replace("/*WIDGET_CSS*/", widget_css)
            .replace("/*DEMO_DATA*/", safe(json.dumps({"settings": settings, "catalog": {"version": "demo", "links": catalog}},
                                                      ensure_ascii=False, separators=(",", ":"))))
            .replace("/*MOCK_JS*/", safe(mock_js))
            .replace("/*WIDGET_JS*/", safe(widget_js)))
    OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({len(html) // 1024} KB)")


if __name__ == "__main__":
    main()
