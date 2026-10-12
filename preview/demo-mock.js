/* Demo only: a fake assistant backend with canned answers, plus the demo control bar.
   It replaces window.fetch for the demo endpoint and the link catalogue; nothing leaves the browser. */
(function () {
  "use strict";
  var DEMO = JSON.parse(document.getElementById("demo-data").textContent);
  var params = new URLSearchParams(window.location.search);
  var lang = ["en", "tr", "ar"].indexOf(params.get("lang")) >= 0 ? params.get("lang") : "en";
  var theme = params.get("theme") === "dark" ? "dark" : params.get("theme") === "light" ? "light" : null;
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.lang = lang;
  document.documentElement.dir = DEMO.settings[lang].dir;

  // The widget reads its settings from #assistant-data, exactly as on the real site.
  var node = document.createElement("script");
  node.type = "application/json";
  node.id = "assistant-data";
  node.textContent = JSON.stringify(DEMO.settings[lang]);
  document.body.appendChild(node);

  var strikes = 0;
  function link(id) {
    var entry = DEMO.catalog.links[id];
    return entry ? { id: id, url: entry.urls[lang], label: entry.labels[lang] } : null;
  }
  var TEXT = {
    en: {
      hello: "Hi! I'm Emma. We build custom automation, bots, web and mobile apps, and tools for online resellers. What would you like to improve in your business?",
      resale: "We are building a crosslisting system and a liquidation lot analysis tool for resellers. Both are in development; you can join the waiting list. Which marketplaces do you sell on?",
      bots: "We build bots and integrations that use official APIs: notifications, data syncs and scheduled tasks. Which tools would you like to connect?",
      app: "We build web apps (dashboards, portals) and iOS/Android apps, with separate panels for owners, managers and employees. Who would use the app?",
      price: "Every project gets a written proposal with scope, timeline and price after a short discovery. I can't quote a price here, but the team can. Would you like to book a call?",
      pay: "You can pay an invoice by card on Stripe's page, through a Square invoice or with PayPal. Your card details never touch our website.",
      file: "Thanks for the file! I can see your current workflow. Which step takes the most time today?",
      lead: "Thank you! I've passed your details to the team, and they will get back to you within two business days.",
      offtopic: "Sorry, I can only help with Zerone International's services. Would you like to hear how we automate resale workflows?",
      generic: "Good question! We start with your workflow and then choose automation, a web app, a mobile app or a combination. What takes the most time in your business today?",
      s1: "How does a project work?", s2: "What does it cost?", s3: "Can I book a call?"
    },
    tr: {
      hello: "Merhaba! Ben Elif. Özel otomasyon, botlar, web ve mobil uygulamalar ile ikinci el satıcılar için araçlar geliştiriyoruz. İşletmenizde neyi iyileştirmek istersiniz?",
      resale: "İkinci el satıcılar için bir çapraz listeleme sistemi ve bir likidasyon lotu analiz aracı geliştiriyoruz. İkisi de geliştirme aşamasında; bekleme listesine katılabilirsiniz. Hangi pazar yerlerinde satış yapıyorsunuz?",
      bots: "Resmî API'leri kullanan botlar ve entegrasyonlar geliştiriyoruz: bildirimler, veri senkronizasyonu ve zamanlanmış görevler. Hangi araçları birbirine bağlamak istersiniz?",
      app: "Web uygulamaları (paneller, portallar) ve iOS/Android uygulamaları geliştiriyoruz; sahip, yönetici ve çalışan için ayrı paneller olabilir. Uygulamayı kimler kullanacak?",
      price: "Kısa bir ön görüşmenin ardından her proje için kapsam, süre ve fiyat içeren yazılı bir teklif hazırlanır. Burada fiyat veremem ama ekibimiz verebilir. Bir görüşme planlamak ister misiniz?",
      pay: "Faturanızı Stripe sayfasında kartla, Square faturasıyla veya PayPal ile ödeyebilirsiniz. Kart bilgileriniz sitemize hiç ulaşmaz.",
      file: "Dosya için teşekkürler! Mevcut iş akışınızı görüyorum. Bugün en çok zaman alan adım hangisi?",
      lead: "Teşekkürler! Bilgilerinizi ekibe ilettim; en geç iki iş günü içinde size dönüş yapacaklar.",
      offtopic: "Üzgünüm, yalnızca Zerone International'ın hizmetleriyle ilgili yardımcı olabilirim. İkinci el satış süreçlerini nasıl otomatikleştirdiğimizi anlatayım mı?",
      generic: "Güzel soru! İşe iş akışınızdan başlıyor, sonra otomasyon, web uygulaması, mobil uygulama veya bunların bir birleşimini seçiyoruz. Bugün işletmenizde en çok zamanı ne alıyor?",
      s1: "Proje süreci nasıl işliyor?", s2: "Maliyeti ne olur?", s3: "Görüşme planlayabilir miyim?"
    }
  };
  TEXT.ar = {
    hello: "مرحبًا! أنا ليلى. نطوّر أتمتة مخصصة وبوتات وتطبيقات ويب وجوال، وأدوات لبائعي إعادة البيع عبر الإنترنت. ما الذي تودّ تحسينه في عملك؟",
    resale: "نطوّر نظامًا للنشر المتعدد وأداة لتحليل دفعات التصفية لبائعي إعادة البيع. كلاهما قيد التطوير، ويمكنك الانضمام إلى قائمة الانتظار. على أي منصات تبيع؟",
    bots: "نطوّر بوتات وتكاملات تستخدم واجهات برمجة رسمية: إشعارات ومزامنة بيانات ومهام مجدولة. ما الأدوات التي تريد ربطها؟",
    app: "نطوّر تطبيقات ويب (لوحات تحكم وبوابات) وتطبيقات iOS وAndroid، مع لوحات منفصلة للمالك والمدير والموظف. من سيستخدم التطبيق؟",
    price: "يحصل كل مشروع على عرض مكتوب يتضمن النطاق والجدول الزمني والسعر بعد مرحلة استكشاف قصيرة. لا يمكنني تحديد سعر هنا، لكن فريقنا يستطيع. هل تود حجز مكالمة؟",
    pay: "يمكنك دفع الفاتورة بالبطاقة على صفحة Stripe أو عبر فاتورة Square أو باستخدام PayPal. بيانات بطاقتك لا تصل إلى موقعنا أبدًا.",
    file: "شكرًا على الملف! أرى سير العمل الحالي لديك. ما الخطوة التي تستغرق أطول وقت اليوم؟",
    lead: "شكرًا لك! أرسلت بياناتك إلى الفريق، وسيتواصلون معك خلال يومي عمل.",
    offtopic: "عذرًا، يمكنني المساعدة فقط في ما يخص خدمات Zerone International. هل تود معرفة كيف نؤتمت عمليات إعادة البيع؟",
    generic: "سؤال جيد! نبدأ من سير عملك ثم نختار الأتمتة أو تطبيق ويب أو تطبيق جوال أو مزيجًا منها. ما الذي يستهلك أكبر وقت في عملك اليوم؟",
    s1: "كيف يسير المشروع؟", s2: "كم التكلفة؟", s3: "هل يمكنني حجز مكالمة؟"
  };

  function answer(body) {
    var t = TEXT[lang];
    var replyLang = lang;
    var last = body.messages[body.messages.length - 1].content.toLowerCase();
    var out = { reply: t.generic, links: ["services", "contact"], suggestions: [t.s1, t.s2], off_topic: false };
    if (/goal|football|weather|fenerbah|galatasaray|maç|gol|hava|recipe|movie/.test(last)) {
      strikes += 1;
      out = { reply: t.offtopic, links: [], suggestions: [t.s1], off_topic: true };
    } else if (body.attachment) {
      out = { reply: t.file, links: ["service_automation"], suggestions: [t.s2] };
    } else if (/@|\+\d/.test(last)) {
      out = { reply: t.lead, links: ["booking"], suggestions: [], lead_sent: true };
    } else if (/price|cost|pric|fiyat|maliyet|süreç|project work|proje/.test(last)) {
      out = { reply: t.price, links: ["booking", "contact"], suggestions: [t.s3] };
    } else if (/pay|invoice|ödeme|fatura/.test(last)) {
      out = { reply: t.pay, links: ["pay_card", "payment"], suggestions: [] };
    } else if (/resale|resell|crosslist|inventory|ikinci el|çapraz|stok/.test(last)) {
      out = { reply: t.resale, links: ["products", "post-crosslisting-without-double-selling"], suggestions: [t.s1, t.s2] };
    } else if (/bot|integration|entegrasyon/.test(last)) {
      out = { reply: t.bots, links: ["service_automation"], suggestions: [t.s2] };
    } else if (/app|uygulama/.test(last)) {
      out = { reply: t.app, links: ["service_web", "service_mobile"], suggestions: [t.s2] };
    } else if (body.messages.length === 1) {
      out.reply = t.hello;
    }
    var now = Date.now();
    var result = {
      reply: out.reply, sig: "0".repeat(64), fallback: false, lang: replyLang,
      links: out.links.map(link).filter(Boolean), suggestions: out.suggestions,
      off_topic: out.off_topic || false, lead_sent: out.lead_sent || false, blocked_until: 0, now: now
    };
    if (strikes >= 3) {
      strikes = 0;
      result.blocked_until = now + 60 * 60 * 1000;
      result.reason = "offtopic";
    }
    return result;
  }

  function reply(json, status, delay) {
    return new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve(new Response(JSON.stringify(json), { status: status || 200, headers: { "Content-Type": "application/json" } }));
      }, delay || 0);
    });
  }
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url, init) {
    var u = String(url);
    if (u.indexOf("/assets/assistant-catalog.") === 0) return reply(DEMO.catalog);
    if (u.indexOf("https://assistant.demo.invalid/chat") === 0) return reply(answer(JSON.parse(init.body)), 200, 1100);
    if (u.indexOf("https://assistant.demo.invalid/lead") === 0) return reply({ ok: true }, 200, 700);
    return realFetch ? realFetch(url, init) : Promise.reject(new Error("offline demo"));
  };

  /* ---------------------------------------------------------------- demo control bar */
  function go(changes) {
    var p = new URLSearchParams(window.location.search);
    Object.keys(changes).forEach(function (k) { p.set(k, changes[k]); });
    window.location.search = p.toString();
  }
  function current() {
    var t = document.documentElement.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function panelOpen() { var p = document.querySelector(".zai-panel"); return p && !p.hidden; }
  function type(text) {
    var input = document.querySelector(".zai-input");
    input.value = text;
    document.querySelector(".zai-send").click();
  }
  var actions = {
    theme: function () { go({ theme: current() === "dark" ? "light" : "dark" }); },
    lang: function (value) { go({ lang: value }); },
    reset: function () {
      try { sessionStorage.clear(); localStorage.removeItem("zerone-assistant-muted"); } catch (e) { /* ignore */ }
      window.location.reload();
    },
    badge: function () {
      if (!panelOpen()) document.querySelector(".zai-launcher").click();
      type(lang === "tr" ? "Botlar hakkında bilgi alabilir miyim?" : "Tell me about bots");
      window.setTimeout(function () { document.querySelector(".zai-launcher").click(); }, 150);
    },
    offtopic: function () {
      if (!panelOpen()) document.querySelector(".zai-launcher").click();
      var questions = lang === "tr" ? ["Fenerbahçe bu hafta kaç gol attı?", "Yarın hava nasıl olacak?", "Galatasaray maçı kaç kaç bitti?"]
        : ["How many goals did Fenerbahçe score this week?", "What's the weather tomorrow?", "Who won the football match?"];
      var i = 0;
      (function next() {
        if (i >= questions.length) return;
        type(questions[i++]);
        window.setTimeout(next, 1500);
      })();
    },
    upload: function () {
      if (!panelOpen()) document.querySelector(".zai-launcher").click();
      var canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 200;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ecf0f4"; ctx.fillRect(0, 0, 320, 200);
      ctx.fillStyle = "#203a4b"; ctx.fillRect(20, 20, 280, 30);
      ctx.fillStyle = "#853c6d"; ctx.fillRect(20, 70, 120, 100);
      canvas.toBlob(function (blob) {
        var file = new File([blob], "workflow-screenshot.png", { type: "image/png" });
        var input = document.querySelector(".zai-form input[type=file]");
        var dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event("change"));
      }, "image/png");
    }
  };
  document.addEventListener("click", function (event) {
    var b = event.target.closest("[data-demo]");
    if (!b) return;
    event.preventDefault();
    actions[b.getAttribute("data-demo")](b.getAttribute("data-value"));
  });
  document.querySelectorAll("[data-demo=lang]").forEach(function (b) {
    b.setAttribute("aria-pressed", b.getAttribute("data-value") === lang ? "true" : "false");
  });
})();
