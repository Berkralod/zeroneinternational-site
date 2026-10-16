# Proje durumu (Claude'un devir notu)

Son güncelleme: 2026-10-16. Yeni bir oturum veya sohbet özetlemesinden sonra Claude buradan devam eder.

## Canlıda olanlar
- 15 dilli site (GitHub Pages), blog (her salı otomatik yazı), "Geliştiriciler için" sayfası.
- Ödeme: Stripe Payment Link (`stripe_payment_url`), Square fatura, PayPal.
- prismapi.dev ve zeroneholding.com → Cloudflare 301 yönlendirmesi (`domain-redirects.yml`).
- PayPal: Mercury banka hesapları bağlandı (12 Ekim 2026). "Activations Agent" e-postaları otomatik satış mesajı, cevap gerekmez.
- Apple Business: Zerone International LLC doğrulandı (12 Ekim 2026). Logo/marka kartı bilgisayarda eklenecek.
- Yapay zekâ satış asistanı açık (16 Ekim 2026): Worker `zerone-assistant.zerone-5dc7de.workers.dev`. Anthropic'te ayrı çalışma alanı `zerone-site`, aylık limit 20 $, anahtar `zerone-assistant` (bitiş tarihi konsolda; dolmadan yenilenecek).
- Otomasyonlar: saatlik sağlık kontrolü, yayın sonrası duman testi + otomatik geri alma, CodeQL, Dependabot (öneriler incelenip birleştirilir), haftalık güvenlik özeti, haftalık trafik raporu (Cloudflare), hepsi Telegram'a Türkçe.

## Açık işler
- **Asistan anahtarı:** ilk `ANTHROPIC_API_KEY` kopyalanırken bozuldu (içinde satır sonu, eksik karakter); asistan "Bir sorun oluştu" diyor. Sahip yeni anahtarı Copy düğmesiyle girecek, Claude `assistant-deploy.yml`'yi çalıştırıp `assistant-diagnose.yml` ile doğrulayacak.
- **Yerel işletme hizmetleri** (sahibin 15 Ekim planı): kararlar verildi — telefon ve "Book a call" Ava (AI telefon hattı) hazır olana kadar kaldırıldı; altyapı Cloudflare (Workers + D1), Railway/n8n/Discourse ertelendi; marka "ZERONE International — Local Services" (`/local/`). Ayrıntılı plan ve hedef listesi gizli `zerone-local` deposuna konacak (sahip depoyu açıp Claude GitHub App'e erişim verecek). Herkese açık bu depoya iç maliyet, hedef işletme veya müşteri verisi yazılmaz.
- Dependabot #10 (Playwright 1.64): WebKit'te iletişim sayfasında CSP style-src uyarısı ve tema testi zamanlaması incelenecek.

## Dışarıdan beklenen
- Stripe: vergi numarası incelemesi tamamlandı (16 Ekim 2026).
- Google Search Console: www kopya sayfa uyarısı için "Validate fix" başlatıldı.

## Bilgisayar listesi (sahiple yapılacak)
2. LinkedIn şirket sayfası + profil
3. Railway etkinleştirme + Discourse topluluk
4. Square tam logo + Apple Business marka logosu
5. Google Search Console API (haftalık SEO raporu için)
6. Sanal ofis/posta adresi (faturalarda ev adresi görünmesin)
7. Muhasebeciye: satış vergisi (Stripe Tax kapalı)
8. Telegram faz 2 (satış/üyelik bildirimleri), ücretli üyelik planı, API ürünleri, sosyal medya hesapları (Instagram, Facebook, X, YouTube)

## Hesaplar ve önemli notlar
- Şirket Gmail: zeronellc01@gmail.com (Stripe girişi Google ile, 2FA açık). Apple Business: berk@zeroneinternational.com.
- Telegram botu: Zerone Alerts. Secret'lar: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CLOUDFLARE_API_TOKEN (yalnızca GitHub'da).
- Cloudflare nameserver'ları (iki ek domain): carrera.ns.cloudflare.com, nikon.ns.cloudflare.com.
