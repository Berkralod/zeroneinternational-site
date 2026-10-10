# Güvenlik

## Sitede yapılanlar

- **Saldırı yüzeyi çok küçük.** Site tamamen statik: veritabanı, giriş sistemi, sunucu kodu yok.
- **İçerik Güvenlik Politikası (CSP).** Her sayfada sadece sitenin kendi dosyalarına izin verilir; satır içi betik ve stil yoktur. Form yalnızca Formspree'ye, istatistik yalnızca Cloudflare'e bağlanabilir.
- **Çerçeve içine alınmaya karşı koruma (clickjacking).** GitHub Pages'te bunu JavaScript sağlar; site başka bir sitenin içinde açılırsa kendini gizler veya üst pencereyi siteye yönlendirir. Railway'de ayrıca `frame-ancestors 'none'` ve `X-Frame-Options: DENY` başlıkları gönderilir.
- **Railway'de tam güvenlik başlıkları:** HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP/CORP. Ayrıca sunucu sürümü gizlenir, gizli dosyalar engellenir ve GET/HEAD dışındaki istekler reddedilir. nginx root olmayan kullanıcıyla çalışır.
- **E-posta adresi** sayfa kaynağında düz metin olarak durmaz, JavaScript ile oluşturulur. Bu, e-posta toplayan botların işini zorlaştırır.
- **Form koruması:** gizli bal tuzağı (`_gotcha`) alanı, uzunluk sınırları ve Formspree'nin spam filtresi. Formspree'de **Allowed domains** ayarı yapılmalı (bkz. [Yayına alma](YAYINA-ALMA.md)).
- **Gizli anahtar taraması:** `tests/validate_site.py` yayınlanacak her dosyada token/anahtar kalıplarını arar; bulursa yayın durur.
- **GitHub Actions:** iş akışları en az yetkiyle çalışır (`contents: read`). Pages yayını yalnızca `pages: write` + `id-token` kullanır; artık `main` dalına yazan bir token yoktur. Dependabot, eylem ve paket güncellemelerini aylık önerir.
- **`/.well-known/security.txt`** güvenlik araştırmacılarına iletişim yolunu gösterir.

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
