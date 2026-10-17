# Proje durumu (Claude'un devir notu)

Son güncelleme: 2026-10-17. Yeni bir oturum veya sohbet özetlemesinden sonra Claude buradan devam eder.

## Canlıda olanlar
- 15 dilli site (GitHub Pages), blog (her salı otomatik yazı), "Geliştiriciler için" sayfası.
- Ödeme: Stripe Payment Link (`stripe_payment_url`), Square fatura, PayPal.
- prismapi.dev ve zeroneholding.com → Cloudflare 301 yönlendirmesi (`domain-redirects.yml`).
- PayPal: Mercury banka hesapları bağlandı (12 Ekim 2026). "Activations Agent" e-postaları otomatik satış mesajı, cevap gerekmez.
- Apple Business: Zerone International LLC doğrulandı (12 Ekim 2026). Logo/marka kartı bilgisayarda eklenecek.
- Yapay zekâ satış asistanı açık (16 Ekim 2026): Worker `zerone-assistant.zerone-5dc7de.workers.dev`. Anthropic'te ayrı çalışma alanı `zerone-site`, aylık limit 20 $, anahtar `zerone-assistant` (bitiş tarihi konsolda; dolmadan yenilenecek).
- Ana alan adı Cloudflare DNS'te (17 Ekim 2026). Site GitHub Pages'te kalıyor: kayıtlar DNS-only, Google doğrulama kaydı korundu. E-posta Cloudflare Email Routing ile çalışıyor: berk@ ve diğer tüm adresler → zeronellc01@gmail.com (MX route1-3.mx.cloudflare.net). Gönderim için DKIM ve DMARC, Google Workspace açılınca kurulacak.
- Otomasyonlar: saatlik sağlık kontrolü, yayın sonrası duman testi + otomatik geri alma, CodeQL, Dependabot (öneriler incelenip birleştirilir), haftalık güvenlik özeti, haftalık trafik raporu (Cloudflare), hepsi Telegram'a Türkçe.

## Açık işler
- **Yerel işletme hizmetleri** (sahibin 15 Ekim planı): kararlar verildi — telefon ve "Book a call" Ava (AI telefon hattı) hazır olana kadar kaldırıldı; altyapı Cloudflare (Workers + D1), Railway/n8n/Discourse ertelendi; marka "ZERONE International — Local Services" (`/local/`). Plan, durum ve hedef listesi gizli `zerone-local` deposunda (`docs/DURUM-LOCAL.md`). Herkese açık bu depoya iç maliyet, hedef işletme veya müşteri verisi yazılmaz.
- **Telefon ve SMS (17 Ekim, sahibin kararı):**
  - Sitede iki numara var.
  - **Arama: (631) 900-2595.** Bu numarayı AI telefon asistanı Ava açıyor, 7/24 ve İngilizce konuşuyor.
  - **SMS: (631) 319-7032.** Bu sahibin Google Voice numarası. Mesajları ekip kendisi okuyup cevaplıyor.
  - Numaraların göründüğü yerler: iletişim sayfası (15 dil), `/local/` genel bakış ve fiyat sayfaları, şirket bilgisi (schema), sohbet asistanının bilgisi.
  - Gizlilik eki LS-PRIV-2 olarak güncellendi: Google Voice, Brevo ve yazılı teklif eklendi.
  - Ava'nın kurulumu gizli depoda (`zerone-local`: `ava/`, `docs/AVA.md`, `docs/TEKLIF.md`).
- **`/local/` bölümü (ZERONE International — Local Services)**, sadece İngilizce: genel bakış (`content/local/index.md`), yerel hizmetler gizlilik eki (LS-PRIV-1) ve hizmet şartları (LS-TERMS-1). 15 dilde site altına "For local businesses" bağlantısı eklendi. Fiyat sayfası henüz yok: sahibin fiyat kararı ve istatistiklerin birincil kaynaktan doğrulanması bekleniyor. Yasal metinler ilk müşteriden önce avukata gösterilecek (taslaklar gizli depoda: `legal-drafts/`). Sahip yayını onayladı (17 Ekim). Memnuniyet garantisi 14 gün (sahibin kararı). Fiyatları sahip Claude'a bıraktı; fiyat sayfası araştırmayla hazırlanıyor.
- Dependabot #10 (Playwright 1.64): WebKit'te iletişim sayfasında CSP style-src uyarısı ve tema testi zamanlaması incelenecek.

## Dışarıdan beklenen
- Stripe: vergi numarası incelemesi tamamlandı (16 Ekim 2026).
- Google Search Console: www kopya sayfa uyarısı için "Validate fix" başlatıldı.

## Bilgisayar listesi (sahiple yapılacak) — durum 17 Ekim 2026 akşamı
Kurulum aşaması bitti. Güncel ve tam liste gizli depoda: `zerone-local/plan/YOL-HARITASI.md` → "GÜNCEL DURUM" bölümü.
1. ~~Asistan anahtarını yenile~~ ✅ yapıldı.
2. LinkedIn şirket sayfası + profil: ⏳ bilerek sonraya, ilk müşterilerden sonra (sosyal medya ile birlikte).
3. ~~Railway + Discourse~~ ertelendi: Cloudflare aynı işi ücretsiz yapıyor. İhtiyaç doğarsa açılır.
4. Square tam logo + Apple Business marka logosu: ⏳ **açık**, sahip panelden yükleyecek (~15 dk, API yok).
5. Google Search Console API (haftalık SEO raporu): ⏳ bilerek sonraya.
6. ~~Sanal ofis/posta adresi~~ iptal (16 Ekim): sahip şirket adresinin görünmesini kabul etti.
7. Muhasebeci ve satış vergisi: ✅ sahip kendisi yürütüyor.
8. ~~Telegram faz 2 "ZERONE Satış" botu~~ ✅ yapıldı. Ücretli üyelik, API ürünleri ve sosyal medya (Instagram, Facebook, X, YouTube) sonraya.

**Sıradaki işler:**
- İlk müşterilere ulaşma planı (sahip "müşteri bulmaya başlayalım" deyince).
- Stripe abonelik ödeme linkleri ($149 / $249).
- SMS operatör kaydı (ilk Growth müşterisinde).
- Müşteriye özel Ava.
- İlk ücretli teslimattan önce sigorta.

## Hesaplar ve önemli notlar
- Şirket Gmail: zeronellc01@gmail.com (Stripe girişi Google ile, 2FA açık). Apple Business: berk@zeroneinternational.com.
- Telegram botu: Zerone Alerts. Secret'lar: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, CLOUDFLARE_API_TOKEN (yalnızca GitHub'da).
- Cloudflare nameserver'ları (iki ek domain): carrera.ns.cloudflare.com, nikon.ns.cloudflare.com.
