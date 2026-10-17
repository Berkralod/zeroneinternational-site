"""Copy the main domain's live DNS records into Cloudflare as a *pending* zone. Standard library only.

This prepares the nameserver move for zeroneinternational.com without changing anything that is live:
  1. reads the domain's current public DNS records (via Cloudflare's DNS-over-HTTPS resolver) for the
     bare domain, www and the usual verification / mail names,
  2. adds the domain to Cloudflare if needed (no automatic record scan, so nothing is guessed),
  3. creates each record found, DNS only (never proxied: GitHub Pages needs direct DNS for its certificate),
     and leaves records that already exist untouched,
  4. reports the Cloudflare nameservers and the record list in Turkish.

The website keeps working exactly as before: nothing changes until the nameservers are switched at
Namecheap, which only the owner does, after comparing the list. Running it again is safe.

Usage:  python3 deploy/cloudflare_zone_import.py [--dry-run | --email-routing] [DOMAIN]   (default: host of base_url)
        --dry-run only reads and lists the live records; Cloudflare is not touched.
        --email-routing replaces the copied Namecheap mail-forwarding records with Cloudflare Email Routing.

Configuration (GitHub Actions secret, passed in as an environment variable):
    CLOUDFLARE_API_TOKEN   Zone:Zone:Edit, Zone:DNS:Edit and Account:Account Settings:Read.

Writes a Turkish summary to $SUMMARY_FILE if set. Exit code 1 means a Cloudflare API call failed.
Never use deploy/cloudflare_redirects.py on this domain: it replaces the bare domain's records.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.cloudflare.com/client/v4"
DOH = "https://cloudflare-dns.com/dns-query"
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
TYPES = {"A": 1, "AAAA": 28, "CNAME": 5, "MX": 15, "TXT": 16, "CAA": 257}
# Names to look up besides the bare domain: www, mail and the verification records seen on this kind of site.
SUBNAMES = ["www", "_dmarc", "_github-pages-challenge-berkralod", "google._domainkey", "default._domainkey",
            "k1._domainkey", "selector1._domainkey", "selector2._domainkey", "mail", "autodiscover", "_domainconnect"]
COMMENT = "Imported from the live DNS before the nameserver move (deploy/cloudflare_zone_import.py)"


class CloudflareError(Exception):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json",
        "User-Agent": "zeroneinternational-zone-import/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read().decode())
        except ValueError:
            raise CloudflareError(f"{method} {path}: HTTP {error.code}", error.code) from None
        status = error.code
    except OSError as error:
        raise CloudflareError(f"{method} {path}: {error}") from None
    else:
        status = 200
    if not payload.get("success"):
        messages = "; ".join(f"{e.get('code')}: {e.get('message')}" for e in payload.get("errors", []))
        raise CloudflareError(f"{method} {path}: {messages or 'unknown error'}", status)
    return payload.get("result")


def lookup(name, rtype):
    """Answers of one public DNS query; CNAME chains are cut at the first hop (the record we own)."""
    url = f"{DOH}?{urllib.parse.urlencode({'name': name, 'type': rtype})}"
    request = urllib.request.Request(url, headers={"Accept": "application/dns-json"})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode())
    answers = []
    for answer in payload.get("Answer", []):
        if answer.get("name", "").rstrip(".").lower() != name.lower():
            continue  # a record further down a CNAME chain belongs to someone else's domain
        if answer.get("type") != TYPES[rtype]:
            continue
        answers.append(answer["data"])
    return answers


def snapshot(domain):
    records = []
    for name in [domain] + [f"{sub}.{domain}" for sub in SUBNAMES]:
        cname = lookup(name, "CNAME")
        if cname:
            records.append({"type": "CNAME", "name": name, "content": cname[0].rstrip(".")})
            continue  # a name with a CNAME has no other records
        for rtype in ("A", "AAAA", "MX", "TXT", "CAA"):
            for data in lookup(name, rtype):
                record = {"type": rtype, "name": name}
                if rtype == "MX":
                    priority, host = data.split(None, 1)
                    record.update(priority=int(priority), content=host.rstrip("."))
                elif rtype == "TXT":
                    # DoH returns quoted chunks; join them back into one string.
                    parts = [p for p in data.split('"') if p.strip()] if data.startswith('"') else [data]
                    record["content"] = "".join(parts)
                elif rtype == "CAA":
                    flags, tag, value = data.split(None, 2)
                    record["data"] = {"flags": int(flags), "tag": tag, "value": value.strip('"')}
                else:
                    record["content"] = data
                records.append(record)
    return records


def same(existing, record):
    if existing["type"] != record["type"] or existing["name"].lower() != record["name"].lower():
        return False
    if record["type"] == "CAA":
        return existing.get("data", {}).get("value") == record["data"]["value"]
    return existing.get("content", "").rstrip(".").strip('"') == record["content"]


def describe(record):
    value = record.get("content") or f"{record['data']['tag']} {record['data']['value']}"
    if len(value) > 60:
        value = value[:57] + "..."
    priority = f" (öncelik {record['priority']})" if "priority" in record else ""
    return f"{record['type']} {record['name']} → {value}{priority}"


# Namecheap's free e-mail forwarding: these exact MX hosts and SPF include, nothing else.
NAMECHEAP_MX = frozenset(f"eforward{n}.registrar-servers.com" for n in range(1, 6))
NAMECHEAP_SPF_INCLUDE = "include:spf.efwd.registrar-servers.com"


def is_namecheap_forwarding(record):
    """True for the MX records and the SPF record that Namecheap's e-mail forwarding needs."""
    if record["type"] == "MX":
        return record["content"].rstrip(".").lower() in NAMECHEAP_MX
    if record["type"] == "TXT":
        tokens = record["content"].strip('"').split()
        return bool(tokens) and tokens[0] == "v=spf1" and any(t == NAMECHEAP_SPF_INCLUDE for t in tokens)
    return False


def enable_email_routing(domain):
    """Switch the zone's mail from Namecheap forwarding to Cloudflare Email Routing (MX + SPF records).

    The routing rules and the destination address live in the private zerone-local repository; this
    step needs Zone Settings Write and DNS Edit, which the site's token has. If enabling fails, the
    Namecheap forwarding records are put back, so the zone is never left without MX records.
    """
    zones = call("GET", f"/zones?name={domain}")
    if not zones:
        raise CloudflareError(f"{domain} is not in Cloudflare yet")
    zid = zones[0]["id"]
    lines = []
    records = call("GET", f"/zones/{zid}/dns_records?per_page=500") or []
    old = [r for r in records if is_namecheap_forwarding(r)]
    for record in old:
        call("DELETE", f"/zones/{zid}/dns_records/{record['id']}")
    try:
        try:
            call("POST", f"/zones/{zid}/email/routing/dns", {"name": domain})
        except CloudflareError as error:
            if error.status not in (404, 405):
                raise
            call("POST", f"/zones/{zid}/email/routing/enable", {})
    except CloudflareError:
        for record in old:
            body = {k: record[k] for k in ("type", "name", "content") if k in record}
            if record["type"] == "MX":
                body["priority"] = record.get("priority", 10)
            call("POST", f"/zones/{zid}/dns_records", {**body, "ttl": 1, "comment": COMMENT})
        raise
    mx = sorted(r["content"] for r in call("GET", f"/zones/{zid}/dns_records?type=MX&per_page=50") or [])
    lines.append(f"Cloudflare Email Routing açıldı; {len(old)} eski Namecheap yönlendirme kaydı kaldırıldı. "
                 f"Yeni MX: {', '.join(mx) or 'yok'}.")
    if zones[0].get("status") != "active":
        lines.append("Alan adı henüz beklemede: e-postalar nameserver değişene kadar Namecheap üzerinden gelmeye devam eder.")
    return lines


def main():
    config = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv[1:]
    email_routing = "--email-routing" in sys.argv[1:]
    domain = (args[0] if args else urllib.parse.urlsplit(config["base_url"]).hostname).lower()
    if domain.startswith("www."):
        domain = domain[4:]
    if not TOKEN and not dry_run:
        sys.exit("CLOUDFLARE_API_TOKEN is not set.")

    lines, failed = [], False
    if email_routing:
        try:
            lines.extend(enable_email_routing(domain))
        except CloudflareError as error:
            failed = True
            lines.append("E-posta yönlendirmesi AÇILAMADI; Namecheap yönlendirme kayıtları yerinde bırakıldı "
                         f"(e-posta etkilenmez). Ayrıntı: {error}")
        text = "\n".join(lines)
        print(text)
        if os.environ.get("SUMMARY_FILE"):
            Path(os.environ["SUMMARY_FILE"]).write_text(text + "\n", encoding="utf-8")
        sys.exit(1 if failed else 0)
    try:
        records = snapshot(domain)
    except OSError as error:
        records, failed = [], True
        lines.append(f"Mevcut DNS kayıtları okunamadı ({error.__class__.__name__}); hiçbir şey değiştirilmedi.")
    if records and not any(r["type"] in ("A", "CNAME") and r["name"] == domain for r in records):
        failed = True
        lines.append(f"{domain} için A kaydı bulunamadı; güvenlik için durduruldu, hiçbir şey değiştirilmedi.")
        records = []

    if records and dry_run:
        lines.append(f"Deneme (dry run): {domain} için bulunan canlı DNS kayıtları; Cloudflare'e dokunulmadı:")
        lines.extend(f"- {describe(r)}" for r in records)
    elif records:
        try:
            account = call("GET", "/accounts")[0]["id"]
            zones = call("GET", f"/zones?name={domain}")
            if zones:
                zone, created = zones[0], False
            else:
                zone = call("POST", "/zones", {"name": domain, "account": {"id": account}, "type": "full",
                                               "jump_start": False})
                created = True
            existing = call("GET", f"/zones/{zone['id']}/dns_records?per_page=500") or []
            added, kept = [], []
            for record in records:
                if any(same(e, record) for e in existing):
                    kept.append(record)
                    continue
                body = {**record, "ttl": 1, "comment": COMMENT}
                if record["type"] in ("A", "AAAA", "CNAME"):
                    body["proxied"] = False
                call("POST", f"/zones/{zone['id']}/dns_records", body)
                added.append(record)
            status = zone.get("status")
            if status != "active" and not created:
                try:
                    call("PUT", f"/zones/{zone['id']}/activation_check")  # speeds up activation after the NS switch
                except CloudflareError:
                    pass  # rate-limited checks are harmless; Cloudflare also checks on its own
            lines.append(f"{domain} Cloudflare'e {'eklendi' if created else 'zaten ekliydi'} (durum: "
                         f"{'AKTİF' if status == 'active' else 'beklemede — site hâlâ Namecheap DNS ile çalışıyor'}).")
            lines.append(f"Kopyalanan kayıtlar ({len(added)} yeni, {len(kept)} zaten vardı):")
            lines.extend(f"- {describe(r)}" for r in records)
            if status != "active":
                servers = ", ".join(zone.get("name_servers", []))
                lines.append(f"Taşıma için Namecheap'te girilecek nameserver'lar (Claude 'hazır' deyince): {servers}")
        except CloudflareError as error:
            failed = True
            lines.append(f"Cloudflare hatası: {error}")

    text = "\n".join(lines)
    print(text)
    summary = os.environ.get("SUMMARY_FILE")
    if summary:
        Path(summary).write_text(text + "\n", encoding="utf-8")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
