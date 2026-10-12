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

- **Saatlik sağlık kontrolü** (`.github/workflows/health-check.yml`, her saat başını 17 geçe): canlı sitedeki sitemap'te yer alan her sayfayı açar; canonical, CSP, hreflang ve yapılandırılmış veri etiketlerini, 404 sayfasını, http→https ve www yönlendirmelerini ve SSL sertifikasının bitiş tarihini (21 günden az kaldıysa uyarır) kontrol eder. Bir sorun bulursa 90 saniye sonra bir kez daha dener (kısa bir kesinti alarm sebebi olmasın diye). Sorun devam ederse **"Live site health check failed"** başlıklı bir GitHub issue açar (GitHub size e-posta gönderir) ve Telegram'a uyarı yollar. Sorun sürdükçe issue'ya ve Telegram'a en fazla **6 saatte bir** hatırlatma gider. Sorun düzelince issue kendiliğinden kapanır ve Telegram'a "düzeldi" mesajı gelir. Elle çalıştırmak için: Actions → Live site health check → Run workflow.
- **Yayın sonrası kontrol ve otomatik geri alma** (`deploy-pages.yml`): her yayından sonra canlı site birkaç dakika içinde aynı sağlık kontrolünden geçirilir. Kontrol başarısız olursa ve site yayından hemen önce sağlıklıysa (yani sorunu büyük olasılıkla bu yayın çıkardıysa), son **sağlam** yayın (canlıda kontrolü geçmiş son sürüm; 30 gün saklanır) otomatik olarak yeniden yayınlanır. Geri alma yeni commit oluşturmaz ve yeni bir çalıştırma başlatmaz, bu yüzden döngüye giremez. Hatalı commit `main`'de kalır; düzeltip tekrar göndermeniz gerekir.
- **Haftalık tam test** (`ci.yml`, her pazartesi): yeni commit olmasa bile tüm testleri `main` üzerinde yeniden çalıştırır; bir bağımlılık veya tarayıcı değişikliği bir şeyi bozarsa fark edilir.
- **CodeQL güvenlik taraması** (`codeql.yml`): her değişiklikte ve haftada bir Python, JavaScript ve iş akışı kodunu güvenlik açıklarına karşı tarar. Sonuçlar: repo → Security → Code scanning.
- **Dependabot** her hafta güncelleme önerir; testleri geçen güncellemeler incelenip birleştirilir.
- **Haftalık özet** (`weekly-digest.yml`, her pazartesi 07:37 UTC): açık Dependabot PR'larını, açık CodeQL uyarılarını, sitenin sağlık durumunu ve son yayın/test sonuçlarını tek bir Telegram mesajında toplar.

## Telegram uyarıları

Site bozulduğunda, yayın yapıldığında veya geri alındığında size özel Telegram botunuzdan kısa bir mesaj gelir. Telegram ayarlı değilse hiçbir şey bozulmaz; uyarılar sadece atlanır (GitHub issue ve e-postalar yine çalışır).

### Kurulum (bir kez, yaklaşık 5 dakika)

1. **Bot oluşturun:** Telegram'da **@BotFather**'ı açın, `/newbot` yazın, bir ad ve kullanıcı adı verin. BotFather size `123456789:ABC...` biçiminde bir **token** verir. Bu bir şifredir; kimseyle paylaşmayın, hiçbir dosyaya veya commit'e yazmayın.
2. **Botu başlatın:** BotFather'ın verdiği bağlantıdan kendi botunuzu açın ve **Start** (`/start`) deyin. Bunu yapmazsanız bot size mesaj gönderemez.
3. **Chat ID'nizi öğrenin:** Telegram'da **@userinfobot**'u açın ve `/start` gönderin. Size sayısal kimliğinizi (ör. `123456789`) yazar; bu sizin chat ID'nizdir.
4. **İki secret'ı GitHub'a ekleyin:** GitHub → repo **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - Name: `TELEGRAM_BOT_TOKEN`, Secret: BotFather'ın verdiği token
   - Name: `TELEGRAM_CHAT_ID`, Secret: @userinfobot'un verdiği sayı
5. **Deneyin:** Actions → **Weekly security and maintenance digest** → **Run workflow**. Birkaç saniye içinde Telegram'a haftalık özet gelmelidir. Gelmezse çalıştırmanın kaydında "Telegram message not sent" satırına bakın (token hiçbir zaman kayıtlarda görünmez).

Token sızdığından şüphelenirseniz: @BotFather → `/revoke` ile yeni token alın ve `TELEGRAM_BOT_TOKEN` secret'ını güncelleyin.

### Hangi mesaj ne anlama gelir?

| Mesaj | Anlamı | Ne yapmalı? |
| --- | --- | --- |
| **Site sağlık kontrolü BAŞARISIZ** | Canlı site saatlik kontrolde iki kez üst üste hata verdi. Mesajda sorunlar ve GitHub issue bağlantısı var. | Issue'daki listeye bakın; gerekirse bana iletin. |
| **Site hâlâ sorunlu (6 saatlik hatırlatma)** | Sorun hâlâ sürüyor. En fazla 6 saatte bir gelir. | Aynı issue üzerinden takip edin. |
| **Site tekrar çalışıyor** | Kontroller yeniden geçti; issue kapatıldı. | Bir şey yapmanıza gerek yok. |
| **Yayın başarılı** | `main`'deki değişiklik yayınlandı ve canlıda kontrolü geçti. Commit başlığı ve site adresi yazılır. | Yok. |
| **Yeni blog yazısı yayınlandı** | Yeni bir blog yazısı yayında; mesajda yazının adresi var. | İsterseniz sosyal medyada paylaşın. |
| **Blog yazısı güncellendi** | Başlığı `Blog:` ile başlayan ve mevcut bir yazıyı değiştiren commit yayınlandı. | Yok. |
| **Yayın durduruldu: derleme veya testler başarısız** | Yeni sürüm testleri geçemedi, **yayınlanmadı**. Canlı site değişmedi. | Değişikliği düzeltin. |
| **GitHub Pages'e yayınlama başarısız** | GitHub Pages yayını reddetti (çoğunlukla GitHub tarafında geçici sorun). | Actions'ta çalıştırmayı **Re-run** edin. |
| **Bozuk güncelleme geri alındı** | Yeni sürüm yayınlandı ama canlıda bozuk çıktı; son sağlam sürüm otomatik geri yüklendi. Mesaj, sitenin geri yüklemeden sonra sağlıklı olup olmadığını da söyler. | Hatalı commit'i düzeltin veya geri alın (`git revert`). |
| **Yayınlandı, ancak canlı site zaten sorunluydu** | Yeni sürüm yayınlandı; site yayından önce de hata veriyordu, yani sorun büyük olasılıkla bu değişiklikte değil (DNS, sertifika, GitHub kesintisi). Geri alma yapılmadı. | Saatlik kontrolün açtığı issue'ya bakın. |
| **ACİL: Yayından sonra site bozuk, geri alma BAŞARISIZ** | Yeni sürüm canlıda bozuk ve geri alma yapılamadı (ör. son 30 günde sağlam bir yayın yok). | Acil: commit'i hemen geri alın veya düzeltin. |
| **Ana daldaki (main) testler BAŞARISIZ / Haftalık otomatik test BAŞARISIZ** | `main` üzerindeki veya haftalık test çalıştırması başarısız. Canlı site etkilenmez; erken uyarıdır. | Bağlantıdaki kayda bakın. |
| **Haftalık güvenlik ve bakım özeti** | Pazartesi özeti: açık Dependabot PR'ları, CodeQL uyarıları, sağlık durumu. | Bekleyen güncellemeleri birleştirin. |

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
