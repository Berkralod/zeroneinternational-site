/* Zerone International – AI sales assistant widget (loaded only when site.config.json has an assistant_endpoint).
   CSP-safe: no inline handlers or styles, no eval, and every piece of text from the server or the model is
   inserted with textContent. Links are accepted only when they match the build-time link catalogue. */
(function () {
  "use strict";

  var dataNode = document.getElementById("assistant-data");
  if (!dataNode || !window.fetch || !window.Promise) return;
  var cfg;
  try { cfg = JSON.parse(dataNode.textContent); } catch (e) { return; }
  if (!cfg || !/^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?(\/[A-Za-z0-9._~\/-]*)?$/.test(cfg.endpoint || "")) return;

  var T = cfg.t || {};
  var NAMES = { en: "Emma", tr: "Elif", de: "Lena", es: "Lucía", fr: "Camille", it: "Giulia", pt: "Beatriz", nl: "Sanne",
    pl: "Zofia", ru: "Anna", uk: "Olena", ar: "Layla", hi: "Ananya", zh: "Lin", ja: "Yui" };
  var MAX_INPUT = 1000;
  var MAX_FILE = 4 * 1024 * 1024;
  var MAX_UPLOADS = 3;
  var MAX_PDF_PAGES = 10;
  var HISTORY = 8;
  var VERIFIED_FOR = 25 * 60 * 1000; // a little less than the Worker trusts a Turnstile check
  var FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
  var STATE_KEY = "zerone-assistant";
  var MUTE_KEY = "zerone-assistant-muted";
  var pageLang = NAMES[cfg.lang] ? cfg.lang : "en";
  var endpoint = cfg.endpoint.replace(/\/$/, "");
  var mobile = window.matchMedia("(max-width: 640px)");

  /* ---------------------------------------------------------------- storage (always optional) */
  function sessionGet() {
    try { return JSON.parse(window.sessionStorage.getItem(STATE_KEY) || "null"); } catch (e) { return null; }
  }
  function sessionSet(value) {
    try { window.sessionStorage.setItem(STATE_KEY, JSON.stringify(value)); } catch (e) { /* storage full or blocked */ }
  }
  function localGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function localSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  function newId() {
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  var state = sessionGet();
  if (!state || typeof state !== "object" || !/^[a-f0-9]{32}$/.test(state.cid || "")) {
    state = { cid: newId(), messages: [], nameLang: "", uploads: 0, blockedUntil: 0, reason: "", verifiedAt: 0 };
  }
  if (!Array.isArray(state.messages)) state.messages = [];
  function save() {
    state.messages = state.messages.slice(-40);
    sessionSet(state);
  }

  function fill(text, values) {
    return String(text || "").replace(/\{(\w+)\}/g, function (m, key) { return values[key] !== undefined ? values[key] : m; });
  }
  function currentName() { return NAMES[state.nameLang] || NAMES[pageLang]; }

  /* ---------------------------------------------------------------- DOM helpers */
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  var SVG_NS = "http://www.w3.org/2000/svg";
  var ICONS = {
    chat: ["M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z", "M8.5 9.5h7M8.5 12.5h4"],
    close: ["M6 6l12 12M18 6L6 18"],
    send: ["M21 3L3 10.5l7 2.5 2.5 7z", "M10 13l11-10"],
    clip: ["M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"],
    bell: ["M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z", "M10 20.5a2 2 0 0 0 4 0"],
    bellOff: ["M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8", "M10 20.5a2 2 0 0 0 4 0", "M3 3l18 18"],
    file: ["M7 3h7l5 5v13H7z", "M14 3v5h5"],
    arrow: ["M5 12h14M13 6l6 6-6 6"],
    refresh: ["M20 11a8 8 0 1 0-2.3 5.7", "M20 4v7h-7"],
    team: ["M4 6h16v10H8l-4 4z", "M9 11h6M12 8v6"]
  };
  function icon(name, cls) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "zai-svg" + (cls ? " " + cls : ""));
    ICONS[name].forEach(function (d) {
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }
  function iconButton(name, label, cls) {
    var b = el("button", "zai-icon" + (cls ? " " + cls : ""));
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.appendChild(icon(name));
    return b;
  }
  // Text containing {link}: the link is a real element, the rest stays text.
  function withLink(parent, text, href, label) {
    var parts = String(text).split("{link}");
    parent.appendChild(document.createTextNode(parts[0] || ""));
    if (parts.length > 1) {
      var a = el("a", "zai-inline-link", label);
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener";
      parent.appendChild(a);
      parent.appendChild(document.createTextNode(parts.slice(1).join("")));
    }
    return parent;
  }
  function sitePath(value) {
    var v = String(value || "");
    return /^\/(?!\/)[A-Za-z0-9._~\/%-]*$/.test(v) ? v : "/";
  }

  /* ---------------------------------------------------------------- link catalogue (build time allowlist) */
  var catalogPromise = null;
  function loadCatalog() {
    if (!catalogPromise) {
      var path = String(cfg.catalog || "");
      catalogPromise = /^\/assets\/assistant-catalog\.[0-9a-f]{10}\.json$/.test(path)
        ? window.fetch(path, { credentials: "same-origin" }).then(function (r) {
            if (!r.ok) throw new Error("catalog");
            return r.json();
          }).then(function (data) { return data && data.links ? data.links : {}; })
          .catch(function () { catalogPromise = null; return {}; })
        : Promise.resolve({});
    }
    return catalogPromise;
  }
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  // A link from the server is shown only if its id exists and its URL is one of that id's catalogue URLs.
  function checkedLinks(catalog, links, lang) {
    var out = [];
    (Array.isArray(links) ? links : []).forEach(function (link) {
      if (!link || typeof link.id !== "string" || !own(catalog, link.id) || out.length >= 3) return;
      var entry = catalog[link.id];
      var urls = entry.urls || {};
      var match = Object.keys(urls).some(function (k) { return urls[k] === link.url; });
      if (!match || !/^https:\/\//.test(link.url)) return;
      var labels = entry.labels || {};
      out.push({ url: link.url, label: labels[lang] || labels[pageLang] || labels.en || link.id });
    });
    return out;
  }
  function contactLinks(catalog) {
    return ["contact", "booking", "whatsapp", "telegram"].filter(function (id) { return own(catalog, id); }).map(function (id) {
      var entry = catalog[id];
      return { id: id, url: entry.urls[pageLang] || entry.urls.en };
    });
  }

  /* ---------------------------------------------------------------- notification sound (WebAudio, no file) */
  var audio = null;
  var muted = localGet(MUTE_KEY) === "1";
  function unlockAudio() {
    if (audio || muted) return;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try { audio = new Ctx(); } catch (e) { audio = null; }
  }
  function chime() {
    if (muted || !audio) return;
    try {
      if (audio.state === "suspended") audio.resume();
      var t0 = audio.currentTime + 0.02;
      [[784, 0], [1175, 0.13]].forEach(function (note) {
        var osc = audio.createOscillator();
        var gain = audio.createGain();
        osc.type = "sine";
        osc.frequency.value = note[0];
        gain.gain.setValueAtTime(0.0001, t0 + note[1]);
        gain.gain.exponentialRampToValueAtTime(0.05, t0 + note[1] + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note[1] + 0.45);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(t0 + note[1]);
        osc.stop(t0 + note[1] + 0.5);
      });
    } catch (e) { /* sound is optional */ }
  }

  /* ---------------------------------------------------------------- build the widget */
  var root = el("div", "zai");
  root.setAttribute("lang", pageLang);
  root.setAttribute("dir", cfg.dir === "rtl" ? "rtl" : "ltr");

  var launcher = el("button", "zai-launcher");
  launcher.type = "button";
  launcher.setAttribute("aria-haspopup", "dialog");
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "zai-panel");
  launcher.appendChild(icon("chat"));
  var badge = el("span", "zai-badge");
  badge.setAttribute("aria-hidden", "true");
  badge.hidden = true;
  launcher.appendChild(badge);

  var panel = el("div", "zai-panel");
  panel.id = "zai-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "zai-title");
  panel.tabIndex = -1;
  panel.hidden = true;

  var head = el("div", "zai-head");
  var avatar = el("span", "zai-avatar");
  avatar.setAttribute("aria-hidden", "true");
  var headText = el("div", "zai-head__text");
  var title = el("h2", "zai-title");
  title.id = "zai-title";
  var role = el("p", "zai-role", T.role);
  headText.appendChild(title);
  headText.appendChild(role);
  var soundBtn = iconButton("bell", "");
  var newBtn = iconButton("refresh", T.new_chat);
  var closeBtn = iconButton("close", T.close);
  head.appendChild(avatar);
  head.appendChild(headText);
  head.appendChild(newBtn);
  head.appendChild(soundBtn);
  head.appendChild(closeBtn);

  var body = el("div", "zai-body");
  var welcome = el("div", "zai-welcome");
  var greeting = el("p", "zai-greeting");
  var intro = el("p", "zai-intro", T.intro);
  var chips = el("div", "zai-chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", T.chips_label);
  (T.chips || []).forEach(function (label) {
    var chip = el("button", "zai-chip", label);
    chip.type = "button";
    chip.setAttribute("data-zai-send", "");
    chips.appendChild(chip);
  });
  var other = el("button", "zai-chip zai-chip--other", T.chip_other);
  other.type = "button";
  chips.appendChild(other);
  var notice = withLink(el("p", "zai-notice"), T.notice, sitePath(cfg.privacy), T.privacy);
  welcome.appendChild(greeting);
  welcome.appendChild(intro);
  welcome.appendChild(chips);
  welcome.appendChild(notice);

  var log = el("div", "zai-log");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  log.setAttribute("aria-relevant", "additions");
  var suggest = el("div", "zai-chips zai-chips--suggest");
  suggest.setAttribute("role", "group");
  suggest.setAttribute("aria-label", T.suggestions_label);
  suggest.hidden = true;
  var typing = el("p", "zai-typing");
  typing.hidden = true;
  var status = el("div", "zai-status");
  status.setAttribute("role", "status");
  status.hidden = true;
  body.appendChild(welcome);
  body.appendChild(log);
  body.appendChild(typing);
  body.appendChild(suggest);
  body.appendChild(status);

  // "Send this conversation to the team" form (consent required).
  var team = el("form", "zai-team");
  team.hidden = true;
  team.noValidate = true;
  var teamText = el("p", "zai-team__text", T.send_team_text);
  var nameLabel = el("label", "zai-label", T.name);
  nameLabel.htmlFor = "zai-team-name";
  var nameInput = el("input", "zai-field");
  nameInput.id = "zai-team-name";
  nameInput.type = "text";
  nameInput.autocomplete = "name";
  nameInput.maxLength = 120;
  var contactLabel = el("label", "zai-label", T.send_team_contact);
  contactLabel.htmlFor = "zai-team-contact";
  var contactInput = el("input", "zai-field");
  contactInput.id = "zai-team-contact";
  contactInput.type = "text";
  contactInput.autocomplete = "email";
  contactInput.maxLength = 254;
  contactInput.required = true;
  var consentRow = el("div", "zai-consent");
  var consent = el("input");
  consent.type = "checkbox";
  consent.id = "zai-team-consent";
  consent.required = true;
  var consentLabel = withLink(el("label"), T.send_team_consent, sitePath(cfg.privacy), T.consent_link);
  consentLabel.htmlFor = "zai-team-consent";
  consentRow.appendChild(consent);
  consentRow.appendChild(consentLabel);
  var teamError = el("p", "zai-error");
  teamError.setAttribute("role", "alert");
  teamError.hidden = true;
  var teamActions = el("div", "zai-team__actions");
  var teamSubmit = el("button", "zai-button", T.send_team_submit);
  teamSubmit.type = "submit";
  var teamCancel = el("button", "zai-button zai-button--ghost", T.cancel);
  teamCancel.type = "button";
  teamActions.appendChild(teamSubmit);
  teamActions.appendChild(teamCancel);
  [teamText, nameLabel, nameInput, contactLabel, contactInput, consentRow, teamError, teamActions].forEach(function (n) { team.appendChild(n); });

  var form = el("form", "zai-form");
  form.noValidate = true;
  var fileRow = el("div", "zai-file");
  fileRow.hidden = true;
  var fileName = el("span", "zai-file__name");
  var fileRemove = iconButton("close", T.remove_file, "zai-icon--small");
  fileRow.appendChild(icon("file"));
  fileRow.appendChild(fileName);
  fileRow.appendChild(fileRemove);
  var row = el("div", "zai-row");
  var attachBtn = iconButton("clip", T.attach);
  var fileInput = el("input");
  fileInput.hidden = true;
  fileInput.type = "file";
  fileInput.accept = FILE_TYPES.join(",");
  fileInput.tabIndex = -1;
  fileInput.setAttribute("aria-hidden", "true");
  var inputLabel = el("label", "zai-sr", T.placeholder);
  inputLabel.htmlFor = "zai-input";
  var input = el("textarea", "zai-input");
  input.id = "zai-input";
  input.rows = 1;
  input.maxLength = MAX_INPUT;
  input.placeholder = T.placeholder;
  input.setAttribute("enterkeyhint", "send");
  var sendBtn = iconButton("send", T.send, "zai-send");
  sendBtn.type = "submit";
  row.appendChild(attachBtn);
  row.appendChild(inputLabel);
  row.appendChild(input);
  row.appendChild(sendBtn);
  var formError = el("p", "zai-error");
  formError.setAttribute("role", "alert");
  formError.hidden = true;
  var foot = el("div", "zai-foot");
  var teamBtn = el("button", "zai-textbtn", T.send_team);
  teamBtn.type = "button";
  foot.appendChild(teamBtn);
  form.appendChild(fileRow);
  form.appendChild(row);
  form.appendChild(fileInput);
  form.appendChild(formError);
  form.appendChild(foot);

  var turnstileBox = el("div", "zai-turnstile");

  panel.appendChild(head);
  panel.appendChild(body);
  panel.appendChild(team);
  panel.appendChild(form);
  panel.appendChild(turnstileBox);
  root.appendChild(panel);
  root.appendChild(launcher);
  document.body.appendChild(root);

  /* ---------------------------------------------------------------- rendering */
  function syncName() {
    var name = currentName();
    title.textContent = name;
    avatar.textContent = name.charAt(0);
    greeting.textContent = fill(T.greeting, { name: name });
    typing.textContent = fill(T.typing, { name: name });
  }
  function syncSound() {
    soundBtn.textContent = "";
    soundBtn.appendChild(icon(muted ? "bellOff" : "bell"));
    soundBtn.setAttribute("aria-label", muted ? T.sound_on : T.sound_off);
    soundBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  }
  function syncLauncher() {
    launcher.setAttribute("aria-label", T.launcher + (badge.hidden ? "" : " (" + T.unread + ")"));
  }
  function scrollDown() {
    body.scrollTop = body.scrollHeight;
  }
  function hasUserMessages() {
    return state.messages.some(function (m) { return m.role === "user"; });
  }
  function syncChrome() {
    chips.hidden = hasUserMessages();
    teamBtn.hidden = !hasUserMessages() || isBlocked();
    newBtn.hidden = !hasUserMessages();
  }

  function renderLinks(container, links) {
    if (!links.length) return;
    var list = el("div", "zai-links");
    list.setAttribute("aria-label", T.links_label);
    list.setAttribute("role", "group");
    links.forEach(function (link) {
      var a = el("a", "zai-link");
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.appendChild(el("span", null, link.label));
      a.appendChild(el("span", "zai-sr", " (" + T.new_tab + ")"));
      a.appendChild(icon("arrow", "zai-link__icon"));
      list.appendChild(a);
    });
    container.appendChild(list);
  }

  function addMessage(message, catalog) {
    var bubble = el("div", "zai-msg zai-msg--" + (message.role === "user" ? "user" : "bot"));
    var who = el("span", "zai-sr", (message.role === "user" ? T.you : currentName()) + ": ");
    bubble.appendChild(who);
    if (message.file) {
      var chip = el("span", "zai-msg__file");
      chip.appendChild(icon("file"));
      chip.appendChild(el("span", null, message.file));
      bubble.appendChild(chip);
    }
    var text = message.fallback ? T.error : message.content;
    String(text || "").split(/\n+/).forEach(function (line) {
      if (!line.trim()) return;
      var para = el("p", null, line);
      para.dir = "auto"; // a reply may be in another language and direction than the page
      bubble.appendChild(para);
    });
    if (message.role === "assistant" && catalog) {
      renderLinks(bubble, message.fallback
        ? checkedLinks(catalog, contactLinks(catalog), pageLang)
        : checkedLinks(catalog, message.links, message.lang || pageLang));
    }
    log.appendChild(bubble);
    return bubble;
  }

  function showSuggestions(list) {
    suggest.textContent = "";
    var items = (Array.isArray(list) ? list : []).filter(function (s) { return typeof s === "string" && s.trim(); }).slice(0, 3);
    items.forEach(function (text) {
      var chip = el("button", "zai-chip", text.slice(0, 80));
      chip.type = "button";
      chip.setAttribute("data-zai-send", "");
      suggest.appendChild(chip);
    });
    suggest.hidden = items.length === 0 || isBlocked();
  }

  function showError(node, text) {
    node.textContent = text || "";
    node.hidden = !text;
  }

  function renderAll() {
    syncName();
    log.textContent = "";
    syncChrome();
    if (!state.messages.length && !isBlocked()) {
      // Nothing to show yet: the link catalogue is only fetched once the visitor opens the chat.
      suggest.hidden = true;
      syncBlocked();
      return;
    }
    loadCatalog().then(function (catalog) {
      log.textContent = "";
      state.messages.forEach(function (m) { addMessage(m, catalog); });
      var last = state.messages[state.messages.length - 1];
      showSuggestions(last && last.role === "assistant" ? last.suggestions : []);
      syncChrome();
      syncBlocked();
      scrollDown();
    });
  }

  /* ---------------------------------------------------------------- blocked state and countdown */
  var timer = null;
  function isBlocked() { return state.blockedUntil > Date.now(); }
  function format(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var mmss = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    return h ? h + ":" + mmss : mmss;
  }
  function setDisabled(disabled) {
    input.disabled = disabled;
    sendBtn.disabled = disabled;
    attachBtn.disabled = disabled;
    Array.prototype.forEach.call(panel.querySelectorAll("[data-zai-send]"), function (b) { b.disabled = disabled; });
  }
  function syncBlocked() {
    if (timer) { window.clearInterval(timer); timer = null; }
    syncChrome();
    if (!isBlocked()) {
      status.hidden = true;
      status.textContent = "";
      setDisabled(false);
      sendBtn.disabled = busy;
      return;
    }
    setDisabled(true);
    suggest.hidden = true;
    status.textContent = "";
    status.appendChild(el("p", "zai-status__reason", state.reason === "offtopic" ? T.blocked_offtopic : T.blocked_rate));
    var wait = el("p", "zai-status__wait");
    var parts = String(T.blocked_wait).split("{time}");
    var clock = el("span", "zai-countdown");
    clock.setAttribute("role", "timer");
    clock.setAttribute("aria-live", "off");
    wait.appendChild(document.createTextNode(parts[0] || ""));
    wait.appendChild(clock);
    wait.appendChild(document.createTextNode(parts.slice(1).join("")));
    status.appendChild(wait);
    loadCatalog().then(function (catalog) {
      if (!status.hidden && !status.querySelector(".zai-links")) {
        renderLinks(status, checkedLinks(catalog, contactLinks(catalog), pageLang));
        scrollDown();
      }
    });
    status.hidden = false;
    var tick = function () {
      var left = state.blockedUntil - Date.now();
      clock.textContent = format(left);
      if (left <= 0) {
        state.blockedUntil = 0;
        state.reason = "";
        save();
        syncBlocked();
        var last = state.messages[state.messages.length - 1];
        showSuggestions(last && last.role === "assistant" ? last.suggestions : []);
      }
    };
    tick();
    timer = window.setInterval(tick, 1000);
  }
  // Server times are converted to this device's clock, so a wrong clock does not break the countdown.
  function block(data, reason) {
    var serverNow = typeof data.now === "number" ? data.now : Date.now();
    state.blockedUntil = Date.now() + Math.max(0, data.blocked_until - serverNow);
    state.reason = reason || data.reason || "rate";
    save();
    syncBlocked();
    scrollDown();
  }

  /* ---------------------------------------------------------------- Turnstile (bot check) */
  var tsLoad = null;
  var tsWidget = null;
  var tsWaiting = null;
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!tsLoad) {
      tsLoad = new Promise(function (resolve, reject) {
        var script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.onload = function () { window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")); };
        script.onerror = function () { tsLoad = null; reject(new Error("turnstile")); };
        document.head.appendChild(script);
      });
    }
    return tsLoad;
  }
  function turnstileToken() {
    if (!cfg.sitekey) return Promise.resolve("");
    return loadTurnstile().then(function (ts) {
      return new Promise(function (resolve, reject) {
        var done = false;
        var limit = window.setTimeout(function () { finish(null); }, 60000);
        function finish(token) {
          if (done) return;
          done = true;
          window.clearTimeout(limit);
          tsWaiting = null;
          token ? resolve(token) : reject(new Error("turnstile"));
        }
        tsWaiting = finish;
        if (tsWidget === null) {
          tsWidget = ts.render(turnstileBox, {
            sitekey: cfg.sitekey,
            execution: "execute",
            appearance: "interaction-only",
            language: pageLang,
            callback: function (token) { if (tsWaiting) tsWaiting(token); },
            "error-callback": function () { if (tsWaiting) tsWaiting(null); },
            "timeout-callback": function () { if (tsWaiting) tsWaiting(null); }
          });
        } else {
          ts.reset(tsWidget);
        }
        ts.execute(turnstileBox);
      });
    });
  }

  /* ---------------------------------------------------------------- talking to the Worker */
  var busy = false;
  var pendingFile = null;

  function post(path, payload) {
    return window.fetch(endpoint + path, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        return { status: response.status, data: data || {} };
      });
    });
  }

  // Sends with a Turnstile token when needed; on "turnstile" it gets a fresh token and tries once more.
  function postVerified(path, build) {
    var needToken = !state.verifiedAt || Date.now() - state.verifiedAt > VERIFIED_FOR;
    var attempt = function (withToken) {
      return (withToken ? turnstileToken() : Promise.resolve("")).then(function (token) {
        return post(path, build(token));
      });
    };
    return attempt(needToken).then(function (result) {
      if (result.status === 403 && result.data.error === "turnstile") return attempt(true);
      return result;
    }).then(function (result) {
      if (result.status === 200) {
        if (needToken || !state.verifiedAt) state.verifiedAt = Date.now();
      }
      return result;
    });
  }

  function historyForServer() {
    return state.messages.filter(function (m) { return !m.fallback && m.content; }).slice(-HISTORY).map(function (m) {
      return m.role === "assistant" ? { role: "assistant", content: m.content, sig: m.sig || "" } : { role: "user", content: m.content };
    });
  }

  var ERRORS = {
    too_long: "too_long", bad_file_type: "file_type", bad_file: "file_type", file_too_big: "file_too_big",
    pdf_too_long: "file_type", too_many_uploads: "file_limit"
  };

  function notifyReply() {
    var unseen = panel.hidden || document.hidden || !document.hasFocus();
    if (panel.hidden) {
      badge.hidden = false;
      syncLauncher();
    }
    if (unseen) chime();
  }

  function setBusy(value) {
    busy = value;
    typing.hidden = !value;
    form.setAttribute("aria-busy", value ? "true" : "false");
    // The text box stays enabled (and focused) while waiting; only sending is paused.
    if (!isBlocked()) sendBtn.disabled = value;
    if (value) scrollDown();
  }

  function sendMessage(text) {
    text = String(text || "").trim();
    showError(formError, "");
    if (busy || isBlocked()) return;
    if (!text && !pendingFile) return;
    if (text.length > MAX_INPUT) { showError(formError, T.too_long); return; }
    var file = pendingFile;
    var message = { role: "user", content: text };
    if (file) message.file = file.name;
    state.messages.push(message);
    save();
    loadCatalog().then(function (catalog) { addMessage(message, catalog); scrollDown(); });
    input.value = "";
    clearFile();
    suggest.hidden = true;
    syncChrome();
    setBusy(true);

    postVerified("/chat", function (token) {
      var payload = {
        conversation_id: state.cid,
        messages: historyForServer(),
        page: window.location.pathname,
        page_lang: pageLang,
        name_lang: state.nameLang || "",
        turnstile: token
      };
      if (file) payload.attachment = { type: file.type, data: file.data };
      return payload;
    }).then(function (result) {
      var data = result.data;
      return loadCatalog().then(function (catalog) {
        setBusy(false);
        if (result.status === 200) {
          if (file) state.uploads = (state.uploads || 0) + 1;
          if (!state.nameLang && NAMES[data.lang] && !data.fallback) state.nameLang = data.lang;
          var reply = {
            role: "assistant",
            content: typeof data.reply === "string" ? data.reply.slice(0, 2000) : "",
            sig: typeof data.sig === "string" ? data.sig : "",
            fallback: Boolean(data.fallback) || !data.reply,
            lang: NAMES[data.lang] ? data.lang : pageLang,
            links: Array.isArray(data.links) ? data.links.slice(0, 3) : [],
            suggestions: Array.isArray(data.suggestions) ? data.suggestions.slice(0, 3) : []
          };
          state.messages.push(reply);
          save();
          syncName();
          addMessage(reply, catalog);
          showSuggestions(reply.suggestions);
          if (data.blocked_until && data.blocked_until > 0) block(data, data.reason);
          notifyReply();
        } else if (result.status === 429 && data.error === "blocked") {
          block(data, data.reason);
          notifyReply();
        } else if (result.status === 503 && data.error === "busy") {
          var note = { role: "assistant", content: T.busy, fallback: false, lang: pageLang, links: contactLinks(catalog), local: true };
          addMessage(note, catalog);
          notifyReply();
        } else if (result.status === 400 && ERRORS[data.error]) {
          showError(formError, T[ERRORS[data.error]]);
        } else {
          addMessage({ role: "assistant", fallback: true }, catalog);
          notifyReply();
        }
        syncChrome();
        scrollDown();
        if (!panel.hidden && !isBlocked() && !mobile.matches) input.focus();
      });
    }).catch(function () {
      setBusy(false);
      loadCatalog().then(function (catalog) {
        addMessage({ role: "assistant", fallback: true }, catalog);
        notifyReply();
        scrollDown();
      });
    });
  }

  /* ---------------------------------------------------------------- attachments (checked here and again in the Worker) */
  function clearFile() {
    pendingFile = null;
    fileInput.value = "";
    fileRow.hidden = true;
    fileName.textContent = "";
  }
  function magicOk(type, b) {
    if (type === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    if (type === "image/png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    if (type === "image/gif") return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;
    if (type === "image/webp") return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    if (type === "application/pdf") return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
    return false;
  }
  function toBase64(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return { b64: window.btoa(binary), binary: binary };
  }
  function pickFile(file) {
    showError(formError, "");
    if (!file) return;
    if ((state.uploads || 0) >= MAX_UPLOADS) { showError(formError, T.file_limit); clearFile(); return; }
    if (FILE_TYPES.indexOf(file.type) === -1) { showError(formError, T.file_type); clearFile(); return; }
    if (file.size > MAX_FILE || file.size === 0) { showError(formError, T.file_too_big); clearFile(); return; }
    file.arrayBuffer().then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      if (!magicOk(file.type, bytes)) { showError(formError, T.file_type); clearFile(); return; }
      var encoded = toBase64(bytes);
      if (file.type === "application/pdf") {
        var pages = (encoded.binary.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
        if (pages > MAX_PDF_PAGES) { showError(formError, T.file_type); clearFile(); return; }
      }
      pendingFile = { name: String(file.name || "file").slice(0, 80), type: file.type, data: encoded.b64 };
      fileName.textContent = pendingFile.name;
      fileRow.hidden = false;
      input.focus();
    }).catch(function () { showError(formError, T.file_type); clearFile(); });
  }

  /* ---------------------------------------------------------------- send to team */
  var EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}$/;
  var PHONE = /^\+?[0-9 ()./-]{7,24}$/;
  function openTeam() {
    team.hidden = false;
    form.hidden = true;
    showError(teamError, "");
    nameInput.focus();
  }
  function closeTeam() {
    team.hidden = true;
    form.hidden = false;
    teamBtn.focus();
  }
  team.addEventListener("submit", function (event) {
    event.preventDefault();
    var contact = contactInput.value.trim();
    var digitsCount = contact.replace(/\D/g, "").length;
    if (!EMAIL.test(contact) && !(PHONE.test(contact) && digitsCount >= 7 && digitsCount <= 15)) {
      showError(teamError, T.send_team_invalid);
      contactInput.focus();
      return;
    }
    if (!consent.checked) {
      showError(teamError, fill(T.send_team_consent, { link: T.consent_link }));
      consent.focus();
      return;
    }
    teamSubmit.disabled = true;
    postVerified("/lead", function (token) {
      return {
        conversation_id: state.cid,
        messages: historyForServer(),
        name: nameInput.value.trim().slice(0, 120),
        contact: contact,
        consent: true,
        page: window.location.pathname,
        page_lang: pageLang,
        lang: state.nameLang || pageLang,
        turnstile: token
      };
    }).then(function (result) {
      teamSubmit.disabled = false;
      if (result.status === 200 && result.data.ok) {
        team.reset();
        closeTeam();
        loadCatalog().then(function (catalog) {
          addMessage({ role: "assistant", content: T.send_team_done, links: [] }, catalog);
          scrollDown();
        });
      } else if (result.data.error === "bad_contact") {
        showError(teamError, T.send_team_invalid);
      } else if (result.data.error === "blocked") {
        closeTeam();
        block(result.data, result.data.reason);
      } else {
        showError(teamError, T.error);
      }
    }).catch(function () {
      teamSubmit.disabled = false;
      showError(teamError, T.error);
    });
  });
  teamCancel.addEventListener("click", closeTeam);

  /* ---------------------------------------------------------------- open, close, focus trap */
  var lastFocus = null;
  function focusables() {
    return Array.prototype.filter.call(
      panel.querySelectorAll("button, [href], input, textarea, select, iframe, [tabindex]:not([tabindex='-1'])"),
      function (node) { return !node.disabled && !node.hidden && node.getClientRects().length > 0 && node !== fileInput; }
    );
  }
  function open() {
    unlockAudio();
    lastFocus = document.activeElement;
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    root.classList.add("zai--open");
    document.documentElement.classList.add("zai-open");
    badge.hidden = true;
    syncLauncher();
    loadCatalog();
    scrollDown();
    if (mobile.matches) panel.focus();
    else if (!input.disabled) input.focus();
    else panel.focus();
  }
  function close() {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    root.classList.remove("zai--open");
    document.documentElement.classList.remove("zai-open");
    var back = lastFocus && document.contains(lastFocus) && lastFocus !== document.body ? lastFocus : launcher;
    if (mobile.matches || !back.focus) launcher.focus();
    else back.focus();
  }
  launcher.addEventListener("click", function () { panel.hidden ? open() : close(); });
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || panel.hidden) return;
    event.preventDefault();
    if (!team.hidden) closeTeam();
    else close();
  });
  panel.addEventListener("keydown", function (event) {
    if (event.key !== "Tab") return;
    var items = focusables();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  /* ---------------------------------------------------------------- events */
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    unlockAudio();
    sendMessage(input.value);
  });
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage(input.value);
    }
  });
  panel.addEventListener("click", function (event) {
    var chip = event.target.closest("[data-zai-send]");
    if (chip && !chip.disabled) {
      unlockAudio();
      sendMessage(chip.textContent);
    }
  });
  other.addEventListener("click", function () {
    if (!input.disabled) input.focus();
  });
  attachBtn.addEventListener("click", function () {
    if ((state.uploads || 0) >= MAX_UPLOADS) { showError(formError, T.file_limit); return; }
    fileInput.click();
  });
  fileInput.addEventListener("change", function () { pickFile(fileInput.files && fileInput.files[0]); });
  fileRemove.addEventListener("click", function () { clearFile(); input.focus(); });
  soundBtn.addEventListener("click", function () {
    muted = !muted;
    localSet(MUTE_KEY, muted ? "1" : "0");
    if (!muted) unlockAudio();
    syncSound();
  });
  newBtn.addEventListener("click", function () {
    state = { cid: newId(), messages: [], nameLang: "", uploads: 0, blockedUntil: state.blockedUntil, reason: state.reason, verifiedAt: state.verifiedAt };
    save();
    clearFile();
    renderAll();
    if (!input.disabled) input.focus();
  });
  teamBtn.addEventListener("click", openTeam);

  syncSound();
  syncLauncher();
  renderAll();
})();
