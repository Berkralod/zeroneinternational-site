"""Weekly traffic report from Cloudflare Web Analytics, written in Turkish for the owner's Telegram.

Compares the last 7 full days with the 7 days before and lists the top pages, countries and
referrers. Standard library only.

Usage:  python3 deploy/traffic_report.py            (prints the report)

Configuration (GitHub Actions secret, passed in as an environment variable):
    CLOUDFLARE_API_TOKEN   needs Account:Account Analytics:Read (and Account Settings:Read to find the account).

The token is never printed. Exit code 1 means the data could not be read; the printed text then
says why, so it can still be sent to Telegram.
"""
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.cloudflare.com/client/v4"
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
HOST = urllib.parse.urlsplit(json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))["base_url"]).hostname
TOP = 5

QUERY = """
query ($account: String!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!) {
  viewer {
    accounts(filter: {accountTag: $account}) {
      total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $filter) { count sum { visits } }
      pages: rumPageloadEventsAdaptiveGroups(limit: 25, filter: $filter, orderBy: [count_DESC]) {
        count dimensions { requestPath }
      }
      countries: rumPageloadEventsAdaptiveGroups(limit: 25, filter: $filter, orderBy: [count_DESC]) {
        count dimensions { countryName }
      }
      referrers: rumPageloadEventsAdaptiveGroups(limit: 25, filter: $filter, orderBy: [count_DESC]) {
        count dimensions { refererHost }
      }
    }
  }
}
"""


class ReportError(Exception):
    pass


def request(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "zeroneinternational-traffic-report/1.0",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        try:
            return json.loads(error.read().decode())
        except ValueError:
            raise ReportError(f"HTTP {error.code}") from None
    except OSError as error:
        raise ReportError(str(error)) from None


def account_id():
    payload = request("GET", "/accounts")
    if not payload.get("success") or not payload.get("result"):
        raise ReportError("hesap bulunamadı")
    return payload["result"][0]["id"]


def week(account, start, end):
    """Totals and top lists for start <= date <= end (dates as YYYY-MM-DD)."""
    variables = {"account": account, "filter": {"date_geq": start, "date_leq": end, "requestHost": HOST}}
    payload = request("POST", "/graphql", {"query": QUERY, "variables": variables})
    if payload.get("errors"):
        raise ReportError("; ".join(e.get("message", "?") for e in payload["errors"]))
    accounts = (payload.get("data") or {}).get("viewer", {}).get("accounts") or []
    if not accounts:
        raise ReportError("istatistik verisi gelmedi")
    data = accounts[0]
    total = data["total"][0] if data["total"] else {"count": 0, "sum": {"visits": 0}}

    def top(rows, key, skip=()):
        out = []
        for row in rows:
            name = row["dimensions"].get(key) or ""
            if name in skip:
                continue
            out.append((name, row["count"]))
            if len(out) == TOP:
                break
        return out

    return {
        "views": total["count"],
        "visits": total["sum"]["visits"],
        "pages": top(data["pages"], "requestPath"),
        "countries": top(data["countries"], "countryName", skip=("",)),
        "referrers": top(data["referrers"], "refererHost", skip=("", HOST, "www." + HOST)),
    }


def change(now, before):
    if before == 0:
        return "yeni" if now else "değişim yok"
    pct = round((now - before) * 100 / before)
    return f"%{pct:+d}".replace("%+", "+%").replace("%-", "-%") if pct else "değişim yok"


def render(this, last, start, end):
    lines = [
        f"Dönem: {start} – {end} (son 7 gün)",
        f"Ziyaret: {this['visits']} (önceki 7 güne göre {change(this['visits'], last['visits'])})",
        f"Sayfa görüntüleme: {this['views']} (önceki 7 güne göre {change(this['views'], last['views'])})",
    ]
    for title, rows, empty in (
        ("En çok bakılan sayfalar", this["pages"], "veri yok"),
        ("Ülkeler", this["countries"], "veri yok"),
        ("Ziyaretçiyi getiren siteler", this["referrers"], "doğrudan gelişler dışında yok"),
    ):
        lines.append("")
        lines.append(title + ":")
        if rows:
            lines.extend(f"- {name}: {count}" for name, count in rows)
        else:
            lines.append(f"- {empty}")
    return "\n".join(lines)


def main():
    if not TOKEN:
        print("Cloudflare anahtarı (CLOUDFLARE_API_TOKEN) tanımlı değil; rapor hazırlanamadı.")
        sys.exit(1)
    today = dt.datetime.now(dt.timezone.utc).date()
    end = today - dt.timedelta(days=1)
    start = end - dt.timedelta(days=6)
    prev_end = start - dt.timedelta(days=1)
    prev_start = prev_end - dt.timedelta(days=6)
    try:
        account = account_id()
        this = week(account, start.isoformat(), end.isoformat())
        last = week(account, prev_start.isoformat(), prev_end.isoformat())
    except ReportError as error:
        print("Trafik verisi okunamadı. Cloudflare anahtarında 'Account Analytics: Read' izni "
              f"olduğundan emin olun. Ayrıntı: {error}")
        sys.exit(1)
    print(render(this, last, start.isoformat(), end.isoformat()))


if __name__ == "__main__":
    main()
