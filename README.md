# Zerone International – web sitesi

https://zeroneinternational.com için kaynak kod. Site 15 dilde, tek şablondan üretilen statik bir sitedir.
GitHub Pages'te yayınlanır ve aynı kodla istendiğinde Railway'e de tek adımda taşınabilir.

## Hızlı başlangıç

```bash
pip install -r requirements.txt
python build.py                # siteyi dist/ klasörüne üretir
python tests/validate_site.py  # bağlantı, SEO, hreflang, güvenlik kontrolleri
python -m http.server 8000 --directory dist   # http://localhost:8000
```

Tarayıcı testleri (isteğe bağlı):

```bash
cd tests && npm ci && npx playwright install chromium
npx playwright test     # 15 dilde sayfa, mobil, tema, form, erişilebilirlik testleri
npx lhci autorun        # Lighthouse puanları
```

## Klasör yapısı

| Yol | İçerik |
|---|---|
| `content/<dil>.json` | Tüm metinler. `en.json` referanstır; diğer diller aynı yapıda olmak zorundadır. |
| `templates/` | Sayfa şablonları (Jinja2). Bütün diller aynı şablonu kullanır. |
| `static/` | CSS, JavaScript, logo, simgeler, yazı tipleri. |
| `site.config.json` | Alan adı, e-posta, Formspree, randevu, istatistik ve doğrulama ayarları. |
| `build.py` | Siteyi üreten derleyici. |
| `tests/` | Statik doğrulayıcı, Playwright + axe testleri, Lighthouse ayarı, Docker testi. |
| `Dockerfile`, `railway.json`, `deploy/nginx/` | Railway (Docker + nginx) kurulumu. |
| `.github/workflows/` | CI testleri, GitHub Pages yayını, Railway yayını. |
| `docs/` | Türkçe rehberler. |

## Rehberler

- [İçerik nasıl değiştirilir](docs/ICERIK-REHBERI.md)
- [Yayına alma ve ayarlar](docs/YAYINA-ALMA.md)
- [Railway](docs/RAILWAY.md)
- [SEO kontrol listesi](docs/SEO-KONTROL-LISTESI.md)
- [Güvenlik](docs/GUVENLIK.md)

## Önemli kurallar

- Bir metni değiştirirken **15 dil dosyasının hepsinde** aynı anahtar bulunmalıdır. Biri eksik olursa derleme durur. Bu kural, bir dilde bir bölümün kaybolmasını engeller.
- Depoya asla şifre, API anahtarı veya `.env` dosyası eklemeyin. Formspree form kimliği ve analiz kimliği gizli bilgi değildir. Railway token'ı ise **sadece** GitHub Secrets'ta durur.
