"""Send a short message to the owner's private Telegram bot. Standard library only.

Usage:
    python3 deploy/notify_telegram.py [--title TITLE] [message text ...]
    echo "message" | python3 deploy/notify_telegram.py --title "Deploy"

The message is plain text: it is HTML-escaped before sending, so characters such as < > & from
error messages or commit titles are shown as typed. The optional title is shown in bold above it.

Configuration (GitHub Actions secrets, passed in as environment variables):
    TELEGRAM_BOT_TOKEN   the bot token from @BotFather
    TELEGRAM_CHAT_ID     your numeric chat id (from @userinfobot)

When either is missing the script prints "Telegram not configured" and exits 0, so workflows keep
working before the secrets are added. The token is never printed; it is masked in any error text.
Exit code 1 means the message could not be delivered after 3 attempts.
"""
import argparse
import html
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://api.telegram.org/bot{token}/sendMessage"
MAX_LENGTH = 4096  # Telegram's limit for one message, counted after entity parsing.
ATTEMPTS = 3


def build_text(title, body):
    """Escape plain text for parse_mode=HTML and keep it under Telegram's length limit."""
    body = body.strip()
    parts = []
    if title:
        parts.append(f"<b>{html.escape(title.strip(), quote=False)}</b>")
    if body:
        # Leave room for the title; cut on the plain text so no escape sequence is split.
        room = MAX_LENGTH - len(title or "") - 40
        if len(body) > room:
            body = body[:room].rstrip() + "\n…(truncated)"
        parts.append(html.escape(body, quote=False))
    return "\n".join(parts)


def mask(text, secret):
    return text.replace(secret, "***") if secret else text


def send(token, chat_id, text):
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }).encode("utf-8")
    request = urllib.request.Request(
        API.format(token=token),
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "zeroneinternational-notify/1.0"},
        method="POST",
    )
    for attempt in range(1, ATTEMPTS + 1):
        wait = 2 ** attempt
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                result = json.loads(response.read().decode("utf-8", "replace"))
            if result.get("ok"):
                return True
            error = f"Telegram answered ok=false: {result.get('description', '')}"
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                body = json.loads(exc.read().decode("utf-8", "replace"))
                detail = body.get("description", "")
                wait = max(wait, int(body.get("parameters", {}).get("retry_after", 0)))
            except (ValueError, AttributeError, OSError):
                pass
            error = f"HTTP {exc.code} {detail}".strip()
            if exc.code in (400, 401, 403, 404):
                # Bad token, wrong chat id or a malformed message: retrying will not help.
                print(f"Telegram message not sent: {mask(error, token)}", file=sys.stderr)
                return False
        except (OSError, ValueError) as exc:
            error = f"{type(exc).__name__}: {exc}"
        print(f"Telegram attempt {attempt}/{ATTEMPTS} failed: {mask(error, token)}", file=sys.stderr)
        if attempt < ATTEMPTS:
            time.sleep(min(wait, 30))
    return False


def main():
    parser = argparse.ArgumentParser(description="Send a message to the owner's Telegram bot.")
    parser.add_argument("--title", default="", help="bold first line")
    parser.add_argument("message", nargs="*", help="message text (read from stdin when omitted)")
    args = parser.parse_args()

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        print("Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing); skipping.")
        return 0

    body = " ".join(args.message) if args.message else ("" if sys.stdin.isatty() else sys.stdin.read())
    text = build_text(args.title, body)
    if not text:
        print("Nothing to send.")
        return 0
    if send(token, chat_id, text):
        print("Telegram message sent.")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
