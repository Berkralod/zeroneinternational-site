"""Cloudflare setup for the AI sales assistant Worker. Standard library only.

Used by .github/workflows/assistant-deploy.yml around `wrangler deploy`:

    python3 deploy/assistant_setup.py prepare   # before deploy
        - finds the Cloudflare account,
        - makes sure the account has a workers.dev subdomain (creates "zerone-<random>" if missing),
        - writes account_id and subdomain to $GITHUB_OUTPUT.

    python3 deploy/assistant_setup.py secrets   # after deploy
        - creates the Turnstile widget "zerone-assistant" (managed mode, zeroneinternational.com) if missing,
        - sets the Worker secrets: ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (from the
          environment, i.e. GitHub secrets), TURNSTILE_SECRET (from the widget) and IP_HASH_SALT
          (generated once, only if the Worker does not have it yet),
        - writes endpoint and sitekey to $GITHUB_OUTPUT and a Turkish summary to $SUMMARY_FILE.

Configuration (environment):
    CLOUDFLARE_API_TOKEN   token with Account: Workers Scripts Edit, Account Settings Read, Turnstile Edit
    CLOUDFLARE_ACCOUNT_ID  optional; otherwise the first account the token can see
    ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   (secrets step)

No secret value is ever printed. Running it again is safe: it only changes what is missing.
"""
import json
import os
import secrets
import sys
import urllib.error
import urllib.request

API = "https://api.cloudflare.com/client/v4"
SCRIPT = "zerone-assistant"
WIDGET = "zerone-assistant"
DOMAINS = ["zeroneinternational.com"]
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()


class CloudflareError(Exception):
    pass


def call(method, path, body=None, allow_404=False):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "zeroneinternational-assistant/1.0",
    })
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        if allow_404 and error.code == 404:
            return None
        try:
            payload = json.loads(error.read().decode())
        except ValueError:
            raise CloudflareError(f"{method} {path.split('?')[0]}: HTTP {error.code}") from None
    except OSError as error:
        raise CloudflareError(f"{method} {path.split('?')[0]}: {error}") from None
    if not payload.get("success"):
        messages = "; ".join(f"{e.get('code')}: {e.get('message')}" for e in payload.get("errors", []))
        raise CloudflareError(f"{method} {path.split('?')[0]}: {messages or 'unknown error'}")
    return payload.get("result")


def output(**values):
    path = os.environ.get("GITHUB_OUTPUT")
    for key, value in values.items():
        print(f"{key}={value}")
        if path:
            with open(path, "a", encoding="utf-8") as handle:
                handle.write(f"{key}={value}\n")


def mask(value):
    """Hide a generated secret in GitHub Actions logs, in case anything ever echoes it."""
    if os.environ.get("GITHUB_ACTIONS") == "true" and value:
        print(f"::add-mask::{value}")


def account_id():
    if os.environ.get("CLOUDFLARE_ACCOUNT_ID"):
        return os.environ["CLOUDFLARE_ACCOUNT_ID"].strip()
    accounts = call("GET", "/accounts?per_page=5")
    if not accounts:
        raise CloudflareError("the API token cannot see any account (needs Account Settings: Read)")
    return accounts[0]["id"]


def ensure_subdomain(account):
    result = call("GET", f"/accounts/{account}/workers/subdomain", allow_404=True)
    if result and result.get("subdomain"):
        return result["subdomain"]
    name = f"zerone-{secrets.token_hex(3)}"
    result = call("PUT", f"/accounts/{account}/workers/subdomain", {"subdomain": name})
    return result["subdomain"]


def ensure_widget(account):
    widgets = call("GET", f"/accounts/{account}/challenges/widgets?per_page=50") or []
    found = next((w for w in widgets if w.get("name") == WIDGET), None)
    if found is None:
        created = call("POST", f"/accounts/{account}/challenges/widgets",
                       {"name": WIDGET, "domains": DOMAINS, "mode": "managed"})
        return created["sitekey"], created["secret"], True
    if not set(DOMAINS) <= set(found.get("domains") or []):
        call("PUT", f"/accounts/{account}/challenges/widgets/{found['sitekey']}",
             {"name": WIDGET, "domains": sorted(set(DOMAINS) | set(found.get("domains") or [])),
              "mode": found.get("mode") or "managed"})
    details = call("GET", f"/accounts/{account}/challenges/widgets/{found['sitekey']}")
    return found["sitekey"], details["secret"], False


def put_secret(account, name, value):
    call("PUT", f"/accounts/{account}/workers/scripts/{SCRIPT}/secrets",
         {"name": name, "text": value, "type": "secret_text"})


def prepare():
    account = account_id()
    subdomain = ensure_subdomain(account)
    output(account_id=account, subdomain=subdomain, endpoint=f"https://{SCRIPT}.{subdomain}.workers.dev")


def configure_secrets():
    account = account_id()
    lines = []
    missing = [k for k in ("ANTHROPIC_API_KEY",) if not os.environ.get(k, "").strip()]
    if missing:
        raise CloudflareError("GitHub secret ANTHROPIC_API_KEY is missing; add it and run the workflow again")
    existing = {s["name"] for s in (call("GET", f"/accounts/{account}/workers/scripts/{SCRIPT}/secrets") or [])}
    for name in ("ANTHROPIC_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"):
        value = os.environ.get(name, "").strip()
        if value:
            put_secret(account, name, value)
            lines.append(f"{name}: ayarlandı")
        else:
            lines.append(f"{name}: GitHub'da yok, atlandı (müşteri bildirimleri Telegram'a gitmez)")
    if "IP_HASH_SALT" not in existing:
        salt = secrets.token_hex(32)
        mask(salt)
        put_secret(account, "IP_HASH_SALT", salt)
        lines.append("IP_HASH_SALT: yeni oluşturuldu")
    else:
        lines.append("IP_HASH_SALT: zaten vardı, korundu")
    sitekey, secret, created = ensure_widget(account)
    mask(secret)
    put_secret(account, "TURNSTILE_SECRET", secret)
    lines.append(f"Turnstile (bot koruması): {'yeni oluşturuldu' if created else 'zaten vardı'}, gizli anahtar Worker'a kaydedildi")
    subdomain = ensure_subdomain(account)
    endpoint = f"https://{SCRIPT}.{subdomain}.workers.dev"
    output(endpoint=endpoint, sitekey=sitekey)
    summary = "\n".join([
        f"Asistan adresi (assistant_endpoint): {endpoint}",
        f"Turnstile site anahtarı (assistant_turnstile_sitekey): {sitekey}",
        *lines,
    ])
    path = os.environ.get("SUMMARY_FILE")
    if path:
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(summary + "\n")
    print(summary)


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("prepare", "secrets"):
        sys.exit(__doc__)
    if not TOKEN:
        sys.exit("CLOUDFLARE_API_TOKEN is not set.")
    try:
        prepare() if sys.argv[1] == "prepare" else configure_secrets()
    except CloudflareError as error:
        print(f"Cloudflare hatası: {error}", file=sys.stderr)
        path = os.environ.get("SUMMARY_FILE")
        if path:
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(f"HATA: {error}\nAPI anahtarı izinlerini docs/ASISTAN.md'deki listeyle karşılaştırın.\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
