// Request handling of the assistant Worker. Dependencies (the Anthropic client, fetch, the clock and
// the site data) are injected, so the whole flow is unit tested without network access.
//
// POST /chat  one chat turn: checks, rate limits, one Claude request, cleaned JSON answer
// POST /lead  "Send this conversation to the team" (with the visitor's consent) -> Telegram
// GET  /health
//
// Security model: only the website's origins may call it; every visitor is identified by a salted hash
// of the IP address; Turnstile proves a browser at the start of a session; the model sees only public
// website content and returns link ids that are mapped to an allowlist here. No conversation is stored.

import { MODEL, LANGS, NAMES, LANG_NAMES, outputSchema, staticPrompt, requestPrompt } from "./prompt.js";
import { validateAttachment, FileError } from "./files.js";
import { cleanResult, cleanText, allowedUrlSet, EMAIL_RE, validPhone, digits } from "./sanitize.js";
import { leadMessage, sendTelegram } from "./telegram.js";

export const LIMITS = {
  maxBody: 6 * 1024 * 1024, // one 4 MB file is about 5.4 MB as base64, plus the text
  maxLeadBody: 64 * 1024,
  maxInput: 1000, // characters in the visitor's message
  maxHistory: 8, // messages of history sent to the model, whatever the browser sends
  maxHistoryChars: 2000,
  maxTokens: 700, // ~600 for the JSON answer plus a little room for low-effort thinking
  defaultDailyCap: 1500,
};

const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const CONVERSATION_RE = /^[A-Za-z0-9_-]{8,64}$/;

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

export class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function respond(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...cors } });
}

export function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => /^https:\/\/[a-z0-9.-]+$/.test(o));
}

export function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  if (allowedOrigins(env).includes(origin)) return true;
  return env.ALLOW_LOCALHOST === "true" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

async function readJson(request, max) {
  const declared = request.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) throw new HttpError(413, "too_large");
  if (!request.body) throw new HttpError(400, "bad_json");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, "too_large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "bad_json");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new HttpError(400, "bad_json");
  return data;
}

const encoder = new TextEncoder();

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// IPv6 visitors usually control a whole /64 network, so limits apply per /64 prefix, not per address.
export function ipKey(ip) {
  const value = String(ip || "").trim().toLowerCase();
  if (!value.includes(":")) return value;
  const [head, tail = ""] = value.split("::");
  const left = head ? head.split(":") : [];
  const right = value.includes("::") && tail ? tail.split(":") : [];
  if (right.some((part) => part.includes(".")) || left.some((part) => part.includes("."))) return value; // IPv4-mapped
  const fill = value.includes("::") ? Array(Math.max(0, 8 - left.length - right.length)).fill("0") : [];
  const groups = [...left, ...fill, ...right].map((g) => g.replace(/^0+(?=.)/, ""));
  return `${groups.slice(0, 4).join(":")}::/64`;
}

export async function hashIp(salt, ip) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(`${salt}|${ipKey(ip)}`)));
}

// Assistant messages are kept in the visitor's browser and sent back with each request. They are
// signed, so a visitor cannot put words into the assistant's mouth to steer the model.
async function replyKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(`reply-signature|${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function signReply(secret, conversation, text) {
  const mac = await crypto.subtle.sign("HMAC", await replyKey(secret), encoder.encode(`${conversation}\n${text}`));
  return hex(mac);
}

async function verifyReply(secret, conversation, text, signature) {
  if (typeof signature !== "string" || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = await signReply(secret, conversation, text);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export function createApp({ siteData, makeClient, fetchImpl = (...args) => fetch(...args), now = () => Date.now() }) {
  const links = siteData.links;
  const system = staticPrompt(siteData);
  const schema = outputSchema(Object.keys(links));
  const allowed = allowedUrlSet(links);
  const base = siteData.base_url;
  // Only real page paths of the site are passed on to the model, never free text from the request.
  const pagePaths = new Set();
  for (const link of Object.values(links)) {
    for (const url of Object.values(link.urls)) {
      if (url.startsWith(`${base}/`)) pagePaths.add(url.slice(base.length));
    }
  }

  async function normalizeMessages(list, env, conversation, { requireUserLast }) {
    if (!Array.isArray(list) || list.length === 0 || list.length > 200) throw new HttpError(400, "bad_request");
    const last = list[list.length - 1];
    if (requireUserLast) {
      if (!last || last.role !== "user" || typeof last.content !== "string") throw new HttpError(400, "bad_request");
      if (last.content.length > LIMITS.maxInput) throw new HttpError(400, "too_long");
    }
    const out = [];
    for (const message of list.slice(-LIMITS.maxHistory)) {
      if (!message || typeof message !== "object" || typeof message.content !== "string") throw new HttpError(400, "bad_request");
      if (message.role === "user") {
        out.push({ role: "user", content: cleanText(message.content, LIMITS.maxInput) });
      } else if (message.role === "assistant") {
        if (message.content.length > LIMITS.maxHistoryChars) continue;
        if (!(await verifyReply(env.IP_HASH_SALT, conversation, message.content, message.sig))) continue;
        out.push({ role: "assistant", content: message.content });
      } else {
        throw new HttpError(400, "bad_request");
      }
    }
    const kept = out.filter((m, i) => m.content || (requireUserLast && i === out.length - 1));
    while (kept.length && kept[0].role !== "user") kept.shift();
    return kept;
  }

  async function requireHuman(env, token, ip) {
    if (env.TURNSTILE_DISABLED === "true" && !env.TURNSTILE_SECRET) return; // local development only
    if (typeof token !== "string" || !token || token.length > 2048) throw new HttpError(403, "turnstile");
    let data;
    try {
      const response = await fetchImpl(TURNSTILE_VERIFY, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }).toString(),
      });
      data = await response.json();
    } catch {
      throw new HttpError(503, "unavailable");
    }
    const hosts = allowedOrigins(env).map((o) => new URL(o).hostname);
    if (env.ALLOW_LOCALHOST === "true") hosts.push("localhost", "127.0.0.1");
    if (!data || data.success !== true || (data.hostname && !hosts.includes(data.hostname))) {
      throw new HttpError(403, "turnstile");
    }
  }

  function limiterFor(env, ipHash) {
    const stub = env.IP_LIMITER.get(env.IP_LIMITER.idFromName(ipHash));
    return async (command) => {
      const response = await stub.fetch("https://limiter.internal/", {
        method: "POST",
        body: JSON.stringify({ ...command, now: now() }),
      });
      return response.json();
    };
  }

  async function takeBudget(env) {
    const stub = env.DAILY_BUDGET.get(env.DAILY_BUDGET.idFromName("global"));
    const parsed = Number.parseInt(env.DAILY_REQUEST_CAP, 10);
    const cap = Number.isFinite(parsed) && parsed >= 0 ? parsed : LIMITS.defaultDailyCap;
    const response = await stub.fetch("https://budget.internal/", {
      method: "POST",
      body: JSON.stringify({ op: "take", cap, now: now() }),
    });
    return { ...(await response.json()), cap };
  }

  function blocked(result) {
    // "now" lets the widget convert blocked_until to the visitor's own clock for the countdown.
    return new HttpError(429, "blocked", { blocked_until: result.blocked_until, reason: result.reason || "rate", now: now() });
  }

  function fallbackResult(lang) {
    const ids = ["contact", "booking"].filter((id) => links[id]);
    return {
      reply: "",
      fallback: true,
      lang,
      links: ids.map((id) => ({ id, url: links[id].urls[lang] || links[id].urls.en, label: links[id].labels[lang] || links[id].labels.en })),
      suggestions: [],
      off_topic: false,
      abuse: false,
      lead: { name: "", email: "", phone: "", need: "", budget: "", timeline: "", ready: false },
    };
  }

  async function chat(body, env, ctx, { call, ip }) {
    const conversation = typeof body.conversation_id === "string" && CONVERSATION_RE.test(body.conversation_id) ? body.conversation_id : null;
    if (!conversation) throw new HttpError(400, "bad_request");
    const pageLang = LANGS.includes(body.page_lang) ? body.page_lang : "en";
    const nameLang = LANGS.includes(body.name_lang) ? body.name_lang : "";
    const pagePath = typeof body.page === "string" && pagePaths.has(body.page) ? body.page : "";
    const messages = await normalizeMessages(body.messages, env, conversation, { requireUserLast: true });

    // A blocked visitor is turned away before any further work (file checks, Turnstile, model).
    const state = await call({ op: "peek" });
    if (state.blocked_until > now()) throw blocked(state);

    let attachment = null;
    try {
      attachment = validateAttachment(body.attachment);
    } catch (error) {
      if (error instanceof FileError) throw new HttpError(400, error.code);
      throw error;
    }
    const lastUser = messages[messages.length - 1];
    if (!lastUser || lastUser.role !== "user" || (!lastUser.content && !attachment)) throw new HttpError(400, "bad_request");
    let verifiedNow = false;
    if (!state.verified) {
      await requireHuman(env, body.turnstile, ip);
      verifiedNow = true;
    }
    const admitted = await call({ op: "admit", verified: verifiedNow, upload: Boolean(attachment), conversation });
    if (!admitted.ok) {
      if (admitted.error) throw new HttpError(400, admitted.error);
      throw blocked(admitted);
    }
    const budget = await takeBudget(env);
    if (!budget.ok) {
      if (budget.first_refusal) {
        ctx.waitUntil(sendTelegram(fetchImpl, env,
          `Asistan: günlük istek sınırı (${budget.cap}) doldu. Asistan UTC gece yarısına kadar ziyaretçilere "meşgul" mesajı ve iletişim bağlantılarını gösterecek. Sınırı değiştirmek isterseniz Claude'a haber verin.`));
      }
      throw new HttpError(503, "busy");
    }

    const apiMessages = messages.map((m, i) => {
      if (i !== messages.length - 1) return { role: m.role, content: m.content };
      const content = [];
      if (attachment) {
        content.push({ type: attachment.kind, source: { type: "base64", media_type: attachment.mediaType, data: attachment.data } });
      }
      content.push({ type: "text", text: m.content || "(The visitor sent a file without a message.)" });
      return { role: "user", content };
    });

    let response;
    try {
      const client = makeClient(env);
      response = await client.messages.create({
        model: MODEL,
        max_tokens: LIMITS.maxTokens,
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
          { type: "text", text: requestPrompt({ nameLang, pageLang, pagePath, attachment: Boolean(attachment) }) },
        ],
        messages: apiMessages,
        output_config: { effort: "low", format: { type: "json_schema", schema } },
      });
    } catch (error) {
      // Never pass upstream errors on: they can contain request details.
      console.log(`anthropic: request failed (${error && error.status ? error.status : "network"})`);
      throw new HttpError(502, "upstream");
    }
    const usage = response.usage || {};
    console.log(`anthropic: stop=${response.stop_reason} in=${usage.input_tokens} out=${usage.output_tokens} cache_read=${usage.cache_read_input_tokens} cache_write=${usage.cache_creation_input_tokens}`);

    const fallbackLang = nameLang || pageLang;
    let result;
    let refused = false;
    if (response.stop_reason === "end_turn") {
      const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      try {
        result = cleanResult(JSON.parse(text), { links, allowed, langs: LANGS, fallbackLang });
        if (!result.reply) result = fallbackResult(fallbackLang);
      } catch {
        result = fallbackResult(fallbackLang);
      }
    } else {
      // "refusal" (safety classifier), "max_tokens" (cut-off JSON) or anything unexpected.
      // A refusal means the message tripped a safety classifier: it counts as a strike.
      refused = response.stop_reason === "refusal";
      result = fallbackResult(fallbackLang);
    }

    const answer = {
      reply: result.reply,
      sig: result.reply ? await signReply(env.IP_HASH_SALT, conversation, result.reply) : "",
      fallback: Boolean(result.fallback),
      lang: result.lang,
      name: NAMES[nameLang || result.lang],
      links: result.links,
      suggestions: result.suggestions,
      off_topic: result.off_topic,
      lead_sent: false,
      blocked_until: 0,
      now: now(),
    };

    if (result.off_topic || result.abuse || refused) {
      const strike = await call({ op: "strike" });
      if (strike.blocked_until) {
        answer.blocked_until = strike.blocked_until;
        answer.reason = strike.reason;
      }
    }

    const lead = result.lead;
    if (lead.ready && !result.abuse) {
      // Contact details count only if the visitor really typed them (the model must not invent them).
      const typed = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
      const email = EMAIL_RE.test(lead.email) && typed.toLowerCase().includes(lead.email.toLowerCase()) ? lead.email : "";
      const phone = validPhone(lead.phone) && digits(typed).includes(digits(lead.phone)) ? lead.phone : "";
      if (email || phone) {
        const allowedLead = await call({ op: "lead", kind: "auto", conversation });
        if (allowedLead.ok) {
          answer.lead_sent = true;
          const text = leadMessage({
            source: "auto",
            lead,
            contact: { name: lead.name, email, phone },
            page: pagePath ? base + pagePath : "",
            lang: result.lang,
            langName: LANG_NAMES[result.lang],
            transcript: [...messages.slice(-5), { role: "assistant", content: result.reply }],
          });
          ctx.waitUntil(sendTelegram(fetchImpl, env, text));
        }
      }
    }
    return answer;
  }

  async function sendToTeam(body, env, ctx, { call, ip }) {
    const conversation = typeof body.conversation_id === "string" && CONVERSATION_RE.test(body.conversation_id) ? body.conversation_id : null;
    if (!conversation) throw new HttpError(400, "bad_request");
    if (body.consent !== true) throw new HttpError(400, "consent");
    const contact = cleanText(body.contact, 254);
    const email = EMAIL_RE.test(contact) ? contact : "";
    const phone = !email && validPhone(contact) ? contact : "";
    if (!email && !phone) throw new HttpError(400, "bad_contact");
    const name = cleanText(body.name, 120);
    const pageLang = LANGS.includes(body.page_lang) ? body.page_lang : "en";
    const lang = LANGS.includes(body.lang) ? body.lang : pageLang;
    const pagePath = typeof body.page === "string" && pagePaths.has(body.page) ? body.page : "";
    const transcript = await normalizeMessages(body.messages, env, conversation, { requireUserLast: false });
    if (!transcript.length) throw new HttpError(400, "bad_request");

    const state = await call({ op: "peek" });
    if (state.blocked_until > now()) throw blocked(state);
    if (!state.verified) {
      await requireHuman(env, body.turnstile, ip);
      await call({ op: "verify" });
    }
    const allowedLead = await call({ op: "lead", kind: "manual", conversation });
    if (!allowedLead.ok) throw new HttpError(429, "lead_limit");
    const text = leadMessage({
      source: "manual",
      lead: { name, email: "", phone: "", need: cleanText(body.need, 600), budget: "", timeline: "" },
      contact: { name, email, phone },
      page: pagePath ? base + pagePath : "",
      lang,
      langName: LANG_NAMES[lang],
      transcript,
    });
    const sent = await sendTelegram(fetchImpl, env, text);
    if (!sent) throw new HttpError(502, "unavailable");
    return { ok: true };
  }

  async function handle(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const originOk = isAllowedOrigin(origin, env);
    const cors = originOk ? corsHeaders(origin) : {};
    try {
      if (url.pathname === "/health" && request.method === "GET") return respond({ ok: true }, 200, {});
      if (url.pathname !== "/chat" && url.pathname !== "/lead") throw new HttpError(404, "not_found");
      if (!originOk) throw new HttpError(403, "origin");
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Cache-Control": "no-store" } });
      if (request.method !== "POST") throw new HttpError(405, "method");
      if (!/^application\/json\s*(;|$)/i.test(request.headers.get("Content-Type") || "")) throw new HttpError(415, "content_type");
      const turnstileReady = Boolean(env.TURNSTILE_SECRET) || env.TURNSTILE_DISABLED === "true";
      if (!env.ANTHROPIC_API_KEY || !env.IP_HASH_SALT || !turnstileReady) throw new HttpError(503, "unavailable");
      const isChat = url.pathname === "/chat";
      const body = await readJson(request, isChat ? LIMITS.maxBody : LIMITS.maxLeadBody);
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const call = limiterFor(env, await hashIp(env.IP_HASH_SALT, ip));
      const data = isChat ? await chat(body, env, ctx, { call, ip }) : await sendToTeam(body, env, ctx, { call, ip });
      return respond(data, 200, cors);
    } catch (error) {
      if (error instanceof HttpError) return respond({ error: error.code, ...error.extra }, error.status, cors);
      console.log("unexpected error");
      return respond({ error: "server" }, 500, cors);
    }
  }

  return { fetch: handle, system, schema };
}
