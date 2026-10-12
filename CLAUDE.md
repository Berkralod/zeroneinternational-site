# Working with the owner

- The owner is a beginner and writes in Turkish. Reply in simple, step-by-step Turkish; code, commits and docs stay in English unless they are owner-facing (docs/*.md in Turkish, Telegram messages in Turkish).
- Minimise manual work for the owner. For any service with an API (Cloudflare, GitHub, Telegram, Formspree, IndexNow, Railway, ...), do the work yourself through a script or workflow instead of walking the owner through dashboards. Ask the owner only for what cannot be automated: creating an API token once, adding it as a GitHub Actions secret, or registrar steps without a usable API (Namecheap's API needs IP whitelisting and a spending threshold, so nameserver changes there stay manual).
- Secrets live only in GitHub Actions secrets and are used only inside workflows. Never ask the owner to paste a key into chat, never print or commit one.
- All alerts go to the owner's private Telegram bot (deploy/notify_telegram.py), in Turkish.
- Payments: hosted options only (PayPal, Square invoices, Stripe Payment Links). No integrations that make us handle card data.
- Changes go through a PR from the designated branch; run build.py, tests/validate_site.py and the Playwright suite before pushing.
