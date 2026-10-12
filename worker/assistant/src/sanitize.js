// Cleaning of everything that comes back from the model before it reaches the visitor or Telegram.

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const MD_LINK_RE = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

export function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_RE, "").trim().slice(0, max);
}

function normalizeUrl(url) {
  return url.replace(/[.,;:!?)\]}»”’]+$/u, "").replace(/\/$/, "").toLowerCase();
}

export function allowedUrlSet(links) {
  const set = new Set();
  for (const link of Object.values(links)) {
    for (const url of Object.values(link.urls)) set.add(normalizeUrl(url));
  }
  return set;
}

/** Removes every URL that is not in the link catalogue; markdown links keep only their text. */
export function stripUrls(text, allowed) {
  let out = text.replace(MD_LINK_RE, (_, label) => label);
  out = out.replace(URL_RE, (match) => {
    const trailing = match.match(/[.,;:!?)\]}»”’]+$/u);
    const bare = trailing ? match.slice(0, -trailing[0].length) : match;
    const keep = allowed.has(normalizeUrl(bare));
    return (keep ? bare : "") + (trailing ? trailing[0] : "");
  });
  return out.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?])/g, "$1").trim();
}

export const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}$/;

export function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function validPhone(value) {
  const text = String(value || "").trim();
  if (!/^\+?[0-9 ()./-]{7,24}$/.test(text)) return false;
  const n = digits(text).length;
  return n >= 7 && n <= 15;
}

/**
 * Checks the model output against the schema again (never trust it blindly) and reduces it to
 * what the widget may show: only catalogue links, short suggestions, no foreign URLs.
 */
export function cleanResult(raw, { links, allowed, langs, fallbackLang, maxLinks = 3 }) {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const lang = langs.includes(obj.lang) ? obj.lang : fallbackLang;
  const reply = stripUrls(cleanText(obj.reply, 2000), allowed);
  const ids = Array.isArray(obj.links) ? obj.links : [];
  const seen = new Set();
  const outLinks = [];
  for (const id of ids) {
    if (typeof id !== "string" || seen.has(id) || !Object.prototype.hasOwnProperty.call(links, id)) continue;
    seen.add(id);
    const link = links[id];
    outLinks.push({ id, url: link.urls[lang] || Object.values(link.urls)[0], label: link.labels[lang] || Object.values(link.labels)[0] });
    if (outLinks.length >= maxLinks) break;
  }
  const suggestions = (Array.isArray(obj.suggestions) ? obj.suggestions : [])
    .map((s) => stripUrls(cleanText(s, 120), new Set()).replace(/\s+/g, " ").slice(0, 80))
    .filter((s) => s.length > 1)
    .slice(0, 3);
  const leadIn = obj.lead && typeof obj.lead === "object" && !Array.isArray(obj.lead) ? obj.lead : {};
  const lead = {
    name: cleanText(leadIn.name, 120),
    email: cleanText(leadIn.email, 254),
    phone: cleanText(leadIn.phone, 40),
    need: cleanText(leadIn.need, 600),
    budget: cleanText(leadIn.budget, 120),
    timeline: cleanText(leadIn.timeline, 120),
    ready: leadIn.ready === true,
  };
  return {
    reply,
    lang,
    links: outLinks,
    suggestions,
    off_topic: obj.off_topic === true,
    abuse: obj.abuse === true,
    lead,
  };
}
