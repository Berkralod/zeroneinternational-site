# İçerik rehberi

Sitedeki her metin `content/` klasöründeki dil dosyalarındadır:

```
content/en.json   İngilizce (referans)
content/tr.json   Türkçe
content/de.json … content/ja.json   diğer 13 dil
```

## Bir metni değiştirmek

1. `content/tr.json` içinde değiştirmek istediğiniz cümleyi bulun (örneğin `"h1": "İşinizin çalışma şekline uyan yazılım"`).
2. Yalnızca tırnak içindeki metni değiştirin. Anahtar adlarına (`"h1"` gibi) dokunmayın.
3. Aynı anahtarı diğer dillerde de güncelleyin. Çeviriyi bilmiyorsanız İngilizce bırakmak yerine bir çeviri isteyin; boş metin kabul edilmez.
4. `python build.py` çalıştırın. Hata yoksa değişiklik hazırdır.

GitHub'da doğrudan düzenleme yapabilirsiniz. Değişikliği `main` dalına kaydettiğinizde testler çalışır ve site otomatik olarak yayınlanır.

## Yeni bir FAQ sorusu, özellik maddesi vb. eklemek

Listeler (`"items"`, `"features"`, `"cases"`) her dilde **aynı sayıda** öğe içermelidir. Yeni bir öğe eklerseniz 15 dosyanın hepsine ekleyin. Derleyici sayılar tutmazsa hangi dosyada neyin eksik olduğunu yazar.

## Adresler (URL)

Her dilin adres kısmı `"slugs"` bölümündedir (örneğin Türkçede `hizmetler/otomasyon-ve-botlar`). Yayına alındıktan sonra adresleri değiştirmemeye çalışın; değişirse Google'daki eski bağlantılar 404 verir.

## Kullanım senaryoları

`"cases"` listesindeki 20 senaryonun hangi hizmete ait olduğu `build.py` içindeki `CASE_SERVICES` listesinde tanımlıdır. Sıra bütün dillerde aynıdır.

## Ayarlar (`site.config.json`)

| Ayar | Ne işe yarar |
|---|---|
| `formspree_form_id` | Formspree formunun kısa kimliği (ör. `xayzabcd`). Boşsa form yerine e-posta kutusu görünür. |
| `booking_url` | Calendly vb. randevu bağlantısı (`https://` ile). Doluysa iletişim sayfasında "Görüşme planla" düğmesi çıkar. |
| `whatsapp_number` | Ülke koduyla, sadece rakam (ör. `16315550123`). Doluysa WhatsApp düğmesi çıkar. |
| `stripe_payment_url` | Stripe Payment Link adresi (`https://buy.stripe.com/...`). Doluysa ödeme sayfasında ilk sırada "Kartla ödeyin" kartı çıkar; müşteri teklif veya faturadaki tutarı kendisi girer ve kart, Apple Pay veya Google Pay ile Stripe'ın sayfasında öder (USD). |
| `paypal_url`, `square_payment_url` | PayPal işletme profili ve Square ödeme bağlantısı. Doluysa ödeme sayfasında ilgili düğme çıkar. |
| `cloudflare_analytics_token` | Cloudflare Web Analytics kimliği (çerezsiz istatistik). |
| `google_site_verification`, `bing_site_verification` | Search Console / Bing Webmaster doğrulama kodları. |
| `same_as` | Şirketin LinkedIn, X vb. profil adresleri (Google bilgi kartı için). |

Bu ayarlar dosyaya yazılmak yerine GitHub **Settings → Secrets and variables → Actions → Variables** bölümünden de verilebilir: `FORMSPREE_FORM_ID`, `BOOKING_URL`, `WHATSAPP_NUMBER`, `CLOUDFLARE_ANALYTICS_TOKEN`, `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`.

## Logo ve görseller

- Logo: `static/assets/img/logo-navy.svg`, `logo-white.svg`, sayfa içi sürüm `templates/partials/logo.svg`.
- Simgeler ve paylaşım görseli logodan üretilir: `cd tests && npm run images`.
- Sayfalardaki çizimler `templates/partials/art.html` içindedir. Metin içermedikleri için dile göre değişmezler ve renklerini temadan alırlar.

## Blog yazısı ekleme

1. `content/blog/` klasörüne yeni bir dosya ekleyin. Dosya adı adresi belirler: `yeni-yazi-basligi.md` → `zeroneinternational.com/blog/yeni-yazi-basligi/` (küçük harf, Türkçe karakter yok, kelimeler arasında tire).
2. Dosyanın en üstüne bu bilgileri yazın, altına yazının metnini Markdown ile ekleyin (`## Ara başlık`, `- madde`, `**kalın**`, `[bağlantı](/contact/)`):

```
---
title: Yazının başlığı (en fazla ~60 karakter)
description: Google'da görünecek bir-iki cümlelik özet (~150 karakter)
date: 2026-10-11
tags: Crosslisting, Automation
---
```

3. Yazıyı güncellerseniz `updated: 2026-11-02` satırını ekleyin.

Yazılar şimdilik yalnızca İngilizce yayınlanır; diğer 14 dildeki blog sayfası aynı yazıları "şimdilik İngilizce" notuyla listeler. Yazılar site haritasına, RSS akışına (`/blog/feed.xml`) ve Google'ın okuduğu `BlogPosting` verisine otomatik eklenir; yayından sonra Bing'e de otomatik haber gider.

**Bülten aboneleri** Formspree'de "form: newsletter" olarak görünür (Formspree → Submissions). Listeyi oradan CSV olarak indirebilirsiniz.

## Geliştiriciler sayfası

"Geliştiriciler için" sayfası (`/developers/`, Türkçede `/tr/gelistiriciler/`) henüz yayında olmayan API ürünlerini "Planlanıyor" etiketiyle tanıtır. Metinler her dil dosyasında `pages.developers` bölümündedir. Bu sayfada fiyat, çalışma süresi (uptime) veya SLA sözü vermeyin; ürünler gerçekten açılana kadar her şey "planlanıyor" olarak kalmalıdır.

**Erken erişim başvuruları** Formspree'de "form: developers-waitlist" olarak görünür (Formspree → Submissions).
