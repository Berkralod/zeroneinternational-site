// Shared test setup: the Cloudflare analytics beacon is replaced by an empty script, and Turnstile by
// a stand-in that always fails (website forms then fall back to Formspree, as they do when the
// Worker is unreachable), so tests never depend on the network and never count as real visits.
// Tests that need a working Turnstile register their own route (later routes take precedence).
import { test as base, expect } from "@playwright/test";

const FAILING_TURNSTILE = `window.turnstile = {
  render: function (el, params) { el.__p = params; return "w0"; },
  execute: function (el) { setTimeout(function () { el.__p["error-callback"](); }, 10); },
  reset: function () {}
};`;

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route((url) => url.hostname === "static.cloudflareinsights.com" || url.hostname === "cloudflareinsights.com", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
    );
    await context.route("https://challenges.cloudflare.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: FAILING_TURNSTILE })
    );
    await use(context);
  },
});
export { expect };
