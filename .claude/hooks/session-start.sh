#!/bin/bash
# Cloud sessions only: install what build.py, tests/validate_site.py, the Playwright suite and the
# assistant Worker tests need, so a session can run them right away (CLAUDE.md: run all three before pushing).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

pip install -q --disable-pip-version-check -r requirements.txt

(cd tests && npm install --no-audit --no-fund --loglevel=error)
[ -f worker/assistant/package.json ] && (cd worker/assistant && npm install --no-audit --no-fund --loglevel=error)

# The container ships one Chromium build, but tests/ pins its own Playwright version, which wants another
# revision and cannot download it here; tests/playwright.config.js launches this one instead.
if [ -x /opt/pw-browsers/chromium ]; then
  echo "export PW_CHROMIUM_PATH=/opt/pw-browsers/chromium" >> "${CLAUDE_ENV_FILE:-/dev/null}"
fi
