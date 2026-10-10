/* Zerone International – progressive enhancements. Every feature also works (or degrades gracefully) without JavaScript. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function store(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  function read(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------- theme */
  var systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  function currentTheme() {
    var explicit = root.getAttribute("data-theme");
    if (explicit === "light" || explicit === "dark") return explicit;
    return systemDark.matches ? "dark" : "light";
  }
  function syncThemeButtons() {
    var dark = currentTheme() === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.setAttribute("aria-label", dark ? button.dataset.labelLight : button.dataset.labelDark);
      button.setAttribute("aria-pressed", dark ? "true" : "false");
    });
  }
  document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
    button.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      store("zerone-theme", next);
      syncThemeButtons();
    });
  });
  if (systemDark.addEventListener) systemDark.addEventListener("change", syncThemeButtons);
  syncThemeButtons();

  /* ---------------------------------------------------------------- dropdowns (language + mobile menu) */
  var dropdowns = Array.prototype.slice.call(document.querySelectorAll("[data-dropdown]"));
  dropdowns.forEach(function (dd) {
    dd.addEventListener("toggle", function () {
      if (!dd.open) return;
      dropdowns.forEach(function (other) { if (other !== dd) other.open = false; });
    });
    dd.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () { dd.open = false; });
    });
  });
  document.addEventListener("click", function (event) {
    dropdowns.forEach(function (dd) {
      if (dd.open && !dd.contains(event.target)) dd.open = false;
    });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    dropdowns.forEach(function (dd) {
      if (dd.open) {
        dd.open = false;
        var summary = dd.querySelector("summary");
        if (summary) summary.focus();
      }
    });
  });
  document.querySelectorAll("[data-dropdown] a[hreflang]").forEach(function (link) {
    link.addEventListener("click", function () { store("zerone-lang", link.getAttribute("hreflang")); });
  });
  document.querySelectorAll(".footer-langs a[hreflang]").forEach(function (link) {
    link.addEventListener("click", function () { store("zerone-lang", link.getAttribute("hreflang")); });
  });

  /* ---------------------------------------------------------------- language suggestion */
  (function () {
    var bar = document.querySelector("[data-lang-suggest]");
    var dataNode = document.getElementById("lang-suggest-data");
    if (!bar || !dataNode || read("zerone-lang-dismissed") || read("zerone-lang")) return;
    var data;
    try { data = JSON.parse(dataNode.textContent); } catch (e) { return; }
    var current = root.getAttribute("lang");
    var wanted = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""]);
    var match = null;
    for (var i = 0; i < wanted.length; i++) {
      var code = String(wanted[i]).toLowerCase().split("-")[0];
      if (code === current) return;
      if (data[code]) { match = code; break; }
    }
    if (!match) return;
    var info = data[match];
    var msg = bar.querySelector("[data-msg]");
    var go = bar.querySelector("[data-go]");
    var close = bar.querySelector("[data-dismiss]");
    bar.setAttribute("lang", match);
    bar.setAttribute("dir", match === "ar" ? "rtl" : "ltr");
    msg.textContent = info.msg;
    go.textContent = info.go;
    go.setAttribute("href", info.url);
    go.setAttribute("hreflang", match);
    close.setAttribute("aria-label", info.dismiss);
    go.addEventListener("click", function () { store("zerone-lang", match); });
    close.addEventListener("click", function () {
      store("zerone-lang-dismissed", "1");
      bar.hidden = true;
    });
    bar.hidden = false;
  })();

  /* ---------------------------------------------------------------- sticky call to action + back to top */
  var sticky = document.querySelector("[data-sticky-cta]");
  var toTop = document.querySelector("[data-back-to-top]");
  var ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY || window.pageYOffset;
    var nearBottom = window.innerHeight + y > document.documentElement.scrollHeight - 320;
    if (sticky) sticky.classList.toggle("is-visible", y > 480 && !nearBottom);
    if (toTop) toTop.hidden = y < 700;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();
  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      var main = document.getElementById("main");
      if (main) main.focus({ preventScroll: true });
    });
  }

  /* ---------------------------------------------------------------- use-case filters */
  var filters = document.querySelector("[data-filters]");
  var list = document.querySelector("[data-filter-list]");
  if (filters && list) {
    filters.hidden = false;
    filters.addEventListener("click", function (event) {
      var chip = event.target.closest("[data-filter]");
      if (!chip) return;
      var value = chip.getAttribute("data-filter");
      filters.querySelectorAll("[data-filter]").forEach(function (c) {
        c.setAttribute("aria-pressed", c === chip ? "true" : "false");
      });
      list.querySelectorAll("[data-service]").forEach(function (item) {
        item.hidden = value !== "all" && item.getAttribute("data-service") !== value;
      });
    });
  }

  /* ---------------------------------------------------------------- e-mail address (kept out of the HTML source) */
  document.querySelectorAll("[data-email-user]").forEach(function (link) {
    var address = link.getAttribute("data-email-user") + "@" + link.getAttribute("data-email-domain");
    link.setAttribute("href", "mailto:" + address);
    var label = link.querySelector("span");
    if (label) label.textContent = address;
  });

  /* ---------------------------------------------------------------- forms (Formspree) */
  document.querySelectorAll("form[data-ajax-form]").forEach(function (form) {
    var status = form.querySelector("[data-form-status]");
    var button = form.querySelector("[type=submit]");
    form.addEventListener("submit", function (event) {
      if (!window.fetch || !window.FormData) return; // plain POST fallback
      event.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      button.disabled = true;
      status.removeAttribute("data-state");
      status.textContent = form.dataset.sending;
      window.fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      }).then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        form.reset();
        status.setAttribute("data-state", "success");
        status.textContent = form.dataset.success;
      }).catch(function () {
        status.setAttribute("data-state", "error");
        status.textContent = form.dataset.error;
      }).then(function () {
        button.disabled = false;
      });
    });
  });

  /* ---------------------------------------------------------------- 404 page in the visitor's language */
  var nf = document.getElementById("notfound-data");
  if (nf) {
    try {
      var texts = JSON.parse(nf.textContent);
      var seg = window.location.pathname.split("/")[1];
      var code = texts[seg] ? seg : null;
      if (!code) {
        var langs = navigator.languages || [navigator.language || ""];
        for (var j = 0; j < langs.length && !code; j++) {
          var c = String(langs[j]).toLowerCase().split("-")[0];
          if (texts[c]) code = c;
        }
      }
      if (code && code !== root.getAttribute("lang")) {
        var t = texts[code];
        root.setAttribute("lang", code);
        root.setAttribute("dir", t.dir);
        document.title = t.title;
        document.querySelector("[data-nf=h1]").textContent = t.h1;
        document.querySelector("[data-nf=text]").textContent = t.text;
        var home = document.querySelector("[data-nf=home]");
        home.firstChild.textContent = t.home + " ";
        home.setAttribute("href", t.url);
      }
    } catch (e) { /* keep the default language */ }
  }
})();
