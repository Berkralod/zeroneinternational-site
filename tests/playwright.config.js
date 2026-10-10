// Browser tests for the built site. Run from tests/:  npx playwright test
import { defineConfig, devices } from "@playwright/test";

const allBrowsers = process.env.ALL_BROWSERS === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory ../dist",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "ignore",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
    ...(allBrowsers
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] }, grep: /@cross/ },
          { name: "webkit", use: { ...devices["Desktop Safari"] }, grep: /@cross/ },
          { name: "mobile-safari", use: { ...devices["iPhone 14"] }, grep: /@mobile/ },
        ]
      : []),
  ],
});
