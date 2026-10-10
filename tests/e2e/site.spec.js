import { test, expect } from "@playwright/test";
import { languages, content, pathFor, samplePages, config } from "./site-data.js";

async function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

async function horizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

// Names the elements that stick out of the viewport, so an overflow failure says what to fix.
async function overflowingElements(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((el) => !el.closest("svg") && el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(-3)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className} "${(el.textContent || "").trim().slice(0, 40)}"`)
  );
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
          await page.setViewportSize({ width, height: 900 });
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
