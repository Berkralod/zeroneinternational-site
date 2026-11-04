// Website forms (project request, waiting lists, newsletter) relayed by the Worker:
// Turnstile bot check -> per-IP limit -> forward to Formspree (the owner's e-mail, as before) ->
// one Turkish Telegram message with a spam estimate. If Formspree cannot be reached the Telegram
// message still carries every field, so no request is lost.

import { cleanText, EMAIL_RE } from "./sanitize.js";

export const FORMS = ["project", "waitlist", "developers-waitlist", "newsletter"];

// Field name -> [Turkish label, max length]. Anything else in the request is ignored.
export const FIELDS = {
  name: ["İsim", 120],
  email: ["E-posta", 200],
  company: ["Şirket", 160],
  project_type: ["Proje türü", 60],
  budget: ["Bütçe", 60],
  timeline: ["Zaman planı", 60],
  product: ["Ürün", 60],
  message: ["Mesaj", 5000],
  what_would_you_build: ["Ne yapmak istiyor", 3000],
};

const FORM_NAMES = {
  project: "Proje talebi",
  waitlist: "Bekleme listesi",
  "developers-waitlist": "Geliştirici erken erişim",
  newsletter: "Bülten kaydı",
};

// The classic "I wanted to know your price" spam, sent to every contact form in many languages.
const PRICE_SPAM = [
  /\b(?:wanted|want) to know your price\b/i,
  /\bkam dashur t[eë] di [cç]mimin\b/i, // Albanian
  /\bхотел(?:а)? (?:узнать|знать) (?:ваш[уи]? )?цен/i, // Russian
  /\bwollte (?:ihren|deinen) preis wissen\b/i,
  /\bingin tahu harga\b/i, // Indonesian / Malay
  /\bzure prezioa jakin\b/i, // Basque
  /\bvolevo conoscere il (?:tuo|vostro) prezzo\b/i,
  /\bquer(?:ia)? saber (?:o )?(?:seu )?pre[cç]o\b/i,
  /\bquer[ií]a (?:saber|conocer) (?:su|tu) precio\b/i,
  /\bvoulais conna[iî]tre (?:votre|ton) prix\b/i,
  /\bchciałem znać (?:twoją|waszą) cenę\b/i,
  /\bfiyatınızı (?:öğrenmek|bilmek) istedim\b/i,
];
const BIG_BRANDS = /^(?:google|facebook|meta|amazon|apple|microsoft|youtube|instagram|tiktok|test|none|n\/a|-)$/i;
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:ru|xyz|top|click|link|shop|online|site)\b/i;
const SPAM_WORDS = /\b(?:seo (?:service|ranking)|backlinks?|crypto|bitcoin|casino|loan|viagra|guest post|rank (?:your|on) google|first page of google)\b/i;
// Letters typical of other languages; the visitor wrote in a different language than the page.
const NON_ENGLISH = /[çëşğıöüñßąęłńśźżăâîșțа-яё]/i;
const ENGLISH = /\b(?:the|and|to|you|your|we|our|my|for|is|are|with|need|want|would|website|help|business|can|please|hello|hi)\b/gi;

function englishWords(text) {
  return (text.match(ENGLISH) || []).length;
}

/** Rough spam estimate: { spam: boolean, reasons: [Turkish] }. It only labels; it never drops a message. */
export function spamCheck(fields, lang) {
  const reasons = [];
  const text = `${fields.message || ""} ${fields.what_would_you_build || ""}`;
  if (PRICE_SPAM.some((re) => re.test(text))) reasons.push("bilinen spam cümlesi (\"fiyatınızı öğrenmek istedim\")");
  if (fields.company && BIG_BRANDS.test(fields.company.trim())) reasons.push(`şirket "${fields.company}"`);
  if (LINK.test(text)) reasons.push("mesajda link var");
  if (SPAM_WORDS.test(text)) reasons.push("reklam kelimeleri");
  if (lang === "en" && fields.message && NON_ENGLISH.test(fields.message) && englishWords(fields.message) < 2) {
    reasons.push("İngilizce sayfada başka dilde mesaj");
  }
  // A known phrase alone is enough; otherwise two signals.
  const spam = reasons.some((r) => r.startsWith("bilinen")) || reasons.length >= 2;
  return { spam, reasons };
}

/** Cleans the submitted fields; throws "bad_request" style codes as strings. */
export function readForm(body, langs) {
  const form = FORMS.includes(body.form) ? body.form : null;
  if (!form) return { error: "bad_form" };
  if (typeof body._gotcha === "string" && body._gotcha.trim()) return { error: "trap" };
  if (body.consent !== "yes") return { error: "consent" };
  const lang = langs.includes(body._language) ? body._language : "en";
  const fields = {};
  for (const [key, [, max]] of Object.entries(FIELDS)) {
    if (typeof body[key] !== "string") continue;
    const value = key === "message" || key === "what_would_you_build" ? cleanMultiline(body[key], max) : cleanText(body[key], max);
    if (value) fields[key] = value;
  }
  if (!fields.email || !EMAIL_RE.test(fields.email)) return { error: "bad_contact" };
  if (form === "project" && (!fields.name || !fields.message)) return { error: "bad_request" };
  return { form, lang, fields };
}

function cleanMultiline(value, max) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => cleanText(line, max))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

const SUBJECTS = {
  project: "Project request",
  waitlist: "Waiting list",
  "developers-waitlist": "Developer early access",
  newsletter: "Newsletter signup",
};

/** The JSON body sent to Formspree: the same fields the HTML form used to post directly. */
export function formspreeBody({ form, lang, fields }, siteName, spam) {
  return {
    form,
    _language: lang,
    _subject: `${spam ? "[possible spam] " : ""}${SUBJECTS[form]} (${lang}) – ${siteName}`,
    ...fields,
    consent: "yes",
    _replyto: fields.email,
  };
}

/** One Turkish Telegram message. Plain text (no parse_mode), so nothing typed can add formatting. */
export function formMessage({ form, lang, fields }, { spam, reasons }, { page, emailed }) {
  const lines = [];
  lines.push(spam ? `⚠️ Muhtemelen SPAM · Site formu: ${FORM_NAMES[form]}` : `📩 Site formu: ${FORM_NAMES[form]}`);
  if (spam) lines.push(`Neden: ${reasons.join(", ")}. Cevap vermeyin.`);
  else if (reasons.length) lines.push(`Not: ${reasons.join(", ")}`);
  lines.push("");
  for (const [key, [label]] of Object.entries(FIELDS)) {
    if (!fields[key]) continue;
    const value = fields[key].length > 1500 ? `${fields[key].slice(0, 1500)}…` : fields[key];
    lines.push(key === "message" || key === "what_would_you_build" ? `${label}:\n${value}` : `${label}: ${value}`);
  }
  lines.push(`Dil: ${lang}`);
  if (page) lines.push(`Sayfa: ${page}`);
  lines.push("");
  lines.push(emailed ? "Aynı talep e-postana da geldi (Formspree)." : "Formspree'ye ulaşılamadı: bu talep sadece burada, e-postaya gelmedi.");
  if (!spam && form === "project") lines.push("Lütfen 2 iş günü içinde dönüş yapın.");
  return lines.join("\n").slice(0, 3900);
}
