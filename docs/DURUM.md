# Proje durumu (Claude'un devir notu)

Son güncelleme: 2026-10-12. Yeni bir oturum veya sohbet özetlemesinden sonra Claude buradan devam eder.

## Canlıda olanlar
- 15 dilli site (GitHub Pages), blog (her salı otomatik yazı), "Geliştiriciler için" sayfası.
- Ödeme: Stripe Payment Link (`stripe_payment_url`), Square fatura, PayPal.
- prismapi.dev ve zeroneholding.com → Cloudflare 301 yönlendirmesi (`domain-redirects.yml`).
- Otomasyonlar: saatlik sağlık kontrolü, yayın sonrası duman testi + otomatik geri alma, CodeQL, Dependabot (öneriler incelenip birleştirilir), haftalık güvenlik özeti, haftalık trafik raporu (Cloudflare), hepsi Telegram'a Türkçe.

## Açık işler
- **PR #29 (yapay zekâ asistanı, kapalı gelir):** sahip onayıyla `mask()` kaldırıldı; CI yeşil olunca birleştirilecek.
- Asistanı açmak (bilgisayarda): `docs/ASISTAN.md` adımları → Anthropic anahtarı + harcama limiti, Cloudflare token'a Workers Scripts/Turnstile Edit, GitHub secret `ANTHROPIC_API_KEY`, `assistant-deploy.yml` çalıştır, sonra Claude `assistant_endpoint` ve `assistant_turnstile_sitekey` değerlerini ayarlar.
- Dependabot #10 (Playwright 1.64): WebKit'te iletişim sayfasında CSP style-src uyarısı ve tema testi zamanlaması incelenecek.

## Dışarıdan beklenen
- Stripe: vergi numarası incelemesi (In review). 11 Kasım 2026 veya $600 hacimden önce bitmeli.
- Apple Business Connect: şirket doğrulaması (EIN mektubu yüklendi), sonuç berk@zeroneinternational.com'a.
- Google Search Console: www kopya sayfa uyarısı için "Validate fix" başlatıldı.

## Bilgisayar listesi (sahiple yapılacak)
1. Yapay zekâ asistanını açmak
2. LinkedIn şirket sayfası + profil
3. Railway etkinleştirme + Discourse topluluk
4. Square tam logo
5. Google Search Console API (haftalık SEO raporu için)
6. Sanal ofis/posta adresi (faturalarda ev adresi görünmesin)
7. Muhasebeciye: satış vergisi (Stripe Tax kapalı)
8. Telegram faz 2 (satış/üyelik bildirimleri), ücretli üyelik planı, API ürünleri, sosyal medya hesapları (Instagram, Facebook, X, YouTube)

## Hesaplar ve önemli notlar
- Şirket Gmail: zeronellc01@gmail.com (Stripe girişi Google ile, 2FA açık). Apple Business: berk@zeroneinternational.com.
- Telegram botu: Zerone Alerts. Secret'lar: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CLOUDFLARE_API_TOKEN (yalnızca GitHub'da).
- Cloudflare nameserver'ları (iki ek domain): carrera.ns.cloudflare.com, nikon.ns.cloudflare.com.
