// Automated accessibility checks (WCAG 2.2 A/AA rules) with axe-core, in both themes and every language.
import { test, expect } from "@playwright/test";
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
