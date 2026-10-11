# Güvenlik

## Sitede yapılanlar

- **Saldırı yüzeyi çok küçük.** Site tamamen statik: veritabanı, giriş sistemi, sunucu kodu yok.
- **İçerik Güvenlik Politikası (CSP).** Her sayfada sadece sitenin kendi dosyalarına izin verilir; satır içi betik ve stil yoktur. Form yalnızca Formspree'ye, istatistik yalnızca Cloudflare'e bağlanabilir.
- **Çerçeve içine alınmaya karşı koruma (clickjacking).** GitHub Pages'te bunu JavaScript sağlar; site başka bir sitenin içinde açılırsa kendini gizler veya üst pencereyi siteye yönlendirir. Railway'de ayrıca `frame-ancestors 'none'` ve `X-Frame-Options: DENY` başlıkları gönderilir.
- **Railway'de tam güvenlik başlıkları:** HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP/CORP. Ayrıca sunucu sürümü gizlenir, gizli dosyalar engellenir ve GET/HEAD dışındaki istekler reddedilir. nginx root olmayan kullanıcıyla çalışır.
- **E-posta adresi** sayfa kaynağında düz metin olarak durmaz, JavaScript ile oluşturulur. Bu, e-posta toplayan botların işini zorlaştırır.
- **Form koruması:** gizli bal tuzağı (`_gotcha`) alanı, uzunluk sınırları ve Formspree'nin spam filtresi. Formspree'de **Allowed domains** ayarı yapılmalı (bkz. [Yayına alma](YAYINA-ALMA.md)).
- **Gizli anahtar taraması:** `tests/validate_site.py` yayınlanacak her dosyada token/anahtar kalıplarını arar; bulursa yayın durur.
- **GitHub Actions:** iş akışları en az yetkiyle çalışır (`contents: read`). Pages yayını yalnızca `pages: write` + `id-token` kullanır; artık `main` dalına yazan bir token yoktur. Dependabot, eylem ve paket güncellemelerini haftalık önerir.
- **`/.well-known/security.txt`** güvenlik araştırmacılarına iletişim yolunu gösterir.

## Otomatik kontroller

- **Günlük sağlık kontrolü** (`.github/workflows/health-check.yml`, her gün 11:17 UTC): canlı sitedeki sitemap'te yer alan her sayfayı açar; canonical, CSP, hreflang ve yapılandırılmış veri etiketlerini, 404 sayfasını, http→https ve www yönlendirmelerini ve SSL sertifikasının bitiş tarihini (21 günden az kaldıysa uyarır) kontrol eder. Sorun bulursa **"Live site health check failed"** başlıklı bir GitHub issue açar ve GitHub size e-posta gönderir. Sorun düzelince issue kendiliğinden kapanır. Elle çalıştırmak için: Actions → Live site health check → Run workflow.
- **Haftalık tam test** (`ci.yml`, her pazartesi): yeni commit olmasa bile tüm testleri `main` üzerinde yeniden çalıştırır; bir bağımlılık veya tarayıcı değişikliği bir şeyi bozarsa fark edilir.
- **CodeQL güvenlik taraması** (`codeql.yml`): her değişiklikte ve haftada bir Python, JavaScript ve iş akışı kodunu güvenlik açıklarına karşı tarar. Sonuçlar: repo → Security → Code scanning.
- **Dependabot** her hafta güncelleme önerir; testleri geçen güncellemeler incelenip birleştirilir.

## GitHub hesabında sizin yapmanız gerekenler

1. **İki adımlı doğrulama (2FA):** github.com → Settings → Password and authentication. Mutlaka açık olmalı; hesabınız ele geçirilirse her şey ele geçirilir.
2. **Secret scanning ve Push protection:** repo → Settings → Code security → ikisini de **Enable**. Push protection, birisi yanlışlıkla anahtar commit etmeye çalışırsa engeller. Bunu **tüm repolarınızda** açın.
3. **Dal koruması:** repo → Settings → Branches → **Add rule** → `main`:
   - Require a pull request before merging
   - Require status checks to pass ("Build, validate and test", "Railway image")
   - Block force pushes
4. **Diğer public repolar:** `bstock-analyzer-bot`, `g2-scraping-api`, `e-commerce-content-engine`, `halal-travel-umrah-planner`. Bunlarda `.env`, API anahtarı veya token commit edilmiş mi kontrol ettirin. Geçmişte bir anahtar commit edildiyse silmek yetmez; o anahtarı **iptal edip yenisini oluşturun**. Bu oturumda bu repolara erişimim yoktu, isterseniz eklediğinizde tararım.
5. **Formspree, Railway, Cloudflare** hesaplarında da 2FA açın.

## Bir güvenlik sorunu fark ederseniz

Sitedeki iletişim formunu veya e-posta adresini kullanın. Açık bir GitHub issue'su açmayın.
