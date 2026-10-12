// Durable Objects (SQLite-backed, free plan) that hold counters only, never messages.
//
// IpLimiter: one instance per visitor, named by a salted SHA-256 hash of the IP address (the raw IP is
// never stored). It enforces the message rate limits, the off-topic/abuse strikes and the resulting
// blocks, the upload limits and the lead limits, and remembers for a while that the visitor passed
// the Turnstile bot check. Everything is deleted 24 hours after the last activity.
//
// DailyBudget: a single instance ("global") counting model requests per UTC day, for the hard daily cap.
//
// Both use the classic fetch() interface with small JSON commands, so they need no runtime imports
// and can be unit tested in Node with an in-memory storage.

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const RULES = {
  shortWindow: 10 * MINUTE,
  shortMax: 20, // messages per 10 minutes
  dayMax: 60, // messages per 24 hours
  strikeWindow: HOUR, // rolling window for off-topic / abuse strikes
  strikeMax: 3, // strikes within the window -> block
  strikeBlock: HOUR, // block length after too many strikes
  verifiedFor: 30 * MINUTE, // how long a passed Turnstile check is trusted
  uploadsPerConversation: 3,
  uploadsPerDay: 10,
  leadsPerDay: 3,
  retention: DAY, // all state of an IP hash is deleted this long after its last activity
};

function fresh() {
  return { msgs: [], strikes: [], blockedUntil: 0, reason: "", verifiedUntil: 0, uploads: [], leads: [] };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

/** Pure state machine for one IP hash; `state` is mutated and must be saved by the caller. */
export const ipRules = {
  prune(state, now) {
    state.msgs = state.msgs.filter((t) => t > now - DAY);
    state.strikes = state.strikes.filter((t) => t > now - RULES.strikeWindow);
    state.uploads = state.uploads.filter((u) => u.t > now - DAY);
    state.leads = state.leads.filter((l) => l.t > now - DAY);
    if (state.blockedUntil && state.blockedUntil <= now) {
      state.blockedUntil = 0;
      state.reason = "";
    }
  },

  peek(state, now) {
    ipRules.prune(state, now);
    return {
      blocked_until: state.blockedUntil || 0,
      reason: state.reason || "",
      verified: state.verifiedUntil > now,
    };
  },

  // Counts one message. Returns {ok:true} or {ok:false, blocked_until, reason} / {ok:false, error}.
  admit(state, now, { verified = false, upload = false, conversation = "" } = {}) {
    ipRules.prune(state, now);
    if (state.blockedUntil > now) return { ok: false, blocked_until: state.blockedUntil, reason: state.reason };
    if (verified) state.verifiedUntil = now + RULES.verifiedFor;
    const recent = state.msgs.filter((t) => t > now - RULES.shortWindow);
    if (recent.length >= RULES.shortMax) {
      state.blockedUntil = recent[0] + RULES.shortWindow;
      state.reason = "rate";
      return { ok: false, blocked_until: state.blockedUntil, reason: state.reason };
    }
    if (state.msgs.length >= RULES.dayMax) {
      state.blockedUntil = state.msgs[0] + DAY;
      state.reason = "daily";
      return { ok: false, blocked_until: state.blockedUntil, reason: state.reason };
    }
    if (upload) {
      const inConversation = state.uploads.filter((u) => u.c === conversation).length;
      if (inConversation >= RULES.uploadsPerConversation || state.uploads.length >= RULES.uploadsPerDay) {
        return { ok: false, error: "too_many_uploads" };
      }
      state.uploads.push({ t: now, c: conversation });
    }
    state.msgs.push(now);
    return { ok: true };
  },

  // The visitor passed the Turnstile check (used by /lead, which does not count as a message).
  verify(state, now) {
    ipRules.prune(state, now);
    state.verifiedUntil = now + RULES.verifiedFor;
    return { ok: true };
  },

  // Records an off-topic or abuse strike; the third one within the window blocks the IP for an hour.
  strike(state, now) {
    ipRules.prune(state, now);
    state.strikes.push(now);
    if (state.strikes.length >= RULES.strikeMax) {
      state.blockedUntil = Math.max(state.blockedUntil, now + RULES.strikeBlock);
      state.reason = "offtopic";
      state.strikes = [];
      return { blocked_until: state.blockedUntil, reason: state.reason, strikes: RULES.strikeMax };
    }
    return { blocked_until: 0, reason: "", strikes: state.strikes.length };
  },

  // A lead notification: at most once per conversation and kind, and a few per IP per day.
  lead(state, now, { kind, conversation }) {
    ipRules.prune(state, now);
    if (state.leads.length >= RULES.leadsPerDay) return { ok: false };
    if (state.leads.some((l) => l.k === kind && l.c === conversation)) return { ok: false };
    state.leads.push({ t: now, k: kind, c: conversation });
    return { ok: true };
  },
};

export class IpLimiter {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    let command;
    try {
      command = await request.json();
    } catch {
      return json({ error: "bad_command" }, 400);
    }
    const now = typeof command.now === "number" ? command.now : Date.now();
    const state = { ...fresh(), ...((await this.ctx.storage.get("state")) || {}) };
    let result;
    switch (command.op) {
      case "peek":
        result = ipRules.peek(state, now);
        break;
      case "admit":
        result = ipRules.admit(state, now, command);
        break;
      case "verify":
        result = ipRules.verify(state, now);
        break;
      case "strike":
        result = ipRules.strike(state, now);
        break;
      case "lead":
        result = ipRules.lead(state, now, command);
        break;
      default:
        return json({ error: "bad_command" }, 400);
    }
    await this.ctx.storage.put("state", state);
    // Privacy: forget this IP hash entirely 24 hours after its last activity.
    await this.ctx.storage.setAlarm(now + RULES.retention);
    return json(result);
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

export function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}

export class DailyBudget {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  // {op:"take", cap} counts one model request for today (UTC) unless the cap is reached.
  // first_refusal is true exactly once per day, so the owner gets a single alert.
  async fetch(request) {
    let command;
    try {
      command = await request.json();
    } catch {
      return json({ error: "bad_command" }, 400);
    }
    if (command.op !== "take") return json({ error: "bad_command" }, 400);
    const now = typeof command.now === "number" ? command.now : Date.now();
    const cap = Number.isFinite(command.cap) && command.cap >= 0 ? command.cap : 0;
    const key = dayKey(now);
    const day = (await this.ctx.storage.get("day")) || { key, count: 0, refused: 0 };
    if (day.key !== key) Object.assign(day, { key, count: 0, refused: 0 });
    let result;
    if (day.count >= cap) {
      day.refused += 1;
      result = { ok: false, count: day.count, first_refusal: day.refused === 1 };
    } else {
      day.count += 1;
      result = { ok: true, count: day.count };
    }
    await this.ctx.storage.put("day", day);
    return json(result);
  }
}
