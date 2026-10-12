# Working with the owner

- The owner is a beginner and writes in Turkish. Reply in simple, step-by-step Turkish; code, commits and docs stay in English unless they are owner-facing (docs/*.md in Turkish, Telegram messages in Turkish).
- Minimise manual work for the owner. For any service with an API (Cloudflare, GitHub, Telegram, Formspree, IndexNow, Railway, ...), do the work yourself through a script or workflow instead of walking the owner through dashboards. Ask the owner only for what cannot be automated: creating an API token once, adding it as a GitHub Actions secret, or registrar steps without a usable API (Namecheap's API needs IP whitelisting and a spending threshold, so nameserver changes there stay manual).
- Secrets live only in GitHub Actions secrets and are used only inside workflows. Never ask the owner to paste a key into chat, never print or commit one.
- All alerts go to the owner's private Telegram bot (deploy/notify_telegram.py), in Turkish.
- Payments: hosted options only (PayPal, Square invoices, Stripe Payment Links). No integrations that make us handle card data.
- Changes go through a PR from the designated branch; run build.py, tests/validate_site.py and the Playwright suite before pushing.
- AI sales assistant (docs/ASISTAN.md): widget in static/assets/{js,css}/assistant.*, Cloudflare Worker in worker/assistant (deployed by assistant-deploy.yml). It is on only when site.config.json has assistant_endpoint (+ assistant_turnstile_sitekey); empty it to switch the assistant off. Run `npm test` in worker/assistant after Worker changes.
- Current project status, open items and the owner's to-do list: docs/DURUM.md (keep it updated after each piece of work).
