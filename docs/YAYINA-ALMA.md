# Yayına alma

Site GitHub Pages'ten yayınlanır. Alan adı (`zeroneinternational.com`) ve DNS **değişmez**.

## Yeni siteye ilk geçiş (bir kez yapılır)

Önceki sitede derlenmiş dosyalar doğrudan `main` dalında duruyordu. Yeni düzende `main` dalında kaynak kod bulunur, siteyi GitHub Actions üretip yayınlar. Bu yüzden geçişte sıra önemlidir:

1. **Önce** GitHub'da: **Settings → Pages → Build and deployment → Source** = **GitHub Actions**.
   Bu ayar değişince mevcut canlı site yayında kalmaya devam eder.
2. Aynı sayfada **Custom domain** alanında `zeroneinternational.com` yazdığını ve **Enforce HTTPS** kutusunun işaretli olduğunu kontrol edin.
3. Yeni siteyi içeren pull request'i `main` dalına birleştirin (merge).
4. **Actions** sekmesinde "Deploy to GitHub Pages" iş akışı çalışır. Testler geçerse site birkaç dakika içinde yayına girer.

> 1. adım atlanırsa GitHub, `main` dalındaki kaynak dosyaları eski yöntemle yayınlamaya çalışır ve site bozuk görünür. Böyle olursa 1. adımı yapıp **Actions → Deploy to GitHub Pages → Run workflow** ile yeniden çalıştırmanız yeterlidir.

## Sonraki güncellemeler

`main` dalına her kayıtta site otomatik olarak test edilir ve yayınlanır. Testler başarısız olursa yayın yapılmaz, canlı site eski hâliyle kalır.

## Formspree (iletişim formu)

1. https://formspree.io adresinde ücretsiz hesap açın (`berk@zeroneinternational.com`).
2. **New form** ile bir form oluşturun. Adresi `https://formspree.io/f/xayzabcd` şeklindedir; son kısım (`xayzabcd`) form kimliğidir.
3. Formspree ayarlarında **Allowed domains** alanına `zeroneinternational.com` ekleyin. Böylece form başka sitelerden kötüye kullanılamaz.
4. Form kimliğini GitHub'da **Settings → Secrets and variables → Actions → Variables → New variable** ile ekleyin: ad `FORMSPREE_FORM_ID`, değer `xayzabcd`. Alternatif olarak `site.config.json` içine de yazabilirsiniz.
5. Siteyi yeniden yayınlayın (**Actions → Deploy to GitHub Pages → Run workflow**).

Hem proje formu hem bekleme listesi formu aynı Formspree formuna gider. Gelen e-postalarda `form` alanı `project` ya da `waitlist` olarak görünür.

## İsteğe bağlı ayarlar

Aynı **Variables** ekranından eklenir. Ayrıntılar [İçerik rehberi](ICERIK-REHBERI.md#ayarlar-siteconfigjson) içinde.

- `BOOKING_URL`: Calendly vb. randevu bağlantısı
- `WHATSAPP_NUMBER`: WhatsApp numarası
- `CLOUDFLARE_ANALYTICS_TOKEN`: çerezsiz ziyaretçi istatistiği
- `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`: arama motoru doğrulama kodları
