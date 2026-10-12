// Extra abuse cases found while reviewing the Worker adversarially.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, reply, message } from "./helpers.js";
import { ipKey } from "../src/app.js";
import { validateAttachment, FileError } from "../src/files.js";
import { stripUrls } from "../src/sanitize.js";

test("IPv6 visitors are limited per /64 network, IPv4 per address", async () => {
  assert.equal(ipKey("2001:db8:abcd:12:1::5"), "2001:db8:abcd:12::/64");
  assert.equal(ipKey("2001:0db8:abcd:0012:ffff:1:2:3"), "2001:db8:abcd:12::/64");
  assert.equal(ipKey("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(ipKey("203.0.113.7"), "203.0.113.7");
  const t = setup({ respond: () => message(reply({ off_topic: true })) });
  await t.chat("football?", {}, { ip: "2001:db8:abcd:12::1" });
  await t.chat("weather?", {}, { ip: "2001:db8:abcd:12::2" });
  const third = await t.chat("movies?", {}, { ip: "2001:db8:abcd:12:ffff::9" });
  assert.ok(third.json.blocked_until > t.now(), "rotating addresses inside one /64 does not escape the block");
});

test("safety refusals count as strikes", async () => {
  const t = setup({ respond: () => ({ ...message("", "refusal"), content: [] }) });
  await t.chat("something harmful");
  await t.chat("something harmful again");
  const third = await t.chat("and again");
  assert.equal(third.json.fallback, true);
  assert.ok(third.json.blocked_until > t.now());
});

test("a blocked visitor is turned away before any file check or model call", async () => {
  const t = setup({ respond: () => message(reply({ off_topic: true })) });
  for (const q of ["a", "b", "c"]) await t.chat(q);
  const res = await t.chat("look", { attachment: { type: "image/png", data: "@@@@" } });
  assert.equal(res.status, 429);
  assert.equal(res.json.error, "blocked");
  assert.equal(typeof res.json.now, "number");
  assert.equal(t.calls.model.length, 3);
});

test("file size is checked from the base64 length before anything is decoded", () => {
  const huge = "A".repeat(Math.ceil((4 * 1024 * 1024 + 1) / 3) * 4);
  assert.throws(() => validateAttachment({ type: "image/png", data: huge }), (e) => e instanceof FileError && e.code === "file_too_big");
  assert.throws(() => validateAttachment({ type: "image/png", data: "iVBORw0KGgo!AAAANSUhEUgAA" }), (e) => e.code === "bad_file");
  assert.throws(() => validateAttachment({ type: ["image/png"], data: "x" }), (e) => e.code === "bad_file_type");
  assert.throws(() => validateAttachment("data:image/png;base64,xyz"), (e) => e.code === "bad_file");
});

test("URL stripping keeps catalogue URLs and removes look-alikes", () => {
  const allowed = new Set(["https://zeroneinternational.com/contact"]);
  const out = stripUrls(
    "See https://zeroneinternational.com/contact/ or https://zeroneinternational.com.evil.example/contact or www.evil.example, " +
      "[click](javascript:alert(1)) and HTTPS://EVIL.EXAMPLE/x.",
    allowed
  );
  assert.ok(out.includes("https://zeroneinternational.com/contact/"), out);
  assert.equal(/evil|javascript/i.test(out), false, out);
});
