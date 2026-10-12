#!/usr/bin/env bash
# Smoke test for the Railway/Docker image: starts the container and checks
# health, security headers, redirects, 404 pages, caching and hidden files.
# Usage: tests/docker-smoke.sh <image>
set -euo pipefail
IMAGE="${1:-zerone-site:test}"
PORT=18080
NAME="zerone-smoke-$$"
docker run -d --rm --name "$NAME" -e PORT=$PORT -p $PORT:$PORT "$IMAGE" >/dev/null
trap 'docker logs "$NAME" 2>&1 | tail -20; docker stop "$NAME" >/dev/null 2>&1 || true' EXIT
B="http://127.0.0.1:$PORT"
for _ in $(seq 1 30); do curl -fs "$B/health" >/dev/null && break; sleep 1; done

fail=0
check() { if eval "$2"; then echo "ok   - $1"; else echo "FAIL - $1"; fail=1; fi; }
headers=$(curl -sI "$B/")
has() { grep -qi "^$1" <<<"$headers"; }

check "health endpoint" '[ "$(curl -s $B/health)" = "ok" ]'
check "home page 200" '[ "$(curl -s -o /dev/null -w %{http_code} $B/)" = 200 ]'
check "Turkish home 200" '[ "$(curl -s -o /dev/null -w %{http_code} $B/tr/)" = 200 ]'
for h in "Content-Security-Policy: .*frame-ancestors 'none'" "Strict-Transport-Security" "X-Content-Type-Options: nosniff" \
         "X-Frame-Options: DENY" "Referrer-Policy" "Permissions-Policy" "Cross-Origin-Opener-Policy"; do
  check "header $h" "has \"$h\""
done
check "nginx version hidden" '! grep -qi "^Server: nginx/" <<<"$headers"'
check "old /tr.html redirects" '[ "$(curl -s -o /dev/null -w "%{http_code} %header{location}" $B/tr.html)" = "301 /tr/" ]'
check "old /company.html redirects" '[ "$(curl -s -o /dev/null -w "%{http_code} %header{location}" $B/company.html)" = "301 /company/" ]'
check "missing page is 404" '[ "$(curl -s -o /dev/null -w %{http_code} $B/does-not-exist)" = 404 ]'
check "Turkish 404 page" '[[ "$(curl -s $B/tr/yok)" == *"<html lang=\"tr\""* ]]'
check "hidden files blocked" '[ "$(curl -s -o /dev/null -w %{http_code} $B/.git/config)" = 404 ]'
check "security.txt served" '[ "$(curl -s -o /dev/null -w %{http_code} $B/.well-known/security.txt)" = 200 ]'
check "POST rejected" '[ "$(curl -s -o /dev/null -w %{http_code} -X POST $B/)" = 403 ]'
css=$(grep -m1 -o '/assets/css/site\.[0-9a-f]*\.css' <<<"$(curl -s "$B/")")
check "fingerprinted CSS cached immutably" 'grep -qi "immutable" <<<"$(curl -sI $B$css)"'
check "gzip enabled" 'grep -qi "content-encoding: gzip" <<<"$(curl -sI -H "Accept-Encoding: gzip" $B/)"'
check "railway.app address not indexed" 'grep -qi "x-robots-tag: noindex" <<<"$(curl -sI -H "Host: example.up.railway.app" $B/)"'
check "real domain indexable" '! grep -qi "x-robots-tag" <<<"$(curl -sI -H "Host: zeroneinternational.com" $B/)"'
exit $fail
