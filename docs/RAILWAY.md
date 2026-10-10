# Railway

Railway kurulumu hazır ama **kapalı** bekliyor. Siz açana kadar hiçbir şey çalışmaz, ücret oluşmaz ve DNS değişmez.

## Depoda hazır olanlar

| Dosya | Görevi |
|---|---|
| `Dockerfile` | Siteyi derler, doğrular ve nginx ile sunar (root olmayan kullanıcı, 8080 portu). |
| `railway.json` | Railway'e Dockerfile'ı kullanmasını, `/health` sağlık kontrolünü ve yeniden başlatma kuralını söyler. |
| `deploy/nginx/` | Güvenlik başlıkları (CSP, HSTS, X-Frame-Options…), eski adres yönlendirmeleri (301), dile göre 404 sayfası, önbellek ve sıkıştırma. |
| `tests/docker-smoke.sh` | İmajı çalıştırıp 22 kontrol yapar. CI her değişiklikte bu testi çalıştırır. |
| `.github/workflows/railway-deploy.yml` | İsteğe bağlı: GitHub'dan tek tuşla Railway'e yayın. |

GitHub Pages'te yapılamayan iki şey Railway'de hazır gelir: sunucu tarafı güvenlik başlıkları ve gerçek 301 yönlendirmeler.

## Tek tuşla açmak (önerilen yol)

1. https://railway.com → **New Project → Deploy from GitHub repo** → `Berkralod/zeroneinternational-site` seçin.
2. Railway `railway.json` dosyasını okuyup otomatik olarak derler ve yayınlar. Başka ayar gerekmez.
3. Test için: servis → **Settings → Networking → Generate Domain**. Size `…up.railway.app` uzantılı bir adres verilir. Bu adres arama motorlarına kapalıdır (`noindex`), sadece test içindir.
4. İsteğe bağlı: servis **Variables** bölümüne `ZERONE_FORMSPREE_FORM_ID` gibi ayarları ekleyebilirsiniz. Dockerfile bunları derleme sırasında otomatik alır.

Bundan sonra `main` dalına yapılan her değişiklik Railway'de de otomatik yayınlanır.

## Alternatif: GitHub Actions ile yayın

1. Railway'de projenin **Settings → Tokens** bölümünden bir *project token* oluşturun.
2. GitHub **Settings → Secrets and variables → Actions**:
   - **Secrets** sekmesi → `RAILWAY_TOKEN` = token. Token sadece burada durur, hiçbir dosyaya yazılmaz.
   - **Variables** sekmesi → `RAILWAY_SERVICE` = Railway servis adı.
   - İsteğe bağlı **Variables** → `RAILWAY_AUTO_DEPLOY` = `true`. Bu ayar `main` dalındaki her değişiklikte otomatik yayın yapar.
3. **Actions → Deploy to Railway → Run workflow**. İş akışı yayından önce imajı derleyip test eder.

## Alan adını Railway'e taşımak (DNS – şimdilik BEKLEMEDE)

Bu adım siz onaylayana kadar yapılmayacak. Taşımaya karar verdiğinizde:

1. Railway servis → **Settings → Networking → Custom Domain** → `zeroneinternational.com` (ve isterseniz `www.zeroneinternational.com`).
2. Railway'in verdiği CNAME/ALIAS kayıtlarını alan adı sağlayıcınızda girin. Kök alan adı için sağlayıcınızın CNAME flattening / ALIAS desteği gerekir; Cloudflare bunu destekler.
3. Railway sertifikayı otomatik alır. Site yeni adreste çalışınca GitHub Pages yayınını kapatabilirsiniz.

Geri dönüş kolaydır: DNS kayıtlarını eski hâline getirmeniz yeterli, GitHub Pages yayını çalışmaya devam eder.
