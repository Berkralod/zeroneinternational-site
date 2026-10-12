"""Point extra domains at the main site through Cloudflare (free plan). Standard library only.

For each domain this script, through the Cloudflare API:
  1. adds the domain to Cloudflare if it is not there yet (existing DNS records such as e-mail are imported),
  2. points the bare domain and www at Cloudflare's placeholder address 192.0.2.1 (proxied),
     replacing any old A/AAAA/CNAME records for those two names; other records (MX, TXT) are kept,
  3. turns on "Always use HTTPS" and a TLS 1.2 minimum,
  4. sets one 301 redirect rule: domain and www.domain -> the target URL,
  5. reports whether the domain is active, and if not, which nameservers to set at the registrar.

Usage:  python3 deploy/cloudflare_redirects.py TARGET_URL DOMAIN [DOMAIN ...]

Configuration (GitHub Actions secret, passed in as an environment variable):
    CLOUDFLARE_API_TOKEN   an API token with these permissions on all zones of the account:
                           Zone:Zone:Edit, Zone:Zone Settings:Edit, Zone:DNS:Edit, Zone:Single Redirect:Edit,
                           plus Account:Account Settings:Read.

The token is never printed. Running the script again is safe: it only changes what differs.
Writes a Turkish summary to the file named by $SUMMARY_FILE (default: stdout only).
Exit code 1 means a Cloudflare API call failed.
"""
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.cloudflare.com/client/v4"
PLACEHOLDER_IP = "192.0.2.1"  # Cloudflare's documented address for redirect-only hostnames.
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()


class CloudflareError(Exception):
    pass


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "zeroneinternational-redirects/1.0",
    })
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read().decode())
        except ValueError:
            raise CloudflareError(f"{method} {path}: HTTP {error.code}") from None
    except OSError as error:
        raise CloudflareError(f"{method} {path}: {error}") from None
    if not payload.get("success"):
        messages = "; ".join(f"{e.get('code')}: {e.get('message')}" for e in payload.get("errors", []))
        raise CloudflareError(f"{method} {path}: {messages or 'unknown error'}")
    return payload.get("result")


def get_or_create_zone(domain, account_id):
    zones = call("GET", f"/zones?name={domain}")
    if zones:
        return zones[0], False
    zone = call("POST", "/zones", {"name": domain, "account": {"id": account_id}, "type": "full", "jump_start": True})
    return zone, True


def ensure_dns(zone_id, domain):
    for name in (domain, f"www.{domain}"):
        existing = call("GET", f"/zones/{zone_id}/dns_records?name={name}&per_page=100")
        keep = None
        for record in existing:
            if record["type"] not in ("A", "AAAA", "CNAME"):
                continue
            if keep is None and record["type"] == "A" and record["content"] == PLACEHOLDER_IP and record.get("proxied"):
                keep = record
            else:
                call("DELETE", f"/zones/{zone_id}/dns_records/{record['id']}")
        if keep is None:
            call("POST", f"/zones/{zone_id}/dns_records", {
                "type": "A", "name": name, "content": PLACEHOLDER_IP, "proxied": True, "ttl": 1,
                "comment": "Redirect only; see deploy/cloudflare_redirects.py",
            })


def ensure_settings(zone_id):
    call("PATCH", f"/zones/{zone_id}/settings/always_use_https", {"value": "on"})
    call("PATCH", f"/zones/{zone_id}/settings/min_tls_version", {"value": "1.2"})


def ensure_redirect(zone_id, domain, target):
    rule = {
        "action": "redirect",
        "description": f"{domain} -> {target}",
        "expression": f'(http.host in {{"{domain}" "www.{domain}"}})',
        "action_parameters": {"from_value": {
            "status_code": 301,
            "target_url": {"value": target},
            "preserve_query_string": False,
        }},
    }
    call("PUT", f"/zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint", {"rules": [rule]})


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    target, domains = sys.argv[1], sys.argv[2:]
    if not target.startswith("https://"):
        sys.exit("TARGET_URL must start with https://")
    if not TOKEN:
        sys.exit("CLOUDFLARE_API_TOKEN is not set.")

    lines, failed = [], False
    try:
        accounts = call("GET", "/accounts")
    except CloudflareError as error:
        accounts, failed = [], True
        lines.append(f"Cloudflare'e bağlanılamadı (API anahtarı izinlerini kontrol edin): {error}")
    for domain in domains if accounts else []:
        try:
            zone, created = get_or_create_zone(domain, accounts[0]["id"])
            ensure_dns(zone["id"], domain)
            ensure_settings(zone["id"])
            ensure_redirect(zone["id"], domain, target)
            status = zone.get("status")
            if status != "active" and not created:
                try:
                    call("PUT", f"/zones/{zone['id']}/activation_check")
                except CloudflareError:
                    pass  # Rate-limited checks are harmless; Cloudflare also checks on its own.
            line = f"{domain} → {target} yönlendirmesi kuruldu."
            if status == "active":
                line += " Durum: AKTİF, yönlendirme çalışıyor."
            else:
                servers = ", ".join(zone.get("name_servers", []))
                line += f" Durum: bekliyor. Namecheap'te nameserver olarak şunlar girilmeli: {servers}"
            lines.append(line)
        except CloudflareError as error:
            failed = True
            lines.append(f"{domain}: HATA — {error}")

    text = "\n".join(lines)
    print(text)
    summary = os.environ.get("SUMMARY_FILE")
    if summary:
        with open(summary, "w", encoding="utf-8") as handle:
            handle.write(text + "\n")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
