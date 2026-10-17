# Proje durumu (Claude'un devir notu)

Son güncelleme: 2026-10-17. Yeni bir oturum veya sohbet özetlemesinden sonra Claude buradan devam eder.

## Canlıda olanlar
- 15 dilli site (GitHub Pages), blog (her salı otomatik yazı), "Geliştiriciler için" sayfası.
- Ödeme: Stripe Payment Link (`stripe_payment_url`), Square fatura, PayPal.
- prismapi.dev ve zeroneholding.com → Cloudflare 301 yönlendirmesi (`domain-redirects.yml`).
- PayPal: Mercury banka hesapları bağlandı (12 Ekim 2026). "Activations Agent" e-postaları otomatik satış mesajı, cevap gerekmez.
- Apple Business: Zerone International LLC doğrulandı (12 Ekim 2026). Logo/marka kartı bilgisayarda eklenecek.
- Yapay zekâ satış asistanı açık (16 Ekim 2026): Worker `zerone-assistant.zerone-5dc7de.workers.dev`. Anthropic'te ayrı çalışma alanı `zerone-site`, aylık limit 20 $, anahtar `zerone-assistant` (bitiş tarihi konsolda; dolmadan yenilenecek).
- Otomasyonlar: saatlik sağlık kontrolü, yayın sonrası duman testi + otomatik geri alma, CodeQL, Dependabot (öneriler incelenip birleştirilir), haftalık güvenlik özeti, haftalık trafik raporu (Cloudflare), hepsi Telegram'a Türkçe.

## Açık işler
- **Ana alan adı Cloudflare DNS'e taşınıyor** (site GitHub Pages'te kalır): zon Cloudflare'de beklemede, canlı kayıtlar DNS-only kopyalandı, DNSSEC kapalı. E-posta Cloudflare Email Routing'e geçecek (berk@ ve diğer tüm adresler → şirket Gmail'i; sahip onayladı, 17 Ekim). Cloudflare yönlendirmeyi ancak alan adı aktif olunca açıyor. Bu yüzden `domain-watch.yml` 15 dakikada bir zonu kontrol ediyor; zon aktif olunca yönlendirmeyi hemen kendisi açıyor, Telegram'a yazıyor ve kendini kapatıyor. `domain-import.yml` mode `wait-activate` aynı işi elle başlatılan tek bir uzun çalıştırmayla yapar. Sahibin tek adımı: Namecheap'te Custom DNS → carrera.ns.cloudflare.com, nikon.ns.cloudflare.com. Sonra: `apply` ile son kontrol, site/MX/Search Console doğrulaması.
- **Yerel işletme hizmetleri** (sahibin 15 Ekim planı): kararlar verildi — telefon ve "Book a call" Ava (AI telefon hattı) hazır olana kadar kaldırıldı; altyapı Cloudflare (Workers + D1), Railway/n8n/Discourse ertelendi; marka "ZERONE International — Local Services" (`/local/`). Plan, durum ve hedef listesi gizli `zerone-local` deposunda (`docs/DURUM-LOCAL.md`). Herkese açık bu depoya iç maliyet, hedef işletme veya müşteri verisi yazılmaz.
- Dependabot #10 (Playwright 1.64): WebKit'te iletişim sayfasında CSP style-src uyarısı ve tema testi zamanlaması incelenecek.

## Dışarıdan beklenen
- Stripe: vergi numarası incelemesi tamamlandı (16 Ekim 2026).
- Google Search Console: www kopya sayfa uyarısı için "Validate fix" başlatıldı.

## Bilgisayar listesi (sahiple yapılacak)
2. LinkedIn şirket sayfası + profil
3. ~~Railway etkinleştirme + Discourse topluluk~~ ertelendi: Cloudflare aynı işi ücretsiz yapıyor; ancak bir ihtiyaç doğarsa açılır.
4. Square tam logo + Apple Business marka logosu
5. Google Search Console API (haftalık SEO raporu için)
6. ~~Sanal ofis/posta adresi~~ iptal (16 Ekim): sahip faturalarda ve yasal sayfalarda şirketin kendi adresinin görünmesini kabul etti.
7. Muhasebeci ve satış vergisi: sahip kendisi yürütüyor.
8. Telegram faz 2: satış onay botu "ZERONE Satış" (gizli depo); ücretli üyelik planı, API ürünleri, sosyal medya hesapları (Instagram, Facebook, X, YouTube) sonra.

## Hesaplar ve önemli notlar
- Şirket Gmail: zeronellc01@gmail.com (Stripe girişi Google ile, 2FA açık). Apple Business: berk@zeroneinternational.com.
- Telegram botu: Zerone Alerts. Secret'lar: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CLOUDFLARE_API_TOKEN (yalnızca GitHub'da).
- Cloudflare nameserver'ları (iki ek domain): carrera.ns.cloudflare.com, nikon.ns.cloudflare.com.
