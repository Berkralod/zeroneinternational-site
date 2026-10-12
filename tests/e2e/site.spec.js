import { test, expect } from "./fixtures.js";
import { languages, content, pathFor, samplePages, config } from "./site-data.js";

async function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

// Resizes the viewport and waits until the page has laid out at the new width (newer Chromium
// applies the resize a frame or two later), so overflow is measured on the final layout.
async function resizeTo(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction((w) => window.innerWidth === w, width);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

// Names what sticks out of the viewport (elements, SVGs and text runs), so an overflow failure says what to fix.
async function overflowingElements(page) {
  return page.evaluate(() => {
    const limit = window.innerWidth + 1;
    const found = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.parentElement && el.parentElement.closest("svg")) continue;
      if (el.getBoundingClientRect().right > limit) {
        found.push(`<${el.tagName.toLowerCase()} class="${el.getAttribute("class") || ""}">`);
      }
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim()) continue;
      range.selectNodeContents(node);
      if (range.getBoundingClientRect().right > limit) {
        found.push(`text in <${node.parentElement.tagName.toLowerCase()} class="${node.parentElement.getAttribute("class") || ""}">: "${node.textContent.trim().slice(0, 50)}"`);
      }
    }
    return found.slice(-5);
  });
}

// Every template in every language: loads, no script errors, no horizontal scrolling.
for (const lang of languages) {
  test.describe(`${lang} pages @cross`, () => {
    for (const pageId of [...samplePages, "case"]) {
      test(`${pageId} renders without errors`, async ({ page }) => {
        const errors = await collectErrors(page);
        const response = await page.goto(pathFor(lang, pageId, 5));
        expect(response.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", lang);
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator("h1")).toBeVisible();
        for (const width of [320, 1280]) {
          await resizeTo(page, width, 900);
          const overflow = await horizontalOverflow(page);
          const culprits = overflow > 1 ? await overflowingElements(page) : [];
          expect(overflow, `overflow at ${width}px: ${culprits.join(" | ")}`).toBeLessThanOrEqual(1);
        }
        expect(errors).toEqual([]);
      });
    }
  });
}

// The user-visible structure is identical in every language: nothing disappears after a language switch.
test("every language has the same page structure as English", async ({ page }) => {
  const signature = async (path) => {
    await page.goto(path);
    return page.evaluate(() => ({
      sections: document.querySelectorAll("main section").length,
      h2: document.querySelectorAll("main h2").length,
      h3: document.querySelectorAll("main h3").length,
      cards: document.querySelectorAll("main .card").length,
      art: document.querySelectorAll("main svg.art").length,
      links: document.querySelectorAll("main a").length,
      faq: document.querySelectorAll("main details").length,
    }));
  };
  for (const pageId of [...samplePages, "service_web", "service_mobile", "terms", "cookies"]) {
    const reference = await signature(pathFor("en", pageId));
    for (const lang of languages.filter((l) => l !== "en")) {
      expect(await signature(pathFor(lang, pageId)), `${lang} ${pageId}`).toEqual(reference);
    }
  }
});

test("language menu keeps the visitor on the same page @cross", async ({ page }) => {
  await page.goto(pathFor("en", "service_automation"));
  await page.locator(".lang-menu summary").click();
  await page.locator('.lang-menu a[hreflang="tr"]').click();
  await expect(page).toHaveURL(new RegExp(`${pathFor("tr", "service_automation")}$`));
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await page.locator(".lang-menu summary").click();
  await page.locator('.lang-menu a[hreflang="ja"]').click();
  await expect(page).toHaveURL(new RegExp(`${pathFor("ja", "service_automation")}$`));
});

test("theme toggle switches and remembers the theme @cross", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bg();
  await page.locator("[data-theme-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bg()).not.toBe(light);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("[data-theme-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("follows the system dark theme when nothing is saved", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(12, 20, 27)");
});

test("mobile menu opens, navigates and closes with Escape @mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.locator(".nav-menu");
  await menu.locator("summary").click();
  await expect(menu.locator(".nav-menu__panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu.locator(".nav-menu__panel")).toBeHidden();
  await menu.locator("summary").click();
  await menu.locator(`a[href="${pathFor("en", "services")}"]`).first().click();
  await expect(page).toHaveURL(/\/services\/$/);
});

test("sticky call to action appears after scrolling on phones @mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const cta = page.locator("[data-sticky-cta]");
  await expect(cta).not.toHaveClass(/is-visible/);
  await page.evaluate(() => window.scrollTo(0, 1500));
  await expect(cta).toHaveClass(/is-visible/);
  await expect(page.locator("[data-back-to-top]")).toBeVisible();
  await page.locator("[data-back-to-top]").click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
});

test.describe("language suggestion", () => {
  test.use({ locale: "tr-TR" });
  test("suggests the visitor's language once and can be dismissed", async ({ page }) => {
    await page.goto(pathFor("en", "company"));
    const bar = page.locator("[data-lang-suggest]");
    await expect(bar).toBeVisible();
    await expect(bar.locator("[data-go]")).toHaveAttribute("href", pathFor("tr", "company"));
    await bar.locator("[data-dismiss]").click();
    await expect(bar).toBeHidden();
    await page.reload();
    await expect(bar).toBeHidden();
  });
  test("does not suggest the language the page is already in", async ({ page }) => {
    await page.goto(pathFor("tr", "company"));
    await expect(page.locator("[data-lang-suggest]")).toBeHidden();
  });
});

test("use-case filters show only matching cards @cross", async ({ page }) => {
  await page.goto(pathFor("en", "use_cases"));
  const cards = page.locator("[data-filter-list] > li");
  await expect(cards).toHaveCount(20);
  await page.locator('[data-filter="mobile"]').click();
  const visible = page.locator("[data-filter-list] > li:not([hidden])");
  await expect(visible).toHaveCount(4);
  await page.locator('[data-filter="all"]').click();
  await expect(visible).toHaveCount(20);
});

test("Arabic pages are right-to-left", async ({ page }) => {
  await page.goto(pathFor("ar", "home"));
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  const direction = await page.evaluate(() => getComputedStyle(document.querySelector("h1")).direction);
  expect(direction).toBe("rtl");
});

test.describe("404 page", () => {
  test.use({ locale: "de-DE" });
  test("shows the visitor's language", async ({ page }) => {
    await page.goto("/404.html");
    await expect(page.locator("h1")).toHaveText(content.de.pages.notfound.h1);
    await expect(page.locator("[data-nf=home]")).toHaveAttribute("href", "/de/");
  });
});

test("e-mail address is assembled by JavaScript", async ({ page }) => {
  await page.goto(pathFor("en", "contact"));
  const link = page.locator(".contact-aside .email-link");
  await expect(link).toHaveAttribute("href", `mailto:${config.email_user}@${config.email_domain}`);
});

test("old URLs redirect to the new pages", async ({ page }) => {
  await page.goto("/tr.html");
  await expect(page).toHaveURL(/\/tr\/$/);
  await page.goto("/services.html");
  await expect(page).toHaveURL(/\/services\/$/);
});

test("contact form submits to Formspree and shows a confirmation @cross", async ({ page }) => {
  await page.goto(pathFor("en", "contact"));
  const form = page.locator("form[data-ajax-form]");
  test.skip((await form.count()) === 0, "Formspree is not configured in this build");
  await page.route("https://formspree.io/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' })
  );
  await form.locator("#f-name").fill("Test Person");
  await form.locator("#f-email").fill("test@example.com");
  await form.locator("#f-type").selectOption("web");
  await form.locator("#f-message").fill("We would like a dashboard for our resale team, please.");
  await form.locator("#project-consent").check();
  await form.locator("[type=submit]").click();
  await expect(form.locator("[data-form-status]")).toHaveText(content.en.form.success);
});

test("page is not usable inside a frame on another site", async ({ page }) => {
  await page.setContent(`<iframe src="http://127.0.0.1:4173/" width="800" height="600"></iframe>`);
  await page.waitForTimeout(1500);
  // Either the top window was navigated away, or the framed page hid itself.
  const stillFramed = page.url() === "about:blank";
  if (stillFramed) {
    const frame = page.frames()[1];
    const display = await frame.evaluate(() => document.documentElement.style.display);
    expect(display).toBe("none");
  }
});

test("payment page links only to the payment providers' own pages", async ({ page }) => {
  await page.goto(pathFor("en", "payment"));
  const paypal = page.locator(`a[href="${config.paypal_url}"]`);
  await expect(paypal).toHaveCount(config.paypal_url ? 1 : 0);
  // No payment form or card field is ever rendered on our own site.
  await expect(page.locator("main form, main input")).toHaveCount(0);
  for (const href of await page.locator("main a[target=_blank]").evaluateAll((links) => links.map((a) => a.href))) {
    expect(new URL(href).hostname).toMatch(/(^|\.)(paypal\.(com|me|biz)|square\.link|square\.site|squareup\.com)$/);
  }
});

test("blog lists every post, posts render and the newsletter form submits @cross", async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto(pathFor("de", "blog"));
  const cards = page.locator(".post-card");
  expect(await cards.count()).toBeGreaterThan(0);
  await cards.first().locator("a").click();
  await expect(page).toHaveURL(/\/blog\/[a-z0-9-]+\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("article h1")).toBeVisible();
  for (const width of [320, 1280]) {
    await resizeTo(page, width, 900);
    expect(await horizontalOverflow(page), `overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
  const form = page.locator("section.newsletter form[data-ajax-form]");
  test.skip((await form.count()) === 0, "Formspree is not configured in this build");
  await page.route("https://formspree.io/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' })
  );
  await form.locator("#nl-email").fill("reader@example.com");
  await form.locator("#nl-consent").check();
  await form.locator("[type=submit]").click();
  await expect(form.locator("[data-form-status]")).toHaveText(content.en.newsletter.success);
  expect(errors).toEqual([]);
});
