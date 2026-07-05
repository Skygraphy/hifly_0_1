import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Die Auth-Specs schreiben/lesen echte Fixture-User gegen einen einzigen
  // geteilten Dev-Server + Postgres-Pool (kein per-Test-isoliertes Backend).
  // Parallele Worker führten dort zu sporadisch fehlschlagenden Logins unter
  // Last — daher bewusst seriell statt fullyParallel.
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
