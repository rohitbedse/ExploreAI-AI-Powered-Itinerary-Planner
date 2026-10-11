import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // One `next dev` process serves every worker. With the default (half the CPU cores) it
  // saturates: a single `page.goto` was measured at ~21 s and tests timed out at random,
  // while the serial run was faster overall (1.6 vs 1.8 min). Keep local runs to 2 workers.
  workers: process.env.CI ? undefined : 2,
  expect: { timeout: 10_000 }, // first hit on `next dev` compiles routes on demand
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Deterministic location so the "current location" chip path is exercised.
    geolocation: { latitude: 12.9716, longitude: 77.5946 },
    permissions: ["geolocation"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
