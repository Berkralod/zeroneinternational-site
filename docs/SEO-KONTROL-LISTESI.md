# SEO kontrol listesi

## Sitede yapılmış olanlar (otomatik)

- 15 dilde 480 sayfa: her dilde ana sayfa, hizmetler ve 3 hizmet detayı, ürünler, 20 kullanım senaryosu sayfası, şirket, iletişim ve yasal sayfalar.
- Latin alfabeli dillerde yerelleştirilmiş adresler (örneğin `/tr/hizmetler/otomasyon-ve-botlar/`).
- Her sayfada aranan kelimelere göre yazılmış `title` ve `description`, `canonical`, 15 dil + `x-default` için karşılıklı `hreflang` etiketleri.
- Yapılandırılmış veri (JSON-LD): Organization, WebSite, WebPage, BreadcrumbList, FAQPage, Service, ItemList.
- Open Graph ve Twitter kartları, 1200×630 paylaşım görseli, favicon, uygulama simgeleri, manifest.
- Her sayfa için son güncelleme tarihi ve dil alternatifleri içeren `sitemap.xml`, `robots.txt`.
- Eski adreslerden yenilerine yönlendirme (`/tr.html` → `/tr/`).
- Hız: Lighthouse performans 97–100, SEO 100, erişilebilirlik 100. Sayfa başına yaklaşık 13 KB (sıkıştırılmış), harici kaynak yok.
- CI her değişiklikte bu kuralları kontrol eder; bozulursa yayın yapılmaz.

## Sizin hesabınızla yapılması gerekenler

Bu adımlar şirket hesaplarınızla giriş gerektirdiği için sizin tarafınızdan yapılmalı:

1. **Google Search Console** (https://search.google.com/search-console)
   - **Alan adı (Domain) mülkü** ekleyin. Bu yöntem DNS TXT kaydı ister; DNS beklemede olduğu için **URL öneki** yöntemini seçin: `https://zeroneinternational.com/`.
   - Doğrulama yöntemi olarak **HTML etiketi** seçin. `content="…"` içindeki kodu GitHub Variables'a `GOOGLE_SITE_VERIFICATION` olarak ekleyin ve siteyi yeniden yayınlayın.
   - **Site haritaları** → `https://zeroneinternational.com/sitemap.xml` gönderin.
2. **Bing Webmaster Tools** (https://www.bing.com/webmasters): Search Console'dan içe aktarabilir ya da `BING_SITE_VERIFICATION` ile doğrulayabilirsiniz. Bing, Yandex ve DuckDuckGo sonuçlarını da besler.
3. **Google İşletme Profili** (https://business.google.com): Zerone International LLC, Farmingville NY, kategori "Software company". Web sitesi olarak ana sayfayı verin.
4. **Profil bağlantıları:** LinkedIn şirket sayfası, GitHub, X vb. açın. Adreslerini `site.config.json` içindeki `same_as` listesine ekleyin; Google bunları şirketle eşleştirir.
5. **Geri bağlantılar:** Clutch, GoodFirms, DesignRush gibi yazılım şirketi dizinlerine ve Crunchbase'e kayıt olun. Bu, sıralama için en etkili adımlardan biridir.

## Sürekli yapılması önerilenler

- Search Console → **Performans** raporundan hangi aramalarda göründüğünüzü ayda bir kontrol edin. Gösterimi yüksek ama tıklaması düşük sayfaların `title` ve `description` metinlerini iyileştirin.
- Tamamlanan gerçek projeler için (müşteri izniyle) vaka çalışması sayfaları ekleyin. Gerçek referanslar hem güven hem sıralama sağlar.
- Çevirileri anadili o dil olan biri okusun. Doğal dil, sıralamayı ve dönüşümü artırır.

Google'da 1. sıra kimse tarafından garanti edilemez. Teknik taraf eksiksiz hazır; sıralama zamanla, içerikle ve geri bağlantılarla oluşur.
