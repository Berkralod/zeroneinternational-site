// Test doubles: in-memory Durable Objects, a mocked Anthropic client and a recording fetch.
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { IpLimiter, DailyBudget } from "../src/limiter.js";

export const siteData = JSON.parse(readFileSync(new URL("./fixtures/site-data.json", import.meta.url), "utf8"));
export const ORIGIN = "https://zeroneinternational.com";

class MemoryStorage {
  constructor() {
    this.map = new Map();
    this.alarm = null;
  }
  async get(key) {
    return this.map.has(key) ? structuredClone(this.map.get(key)) : undefined;
  }
  async put(key, value) {
    this.map.set(key, structuredClone(value));
  }
  async deleteAll() {
    this.map.clear();
  }
  async setAlarm(time) {
    this.alarm = time;
  }
}

class Namespace {
  constructor(Klass) {
    this.Klass = Klass;
    this.instances = new Map();
  }
  idFromName(name) {
    return name;
  }
  get(id) {
    if (!this.instances.has(id)) {
      const storage = new MemoryStorage();
      this.instances.set(id, { storage, object: new this.Klass({ storage }, {}) });
    }
    const { object } = this.instances.get(id);
    return { fetch: (url, init) => object.fetch(new Request(url, init)) };
  }
}

export function reply(fields = {}) {
  return {
    reply: "We build websites, AI assistants and custom automation. What would you like to automate?",
    lang: "en",
    links: ["services"],
    suggestions: ["How does a project work?"],
    off_topic: false,
    abuse: false,
    lead: { name: "", email: "", phone: "", need: "", budget: "", timeline: "", ready: false },
    ...fields,
  };
}

export function message(json, stopReason = "end_turn") {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    stop_reason: stopReason,
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: typeof json === "string" ? json : JSON.stringify(json) },
    ],
    usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
}

/** A complete test setup. `respond(params)` decides what the mocked model returns. */
export function setup({ respond = () => message(reply()), env: envOverrides = {}, turnstile = true } = {}) {
  let clock = Date.UTC(2026, 9, 12, 12, 0, 0);
  const calls = { model: [], fetch: [], waitUntil: [] };
  const client = {
    messages: {
      create: async (params) => {
        calls.model.push(params);
        const result = await respond(params, calls.model.length);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
  const fetchImpl = async (url, init = {}) => {
    calls.fetch.push({ url: String(url), init });
    if (String(url).startsWith("https://challenges.cloudflare.com/")) {
      const params = new URLSearchParams(init.body);
      const ok = turnstile && params.get("response") === "good-token";
      return new Response(JSON.stringify({ success: ok, hostname: "zeroneinternational.com" }), { status: 200 });
    }
    if (String(url).startsWith("https://api.telegram.org/")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("not mocked", { status: 500 });
  };
  const env = {
    ANTHROPIC_API_KEY: "test-key",
    TELEGRAM_BOT_TOKEN: "123:telegram-test-token",
    TELEGRAM_CHAT_ID: "42",
    IP_HASH_SALT: "test-salt",
    TURNSTILE_SECRET: "turnstile-secret",
    ALLOWED_ORIGINS: "https://zeroneinternational.com,https://www.zeroneinternational.com",
    ALLOW_LOCALHOST: "false",
    DAILY_REQUEST_CAP: "1500",
    IP_LIMITER: new Namespace(IpLimiter),
    DAILY_BUDGET: new Namespace(DailyBudget),
    ...envOverrides,
  };
  const app = createApp({ siteData, makeClient: () => client, fetchImpl, now: () => clock });
  const ctx = { waitUntil: (p) => calls.waitUntil.push(p) };

  async function send(path, body, { origin = ORIGIN, ip = "203.0.113.7", headers = {}, method = "POST", raw } = {}) {
    const init = {
      method,
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, ...(origin ? { Origin: origin } : {}), ...headers },
    };
    if (method !== "GET" && method !== "OPTIONS") init.body = raw !== undefined ? raw : JSON.stringify(body);
    const response = await app.fetch(new Request(`https://zerone-assistant.example.workers.dev${path}`, init), env, ctx);
    await Promise.all(calls.waitUntil.splice(0));
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, json: text ? JSON.parse(text) : null };
  }

  let counter = 0;
  function chatBody(text = "Can you automate my eBay listings?", extra = {}) {
    counter += 1;
    return {
      conversation_id: extra.conversation_id || "conv-test-0001",
      messages: [{ role: "user", content: text }],
      page: "/services/",
      page_lang: "en",
      name_lang: "",
      turnstile: "good-token",
      ...extra,
    };
  }

  return {
    app,
    env,
    calls,
    send,
    chat: (text, extra, options) => send("/chat", chatBody(text, extra), options),
    chatBody,
    advance: (ms) => {
      clock += ms;
    },
    now: () => clock,
    telegramCalls: () => calls.fetch.filter((c) => c.url.startsWith("https://api.telegram.org/")),
  };
}

// Smallest valid files for the magic-byte checks.
export const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4890000000049454e44ae426082", "hex").toString("base64");
export const GIF = Buffer.from("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b", "hex").toString("base64");
export function pdf(pages) {
  let body = "%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Count " + pages + " >> endobj\n";
  for (let i = 0; i < pages; i++) body += `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj\n`;
  body += "%%EOF\n";
  return Buffer.from(body, "latin1").toString("base64");
}
