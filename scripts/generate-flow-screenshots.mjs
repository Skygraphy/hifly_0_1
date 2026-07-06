// Durchläuft die wichtigsten Klickpfade der App (anonym -> Login -> Startseite
// -> Admin-Bereich -> User-Verwaltung -> Blockieren -> Abmelden), macht dabei
// Screenshots und schreibt ein JSON-Manifest davon. Dient als Grundlage für
// ein visuelles Ablaufdiagramm (siehe scripts/build-flow-report.mjs).
//
// Usage: node scripts/generate-flow-screenshots.mjs <output-dir>
import { chromium } from "playwright";
import { config } from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

config({ path: ".env.local", quiet: true });

const outDir = process.argv[2];
if (!outDir) {
  console.error("Usage: node scripts/generate-flow-screenshots.mjs <output-dir>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const fixtureEmail = "flow-demo-user@example.com";
const fixturePassword = "flow-demo-password-123";

async function withDb(fn) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

await withDb(async (client) => {
  const hash = await bcrypt.hash(fixturePassword, 10);
  await client.query(
    `INSERT INTO users (email, name, role, password_hash)
     VALUES ($1, $2, 'user', $3)
     ON CONFLICT (email) DO UPDATE SET role = 'user', password_hash = $3`,
    [fixtureEmail, "Flow Demo User", hash]
  );
});

const steps = [];
let stepNum = 0;

async function shot(page, title, description) {
  stepNum += 1;
  const file = `${String(stepNum).padStart(2, "0")}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  const filePath = path.join(outDir, file);
  await page.screenshot({ path: filePath });
  steps.push({ step: stepNum, title, description, url: page.url(), file });
  console.log(`[${stepNum}] ${title} -> ${file}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  await page.goto("http://localhost:3000/");
  await page.waitForTimeout(200);
  await shot(page, "Startseite (anonym)", "Öffentlicher Einstiegspunkt, Login-Icon oben rechts");

  await page.getByTestId("login-link").click();
  await page.waitForURL(/\/login/);
  await page.waitForTimeout(200);
  await shot(page, "Login-Formular", "E-Mail/Passwort oder OAuth-Buttons");

  await page.getByLabel("E-Mail").fill(process.env.SUPER_ADMIN_EMAIL);
  await page.getByLabel("Passwort").fill(process.env.SUPER_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.waitForURL("http://localhost:3000/");
  await page.waitForTimeout(200);
  await shot(page, "Startseite (eingeloggt)", "Nach erfolgreichem Login, Avatar statt Login-Icon");

  await page.getByTestId("account-menu-trigger").click();
  await page.waitForTimeout(200);
  await shot(page, "Account-Menü geöffnet", "Rolle, Admin-Links, Abmelden");

  await page.getByTestId("account-menu-admin-link").click();
  await page.waitForURL(/\/admin$/);
  await page.waitForTimeout(200);
  await shot(page, "Admin-Bereich", "Landing Page für admin/super_admin");

  await page.getByRole("link", { name: "User-Rechte verwalten" }).click();
  await page.waitForURL(/\/admin\/users/);
  await page.waitForTimeout(200);
  await shot(page, "User-Verwaltung", "Tabelle aller User mit Rolle/Status");

  const row = page.locator("tr", { hasText: fixtureEmail });
  await row.getByRole("button", { name: "blockieren" }).click();
  await page.waitForTimeout(200);
  await shot(page, "User blockiert", "Status wechselt zu 'gesperrt'");

  await page.getByTestId("account-menu-trigger").click();
  await page.getByTestId("account-menu-sign-out").click();
  await page.waitForURL("http://localhost:3000/");
  await page.waitForTimeout(200);
  await shot(page, "Abgemeldet", "Zurück im anonymen Zustand auf der Startseite");
} finally {
  await browser.close();
  await withDb((client) =>
    client.query("DELETE FROM users WHERE email = $1 AND role <> 'super_admin'", [fixtureEmail])
  );
}

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(steps, null, 2));
console.log(`\n${steps.length} Screenshots + manifest.json geschrieben nach ${outDir}`);
