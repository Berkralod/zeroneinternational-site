# Yapay zekâ satış asistanı

Sitenin sağ alt köşesinde açılan küçük bir sohbet penceresi. Ziyaretçinin sorularını yanıtlar, onu doğru sayfaya yönlendirir ve satın almaya hazır ziyaretçileri size Telegram'dan bildirir.

**Şu an kapalı.** Kod sitede hazır durur ama `site.config.json` içindeki `assistant_endpoint` boş olduğu sürece sitede hiçbir şey görünmez ve hiçbir şey değişmez.

Telefonunuzda nasıl görüneceğini görmek için: `preview/assistant-demo.html` dosyasını açın (GitHub'da dosyaya gidip **Raw** yerine **Download** ile indirip açabilirsiniz). Bu sayfa sahte bir sunucu kullanır, hiçbir yere bağlanmaz.

## Ne yapar?

- Ziyaretçi hangi dilde yazarsa o dilde cevap verir (sitenin 15 dili). Kendini o dile uygun bir kadın adıyla tanıtır: İngilizce Emma, Türkçe Elif, Almanca Lena, İspanyolca Lucía, Fransızca Camille, İtalyanca Giulia, Portekizce Beatriz, Felemenkçe Sanne, Lehçe Zofia, Rusça Anna, Ukraynaca Olena, Arapça Layla, Hintçe Ananya, Çince Lin, Japonca Yui.
- Açılışta kısa bir karşılama ve konu düğmeleri gösterir: özel yazılım/otomasyon, ikinci el satıcı araçları, botlar ve entegrasyonlar, web veya mobil uygulama, fiyat ve proje süreci, ödemeler ve faturalar, "Diğer".
- Cevaplarının altına ilgili sayfaları **düğme** olarak koyar (yeni sekmede açılır). Bu bağlantılar sadece sitemizin kendi sayfaları, randevu, WhatsApp, Telegram, ödeme sayfaları ve blog yazılarıdır. Yapay zekâ kendi başına bağlantı uyduramaz.
- Randevu almaz, ödeme almaz, e-posta göndermez. Ziyaretçiye sadece doğru bağlantıyı verir.
- Fiyat, teslim tarihi veya garanti uydurmaz; teklif için iletişim sayfasına veya görüşmeye yönlendirir. Hukuki veya vergi tavsiyesi vermez.
- Ziyaretçi bir proje istediğinde adını ve e-postasını (veya telefonunu) nazikçe ister. Ziyaretçi bunları yazdığında size **Telegram'dan Türkçe bir mesaj** gelir: ihtiyaç özeti, iletişim bilgisi, hangi sayfadan geldiği ve dili.
- Ziyaretçi isterse **"Bu sohbeti ekibe gönder"** düğmesiyle, onay kutusunu işaretleyerek konuşmayı size gönderebilir. Bu da Telegram'a gelir.
- Ziyaretçi bir görsel (JPEG, PNG, WebP, GIF) veya PDF ekleyebilir: dosya başına en fazla 4 MB, PDF en fazla 10 sayfa, bir sohbette en fazla 3 dosya. Büyük fotoğraflar tarayıcıda otomatik küçültülür. Dosyalar **hiçbir yerde saklanmaz**.
- Pencere kapalıyken cevap gelirse düğmede küçük bir nokta ve kısa, yumuşak bir ses çıkar. Ziyaretçi sesi zil simgesiyle kapatabilir.
- Açık ve koyu temaya, Arapça (sağdan sola) yazıya, klavye ve ekran okuyucu kullanımına uygundur. Telefonda tam ekran açılır.

## Kötüye kullanıma karşı kurallar

Bu kuralların hepsi sunucuda (Cloudflare Worker) uygulanır. Ziyaretçi tarayıcısını temizlese veya cihaz değiştirse de aynı ağdan geldiği sürece kurallar devam eder.

| Durum | Ne olur? |
|---|---|
| Konu dışı soru (ör. "Fenerbahçe bu hafta kaç gol attı?") | Kısa ve kibar bir cevapla konuya döner, 1 uyarı sayılır. |
| Asistanı kandırma denemesi (talimatlarını isteme, rolünü değiştirmeye çalışma) | Kibarca reddeder, 1 uyarı sayılır. |
| 1 saat içinde 3 uyarı | O IP adresi **1 saat engellenir**. Pencerede geri sayım (dakika:saniye) görünür, yazı alanı kapanır. |
| 10 dakikada 20'den fazla mesaj | Geçici engel, geri sayımla. |
| 24 saatte 60'tan fazla mesaj | Ertesi güne kadar engel, geri sayımla. |
| Tüm site için günlük üst sınır (varsayılan 1500 mesaj) | Asistan "şu an çok yoğun" der ve iletişim bağlantılarını gösterir. Size bir kez Telegram mesajı gelir. |

Ek korumalar: Cloudflare Turnstile ile robot kontrolü (ziyaretçi çoğu zaman bir şey görmez), sadece `zeroneinternational.com` adresinden gelen istekler kabul edilir, mesaj en fazla 1000 karakter, yapay zekâya sohbetin sadece son 8 mesajı gönderilir, ziyaretçinin uydurduğu "asistan cevapları" imza kontrolüyle elenir.

**Gizlilik:** Sohbetler sunucuda saklanmaz; sadece ziyaretçinin tarayıcı sekmesinde durur ve sekme kapanınca silinir. IP adresinin kendisi değil, geri çevrilemez bir özeti (hash) sayaçlarla birlikte en fazla 24 saat tutulur. Asistan açıldığında gizlilik sayfasına 15 dilde bununla ilgili bir paragraf otomatik eklenir.

## Maliyet ve nasıl sınırlanır

- Yapay zekâ: Anthropic'in en hızlı ve en ucuz modeli **Claude Haiku 5.5** kullanılır.
- Tahmini maliyet: mesaj başına yaklaşık **0,05 – 0,1 sent** (yani 1000 mesaj ≈ 0,5 – 1 dolar). PDF eklenen mesajlar biraz daha pahalıdır.
- En kötü durumda bile günlük üst sınır (1500 mesaj) yüzünden harcama günde yaklaşık 1,5 – 2 doları geçemez.
- Ek güvence olarak Anthropic'te **aylık harcama limiti** koyacaksınız (aşağıda, 1. adım). Limit dolarsa asistan sadece "tekrar deneyin / bize ulaşın" der, sitenin geri kalanı etkilenmez.
- Cloudflare tarafı ücretsiz plan içinde kalır (Workers ve Durable Objects ücretsiz planı).

Günlük üst sınırı değiştirmek isterseniz Claude'a söyleyin (`worker/assistant/wrangler.toml` içindeki `DAILY_REQUEST_CAP`).

## Asistanı açmak: bilgisayar başında yapacaklarınız

Toplam 15–20 dakika sürer. Hiçbir anahtarı sohbete yapıştırmayın; hepsi sadece GitHub'a girilir.

### 1. Anthropic API anahtarı ve aylık harcama limiti

1. https://console.anthropic.com adresine girin (yoksa `berk@zeroneinternational.com` ile hesap açın).
2. **Settings → Billing**: bir ödeme yöntemi ekleyin ve küçük bir bakiye yükleyin (ör. 10 $).
3. **Settings → Limits**: **Monthly spend limit** (aylık harcama limiti) alanına örneğin **20 $** yazıp kaydedin. Bu, ne olursa olsun aşılamayacak üst sınırdır.
4. **Settings → API Keys → Create Key**: ad olarak `zerone-assistant` yazın. **Scope** alanında **Organization değil**, asistan için açtığınız çalışma alanını (`zerone-site`) seçin; organizasyon kapsamlı anahtarlarla asistan çalışmaz. **Create** deyin.
5. Gösterilen anahtarı (`sk-ant-...` ile başlar) **yanındaki Copy düğmesiyle** kopyalayın; fareyle seçerek kopyalamayın (satır kayıp anahtar bozulabiliyor). Bu anahtar bir daha gösterilmez; hemen 3. adıma geçin.

### 2. Cloudflare API anahtarına izin eklemek

Domain yönlendirmeleri için zaten bir `CLOUDFLARE_API_TOKEN` var. Ona üç izin ekleyeceğiz:

1. https://dash.cloudflare.com/profile/api-tokens adresine gidin.
2. Mevcut anahtarın yanındaki **⋯ → Edit** (Düzenle) seçeneğine tıklayın.
3. **Permissions** bölümünde **+ Add more** ile şunları ekleyin (sol kutu **Account** olacak):
   - **Account → Workers Scripts → Edit**
   - **Account → Turnstile → Edit**
   - **Account → Account Settings → Read** (büyük ihtimalle zaten var)
4. **Account Resources** bölümünde hesabınızın seçili olduğundan emin olun.
5. **Continue to summary → Update token** deyin. Anahtarın değeri değişmez; GitHub'da bir şey güncellemeniz gerekmez.

> Durable Objects (sayaçların tutulduğu küçük veritabanı) için ayrı bir izin gerekmez; **Workers Scripts → Edit** bunu kapsar. Kurulum yine de izin hatası verirse, hata mesajı Telegram'a gelir; Claude'a iletin.

### 3. GitHub'a anahtarları eklemek

Şu bağlantıyı açın: https://github.com/Berkralod/zeroneinternational-site/settings/secrets/actions/new

- **Name:** `ANTHROPIC_API_KEY`
- **Secret:** 1. adımda kopyaladığınız anahtar
- **Add secret** deyin.

`TELEGRAM_BOT_TOKEN` ve `TELEGRAM_CHAT_ID` zaten ekli olmalı (diğer bildirimler için kullanılıyor). Değilse aynı sayfadan ekleyin.

### 4. Kurulumu çalıştırmak

1. https://github.com/Berkralod/zeroneinternational-site/actions/workflows/assistant-deploy.yml adresine gidin.
2. **Run workflow → Run workflow** deyin.
3. 2–3 dakika sonra Telegram'a **"AI asistan Cloudflare'e kuruldu"** mesajı gelir. İçinde asistan adresi (`https://zerone-assistant....workers.dev`) ve Turnstile site anahtarı yazar. Bunlar gizli değildir.

### 5. Claude'a haber vermek

Claude'a şunu yazın: **"Asistan kurulum mesajı geldi, asistanı sitede aç."** Gerekirse Telegram mesajını da iletin. Claude, adresi ve site anahtarını `site.config.json` içine yazıp bir pull request açar; testler geçtikten sonra birleştirildiğinde asistan sitede görünür.

## Asistanı kapatmak

`site.config.json` içinde `assistant_endpoint` değerini boşaltmak (`""`) yeterlidir. Claude'a **"Asistanı kapat"** demeniz de olur. Site bir sonraki yayında asistansız hâline döner; Cloudflare'deki Worker zararsız şekilde beklemeye devam eder.

**Asistan "Bir sorun oluştu" diyorsa:** Actions sekmesinde **AI assistant diagnosis** iş akışını çalıştırın (Claude da çalıştırabilir). Asistanın yapay zekâya gönderdiği isteğin aynısını bir kez gönderir ve sonucu (durum kodu, anahtarın uzunluğu/biçimi; anahtarın kendisi asla) kayda yazar. Kurulum iş akışı da anahtarı her kurulumdan önce dener; bozuksa Telegram'a Türkçe uyarı gelir.

Acil durumda (ör. beklenmedik harcama): Anthropic konsolunda **API Keys** sayfasından anahtarı **Disable** edin. Asistan hemen "tekrar deneyin / bize ulaşın" moduna geçer, site çalışmaya devam eder.

## İleride: kendi alan adı (isteğe bağlı)

Şu an asistan `workers.dev` adresinde çalışır, bu yeterlidir. `assistant.zeroneinternational.com` gibi bir adres istenirse, alan adının DNS'inin Cloudflare'e taşınması gerekir (şu an Namecheap/GitHub Pages'te). Bu zorunlu değildir; istediğinizde Claude'a sorun.

## Teknik özet (Claude ve geliştiriciler için)

- Widget: `static/assets/js/assistant.js`, `static/assets/css/assistant.css`. Sadece `assistant_endpoint` doluyken `dist/`'e kopyalanır ve sayfaya eklenir; CSP de sadece o zaman genişler (`challenges.cloudflare.com` script/frame, Worker adresi connect).
- Bağlantı kataloğu derleme sırasında `build.py` tarafından üretilir: `build/assistant-data.json` (Worker için) ve `dist/assets/assistant-catalog.<hash>.json` (widget için).
- Worker: `worker/assistant/` (Cloudflare Worker + iki SQLite Durable Object). Testler: `cd worker/assistant && npm ci && npm test`.
- Tarayıcı testleri: `ZERONE_ASSISTANT_ENDPOINT=https://assistant.test.invalid ZERONE_ASSISTANT_TURNSTILE_SITEKEY=1x00000000000000000000AA python3 build.py` ve ardından `cd tests && npx playwright test e2e/assistant.spec.js`.
- Önizleme: `python3 build.py && python3 preview/make_demo.py` → `preview/assistant-demo.html`.
- Kurulum: `.github/workflows/assistant-deploy.yml` + `deploy/assistant_setup.py`.
