// The AI sales assistant widget, with a mocked Worker and a mocked Turnstile.
// Runs only against a build with the assistant switched on, for example:
//   ZERONE_ASSISTANT_ENDPOINT=https://assistant.test.invalid ZERONE_ASSISTANT_TURNSTILE_SITEKEY=1x00000000000000000000AA python3 build.py
// With the default build (assistant off) every test here is skipped and the widget must not exist.
import { test, expect } from "./fixtures.js";
import AxeBuilder from "@axe-core/playwright";
import { content, pathFor, config } from "./site-data.js";

const BASE = config.base_url.replace(/\/$/, "");
const FAKE_TURNSTILE = `window.turnstile = {
  render: function (el, params) { window.__ts = params; return "w1"; },
  execute: function () { setTimeout(function () { window.__ts.callback("test-token"); }, 10); },
  reset: function () {}
};`;

async function settings(page) {
  const node = page.locator("#assistant-data");
  if ((await node.count()) === 0) return null;
  return JSON.parse(await node.textContent());
}

function answer(fields = {}) {
  return {
    reply: "We build websites, AI assistants and custom automation. What would you like to automate first?",
    sig: "a".repeat(64),
    fallback: false,
    lang: "en",
    name: "Emma",
    links: [
      { id: "service_automation", url: `${BASE}${pathFor("en", "service_automation")}`, label: "Automation & bots" },
      { id: "contact", url: `${BASE}${pathFor("en", "contact")}`, label: "Contact" },
      { id: "evil", url: "https://evil.example/phish", label: "Free money" },
    ],
    suggestions: ["How does a project work?", "What does it cost?"],
    off_topic: false,
    lead_sent: false,
    blocked_until: 0,
    now: Date.now(),
    ...fields,
  };
}

// Opens the page with the Worker mocked by `handler(body)` -> {status, json}. Returns the list of requests.
async function openWith(page, path, handler, { skipIfOff = true } = {}) {
  await page.context().route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_TURNSTILE })
  );
  await page.goto(path);
  const cfg = await settings(page);
  if (skipIfOff) test.skip(!cfg, "The assistant is not enabled in this build (set ZERONE_ASSISTANT_ENDPOINT)");
  const requests = [];
  await page.route(`${cfg.endpoint}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    const body = request.postDataJSON();
    requests.push({ path: new URL(request.url()).pathname, body });
    const result = await handler(body, requests.length);
    return route.fulfill({ status: result.status || 200, contentType: "application/json", body: JSON.stringify(result.json) });
  });
  return { cfg, requests };
}

test("the assistant is not on the page when it is switched off", async ({ page }) => {
  await page.goto("/");
  const cfg = await settings(page);
  test.skip(Boolean(cfg), "This build has the assistant switched on");
  await expect(page.locator(".zai-launcher")).toHaveCount(0);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).not.toContain("challenges.cloudflare.com");
});

test.describe("AI sales assistant", () => {
  test("opens, shows the welcome screen and closes with the button and Escape @mobile", async ({ page }) => {
    await openWith(page, "/", () => ({ json: answer() }));
    const t = content.en.assistant;
    const launcher = page.locator(".zai-launcher");
    await expect(launcher).toBeVisible();
    await expect(launcher).toHaveAttribute("aria-label", t.launcher);
    await launcher.click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".zai-title")).toHaveText("Emma");
    await expect(panel.locator(".zai-greeting")).toHaveText(t.greeting.replace("{name}", "Emma"));
    await expect(panel.locator(".zai-notice a")).toHaveAttribute("href", pathFor("en", "privacy"));
    // At least five topic chips plus "Other".
    const chips = panel.locator(".zai-welcome .zai-chip");
    await expect(chips).toHaveCount(t.chips.length + 1);
    expect(t.chips.length).toBeGreaterThanOrEqual(5);
    await panel.getByRole("button", { name: t.chip_other }).click();
    await expect(panel.locator("textarea")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(launcher).toBeFocused();
    await launcher.click();
    await panel.getByRole("button", { name: t.close }).click();
    await expect(panel).toBeHidden();
  });

  test("keeps focus inside the open panel", async ({ page }) => {
    await openWith(page, "/", () => ({ json: answer() }));
    await page.locator(".zai-launcher").click();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement.closest(".zai-panel")))).toBe(true);
    }
  });

  test("a chip sends a message; links open in a new tab and unknown links are dropped", async ({ page }) => {
    const { requests } = await openWith(page, "/", () => ({ json: answer() }));
    const t = content.en.assistant;
    await page.locator(".zai-launcher").click();
    await page.locator(".zai-welcome .zai-chip").first().click();
    const bot = page.locator(".zai-msg--bot").last();
    await expect(bot).toContainText("We build custom automation");
    expect(requests[0].path).toBe("/chat");
    expect(requests[0].body.messages.at(-1)).toEqual({ role: "user", content: t.chips[0] });
    expect(requests[0].body.turnstile).toBe("test-token");
    expect(requests[0].body.page_lang).toBe("en");
    expect(requests[0].body.conversation_id).toMatch(/^[a-f0-9]{32}$/);
    const links = bot.locator("a.zai-link");
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener");
    }
    await expect(links.first()).toHaveAttribute("href", `${BASE}${pathFor("en", "service_automation")}`);
    await expect(page.locator('a[href*="evil.example"]')).toHaveCount(0);
    // Clicking opens a new tab (the live site is not contacted: the request is answered locally).
    await page.context().route(`${BASE}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>ok</title>" }));
    const [popup] = await Promise.all([page.waitForEvent("popup"), links.first().click()]);
    expect(popup.url()).toBe(`${BASE}${pathFor("en", "service_automation")}`);
    await popup.close();
    // Suggested follow-up chips; the welcome chips are gone.
    await expect(page.locator(".zai-chips--suggest .zai-chip")).toHaveCount(2);
    await expect(page.locator(".zai-welcome .zai-chips")).toBeHidden();
    // The second message sends the signed reply back and needs no new Turnstile token.
    await page.locator(".zai-chips--suggest .zai-chip").first().click();
    await expect(page.locator(".zai-msg--bot")).toHaveCount(2);
    expect(requests[1].body.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(requests[1].body.messages[1].sig).toBe("a".repeat(64));
    expect(requests[1].body.turnstile).toBe("");
  });

  test("locks the name to the language of the first reply", async ({ page }) => {
    const { requests } = await openWith(page, "/", () => ({ json: answer({ lang: "tr", name: "Elif", reply: "Merhaba! Size nasıl yardımcı olabilirim?" }) }));
    await page.locator(".zai-launcher").click();
    await page.locator("textarea").fill("Merhaba");
    await page.keyboard.press("Enter");
    await expect(page.locator(".zai-title")).toHaveText("Elif");
    await page.locator("textarea").fill("Fiyatlar?");
    await page.keyboard.press("Enter");
    await expect(page.locator(".zai-msg--bot")).toHaveCount(2);
    expect(requests[1].body.name_lang).toBe("tr");
  });

  test("an off-topic block shows a live countdown and disables the input", async ({ page }) => {
    let n = 0;
    await openWith(page, "/", () => {
      n += 1;
      const now = Date.now();
      if (n < 3) return { json: answer({ reply: "I can only help with our services.", off_topic: true, links: [], suggestions: [] }) };
      return { json: answer({ reply: "I can only help with our services.", off_topic: true, links: [], suggestions: [], blocked_until: now + 3600_000, reason: "offtopic", now }) };
    });
    const t = content.en.assistant;
    await page.locator(".zai-launcher").click();
    const questions = ["How many goals did Fenerbahçe score this week?", "And the weather?", "Who won?"];
    for (const [i, q] of questions.entries()) {
      await page.locator("textarea").fill(q);
      await page.keyboard.press("Enter");
      await expect(page.locator(".zai-msg--bot")).toHaveCount(i + 1);
    }
    const status = page.locator(".zai-status");
    await expect(status).toBeVisible();
    await expect(status).toContainText(t.blocked_offtopic);
    const clock = status.locator(".zai-countdown");
    await expect(clock).toHaveText(/^(1:00:00|59:\d\d)$/);
    const first = await clock.textContent();
    await expect.poll(async () => clock.textContent(), { timeout: 4000 }).not.toBe(first);
    await expect(page.locator("textarea")).toBeDisabled();
    await expect(page.locator(".zai-send")).toBeDisabled();
    await expect(status.locator("a.zai-link").first()).toHaveAttribute("target", "_blank");
    // The block survives a reload (same tab), and the server stays the authority.
    await page.reload();
    await page.locator(".zai-launcher").click();
    await expect(page.locator(".zai-status .zai-countdown")).toHaveText(/^(59:\d\d)$/);
  });

  test("a rate-limit block from the server (429) shows the countdown", async ({ page }) => {
    await openWith(page, "/", () => ({ status: 429, json: { error: "blocked", reason: "rate", blocked_until: Date.now() + 125_000, now: Date.now() } }));
    await page.locator(".zai-launcher").click();
    await page.locator("textarea").fill("hello");
    await page.keyboard.press("Enter");
    await expect(page.locator(".zai-status")).toContainText(content.en.assistant.blocked_rate);
    await expect(page.locator(".zai-countdown")).toHaveText(/^0[12]:\d\d$/);
    await expect(page.locator("textarea")).toBeDisabled();
  });

  test("busy (daily cap) shows the contact links", async ({ page }) => {
    await openWith(page, "/", () => ({ status: 503, json: { error: "busy" } }));
    await page.locator(".zai-launcher").click();
    await page.locator("textarea").fill("hello");
    await page.keyboard.press("Enter");
    const note = page.locator(".zai-msg--bot").last();
    await expect(note).toContainText(content.en.assistant.busy);
    await expect(note.locator(`a.zai-link[href="${BASE}${pathFor("en", "contact")}"]`)).toHaveCount(1);
  });

  test("attachments: wrong types are refused, a PNG is sent once", async ({ page }) => {
    const { requests } = await openWith(page, "/", () => ({ json: answer() }));
    const t = content.en.assistant;
    await page.locator(".zai-launcher").click();
    const file = page.locator(".zai-form input[type=file]");
    await file.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(page.locator(".zai-form .zai-error")).toHaveText(t.file_type);
    await file.setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not really a png") });
    await expect(page.locator(".zai-form .zai-error")).toHaveText(t.file_type);
    const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
    await file.setInputFiles({ name: "workflow.png", mimeType: "image/png", buffer: png });
    await expect(page.locator(".zai-file__name")).toHaveText("workflow.png");
    await page.locator("textarea").fill("This is our current workflow");
    await page.keyboard.press("Enter");
    await expect(page.locator(".zai-msg--user .zai-msg__file")).toContainText("workflow.png");
    await expect(page.locator(".zai-msg--bot")).toHaveCount(1);
    expect(requests[0].body.attachment.type).toBe("image/png");
    expect(requests[0].body.attachment.data).toBe(png.toString("base64"));
    await expect(page.locator(".zai-file")).toBeHidden();
  });

  test("large photos are scaled down in the browser before upload", async ({ page }) => {
    const { requests } = await openWith(page, "/", () => ({ json: answer() }));
    await page.locator(".zai-launcher").click();
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 3000;
      canvas.height = 2000;
      const ctx = canvas.getContext("2d");
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `hsl(${i * 37 % 360} 70% 50%)`;
        ctx.fillRect((i * 97) % 3000, (i * 53) % 2000, 120, 80);
      }
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      const input = document.querySelector(".zai-form input[type=file]");
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "photo.png", { type: "image/png" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change"));
    });
    await expect(page.locator(".zai-file__name")).toHaveText("photo.png");
    await page.locator("textarea").fill("Our warehouse");
    await page.keyboard.press("Enter");
    await expect(page.locator(".zai-msg--bot")).toHaveCount(1);
    expect(requests[0].body.attachment.type).toBe("image/jpeg");
    const bytes = Buffer.from(requests[0].body.attachment.data, "base64");
    expect(bytes[0]).toBe(0xff);
    expect(bytes.length).toBeLessThan(4 * 1024 * 1024);
  });

  test("badge and sound setting: a reply while the panel is closed shows the badge; mute is remembered", async ({ page }) => {
    await openWith(page, "/", async () => {
      await new Promise((r) => setTimeout(r, 600));
      return { json: answer() };
    });
    const t = content.en.assistant;
    await page.locator(".zai-launcher").click();
    const bell = page.locator(".zai-head").getByRole("button", { name: t.sound_off });
    await expect(bell).toHaveAttribute("aria-pressed", "false");
    await bell.click();
    await expect(page.locator(".zai-head").getByRole("button", { name: t.sound_on })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("zerone-assistant-muted"))).toBe("1");
    await page.locator("textarea").fill("hello");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(page.locator(".zai-badge")).toBeVisible();
    await expect(page.locator(".zai-launcher")).toHaveAttribute("aria-label", `${t.launcher} (${t.unread})`);
    await page.locator(".zai-launcher").click();
    await expect(page.locator(".zai-badge")).toBeHidden();
    await page.reload();
    await page.locator(".zai-launcher").click();
    await expect(page.locator(".zai-head").getByRole("button", { name: t.sound_on })).toBeVisible();
    // The conversation is kept for this tab.
    await expect(page.locator(".zai-msg--bot")).toHaveCount(1);
  });

  test("'Send this conversation to the team' needs consent and a contact", async ({ page }) => {
    const { requests } = await openWith(page, "/", (body, i) => (i === 1 ? { json: answer() } : { json: { ok: true } }));
    const t = content.en.assistant;
    await page.locator(".zai-launcher").click();
    await page.locator("textarea").fill("I need a dashboard");
    await page.keyboard.press("Enter");
    await expect(page.locator(".zai-msg--bot")).toHaveCount(1);
    await page.getByRole("button", { name: t.send_team }).click();
    const team = page.locator(".zai-team");
    await expect(team).toBeVisible();
    await expect(team.locator("label a")).toHaveAttribute("href", pathFor("en", "privacy"));
    await team.locator("#zai-team-name").fill("Sam");
    await team.locator("#zai-team-contact").fill("nope");
    await team.getByRole("button", { name: t.send_team_submit }).click();
    await expect(team.locator(".zai-error")).toHaveText(t.send_team_invalid);
    await team.locator("#zai-team-contact").fill("sam@example.com");
    await team.getByRole("button", { name: t.send_team_submit }).click();
    await expect(team.locator(".zai-error")).toBeVisible();
    expect(requests.length).toBe(1);
    await team.locator("#zai-team-consent").check();
    await team.getByRole("button", { name: t.send_team_submit }).click();
    await expect(page.locator(".zai-msg--bot").last()).toContainText(t.send_team_done);
    expect(requests[1].path).toBe("/lead");
    expect(requests[1].body).toMatchObject({ consent: true, contact: "sam@example.com", name: "Sam" });
  });

  test("Arabic: right-to-left panel with the Arabic name @mobile", async ({ page }) => {
    await openWith(page, pathFor("ar", "home"), () => ({ json: answer({ lang: "ar" }) }));
    await page.locator(".zai-launcher").click();
    await expect(page.locator(".zai")).toHaveAttribute("dir", "rtl");
    await expect(page.locator(".zai-title")).toHaveText("Layla");
    await expect(page.locator(".zai-greeting")).toHaveText(content.ar.assistant.greeting.replace("{name}", "Layla"));
  });

  test("phones: full-height sheet, and the launcher never covers the sticky CTA or back-to-top @mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWith(page, "/", () => ({ json: answer() }));
    await page.evaluate(() => window.scrollTo(0, 1600));
    await expect(page.locator("[data-sticky-cta]")).toHaveClass(/is-visible/);
    await expect(page.locator("[data-back-to-top]")).toBeVisible();
    const box = async (sel) => page.locator(sel).boundingBox();
    const launcher = await box(".zai-launcher");
    for (const other of ["[data-sticky-cta]", "[data-back-to-top]"]) {
      const b = await box(other);
      const overlap = launcher.x < b.x + b.width && b.x < launcher.x + launcher.width && launcher.y < b.y + b.height && b.y < launcher.y + launcher.height;
      expect(overlap, `launcher overlaps ${other}`).toBe(false);
    }
    await page.locator(".zai-launcher").click();
    // Measured after the opening animation (if motion is allowed) has finished.
    await expect.poll(async () => Math.round((await box(".zai-panel")).width)).toBe(390);
    const panel = await box(".zai-panel");
    expect(panel.height).toBeGreaterThanOrEqual(840);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });

  test("desktop: a compact panel next to the launcher, clear of back-to-top", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openWith(page, "/", () => ({ json: answer() }));
    await page.evaluate(() => window.scrollTo(0, 2000));
    await expect(page.locator("[data-back-to-top]")).toBeVisible();
    const launcher = await page.locator(".zai-launcher").boundingBox();
    const top = await page.locator("[data-back-to-top]").boundingBox();
    expect(top.y + top.height).toBeLessThanOrEqual(launcher.y);
    await page.locator(".zai-launcher").click();
    const panel = await page.locator(".zai-panel").boundingBox();
    expect(panel.width).toBeLessThanOrEqual(380);
    expect(panel.y + panel.height).toBeLessThanOrEqual(launcher.y);
  });

  for (const scheme of ["light", "dark"]) {
    test(`passes axe with the panel open (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openWith(page, "/", () => ({ json: answer() }));
      await page.locator(".zai-launcher").click();
      await page.locator(".zai-welcome .zai-chip").first().click();
      await expect(page.locator(".zai-msg--bot")).toHaveCount(1);
      const results = await new AxeBuilder({ page })
        .include(".zai")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
    });
  }
});
