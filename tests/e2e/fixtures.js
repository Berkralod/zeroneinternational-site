// Shared test setup: the Cloudflare analytics beacon is replaced by an empty script,
// so tests never depend on the network and never count as real visits.
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route((url) => url.hostname === "static.cloudflareinsights.com" || url.hostname === "cloudflareinsights.com", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
    );
    await use(context);
  },
});
export { expect };
