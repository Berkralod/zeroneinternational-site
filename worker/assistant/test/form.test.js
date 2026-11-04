// Website form relay: Turnstile, limits, Formspree forward and the Turkish Telegram message.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { spamCheck } from "../src/form.js";

function project(extra = {}) {
  return {
    form: "project",
    _language: "en",
    name: "Maria Lopez",
    email: "maria@example.com",
    company: "Lopez Bakery",
    project_type: "website",
    budget: "$1,000–$3,000",
    timeline: "Within a month",
    message: "Hi, we need a new website for our bakery with online orders.\nCan you help?",
    consent: "yes",
    _gotcha: "",
    page: "/services/",
    turnstile: "good-token",
    ...extra,
  };
}

test("a real request goes to Formspree and to Telegram, labelled as a request", async () => {
  const s = setup();
  const res = await s.send("/form", project());
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { ok: true });
  const [fs] = s.formspreeCalls();
  assert.equal(fs.url, "https://formspree.io/f/xtestform");
  const sent = JSON.parse(fs.init.body);
  assert.equal(sent.email, "maria@example.com");
  assert.equal(sent._replyto, "maria@example.com");
  assert.match(sent._subject, /^Project request \(en\)/);
  const [tg] = s.telegramCalls();
  const text = JSON.parse(tg.init.body).text;
  assert.match(text, /^📩 Site formu: Proje talebi/);
  assert.match(text, /İsim: Maria Lopez/);
  assert.match(text, /Mesaj:\nHi, we need a new website/);
  assert.match(text, /Sayfa: https:\/\/zeroneinternational.com\/services\//);
  assert.match(text, /e-postana da geldi/);
});

test("the 3 Nov spam is sent through but labelled as spam", async () => {
  const s = setup();
  const res = await s.send("/form", project({ name: "Roberttot", email: "aveyekoha655@gmail.com", company: "google", project_type: "phone", message: "Hi, kam dashur të di çmimin tuaj" }));
  assert.equal(res.status, 200);
  const text = JSON.parse(s.telegramCalls()[0].init.body).text;
  assert.match(text, /^⚠️ Muhtemelen SPAM/);
  assert.match(JSON.parse(s.formspreeCalls()[0].init.body)._subject, /^\[possible spam\]/);
});

test("spam check: one weak signal is only a note, known phrases and two signals are spam", () => {
  assert.equal(spamCheck({ message: "We need help with our website, please." }, "en").spam, false);
  assert.equal(spamCheck({ company: "google", message: "We need help with our website." }, "en").spam, false);
  assert.equal(spamCheck({ message: "Hello, I wanted to know your price." }, "en").spam, true);
  assert.equal(spamCheck({ company: "google", message: "Rank on google first page https://x.ru" }, "en").spam, true);
  assert.equal(spamCheck({ message: "Merhaba, web sitesi için teklif almak istiyoruz, çiçekçiyiz." }, "tr").spam, false);
});

test("without a valid Turnstile token nothing is forwarded", async () => {
  const s = setup({ turnstile: false });
  const res = await s.send("/form", project());
  assert.equal(res.status, 403);
  assert.equal(res.json.error, "turnstile");
  assert.equal(s.formspreeCalls().length, 0);
  assert.equal(s.telegramCalls().length, 0);
});

test("the honeypot field gets a fake success and nothing is sent", async () => {
  const s = setup();
  const res = await s.send("/form", project({ _gotcha: "http://spam.example" }));
  assert.equal(res.status, 200);
  assert.equal(s.formspreeCalls().length + s.telegramCalls().length, 0);
});

test("consent, a valid e-mail and a known form are required", async () => {
  const s = setup();
  assert.equal((await s.send("/form", project({ consent: "" }))).json.error, "consent");
  assert.equal((await s.send("/form", project({ email: "not-an-email" }))).json.error, "bad_contact");
  assert.equal((await s.send("/form", project({ form: "other" }))).json.error, "bad_form");
});

test("other origins are refused", async () => {
  const s = setup();
  const res = await s.send("/form", project(), { origin: "https://evil.example" });
  assert.equal(res.status, 403);
});

test("five forms per IP per day, then 429", async () => {
  const s = setup();
  for (let i = 0; i < 5; i++) assert.equal((await s.send("/form", project())).status, 200);
  const res = await s.send("/form", project());
  assert.equal(res.status, 429);
  assert.equal(res.json.error, "form_limit");
});

test("if Formspree fails the Telegram message says the request is only there", async () => {
  const s = setup({ formspreeStatus: 500 });
  const res = await s.send("/form", project());
  assert.equal(res.status, 200);
  assert.match(JSON.parse(s.telegramCalls()[0].init.body).text, /Formspree'ye ulaşılamadı/);
});

test("forms work without the Anthropic key (assistant switched off)", async () => {
  const s = setup({ env: { ANTHROPIC_API_KEY: "" } });
  assert.equal((await s.send("/form", project())).status, 200);
});

test("newsletter: only the e-mail is needed", async () => {
  const s = setup();
  const res = await s.send("/form", { form: "newsletter", _language: "de", email: "anna@example.de", consent: "yes", turnstile: "good-token" });
  assert.equal(res.status, 200);
  assert.match(JSON.parse(s.telegramCalls()[0].init.body).text, /Bülten kaydı[\s\S]*E-posta: anna@example.de[\s\S]*Dil: de/);
});
