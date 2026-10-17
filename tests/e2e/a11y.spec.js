// Automated accessibility checks (WCAG 2.2 A/AA rules) with axe-core, in both themes and every language.
import { test, expect } from "./fixtures.js";
import AxeBuilder from "@axe-core/playwright";
import { languages, pathFor } from "./site-data.js";

const pages = ["home", "contact", "case"];

for (const scheme of ["light", "dark"]) {
  test.describe(`accessibility (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    for (const lang of languages) {
      for (const pageId of pages) {
        test(`${lang} ${pageId}`, async ({ page }) => {
          await page.goto(pathFor(lang, pageId, 0));
          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze();
          const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
          expect(
            serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)
          ).toEqual([]);
        });
      }
    }
  });
}

// Blog index (every language is covered by the loop above for other pages) and every blog post.
import { readdirSync } from "node:fs";
const postSlugs = readdirSync(new URL("../../content/blog/", import.meta.url)).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
for (const scheme of ["light", "dark"]) {
  test.describe(`accessibility of the blog (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    for (const path of [pathFor("en", "blog"), pathFor("ar", "blog"), ...postSlugs.map((s) => `${pathFor("en", "blog")}${s}/`)]) {
      test(path, async ({ page }) => {
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
        expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
      });
    }
  });
}

// Local Services pages (English only).
const localSlugs = readdirSync(new URL("../../content/local/", import.meta.url)).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
for (const scheme of ["light", "dark"]) {
  test.describe(`accessibility of the local services pages (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    for (const path of localSlugs.map((s) => (s === "index" ? "/local/" : `/local/${s}/`))) {
      test(path, async ({ page }) => {
        await page.goto(path);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
        expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
      });
    }
  });
}
