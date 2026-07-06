// Durchläuft die wichtigsten Klickpfade der App (anonym -> Login -> Startseite
// -> Admin-Bereich -> User-Verwaltung -> Blockieren -> Abmelden), macht dabei
// Screenshots im Speicher (keine losen PNG-Dateien) und schreibt ein
// eigenständiges report.html (Navigationskarte + Screenshot-Walkthrough,
// Bilder als Base64 eingebettet).
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
  const buffer = await page.screenshot();
  steps.push({
    step: stepNum,
    title,
    description,
    url: page.url(),
    dataUri: `data:image/png;base64,${buffer.toString("base64")}`,
  });
  console.log(`[${stepNum}] ${title}`);
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

const generatedAt = new Date().toLocaleString("de-AT", { timeZone: "Europe/Vienna" });
const html = buildReportHtml(steps, generatedAt);
const reportPath = path.join(outDir, "report.html");
writeFileSync(reportPath, html);
console.log(`\nreport.html geschrieben nach ${reportPath}`);

function buildReportHtml(steps, generatedAt) {
  const stepsHtml = steps
    .map(
      (s) => `
      <div class="step">
        <div class="step-rail">
          <div class="step-num">${s.step}</div>
          <div class="step-line"></div>
        </div>
        <div class="step-card">
          <img src="${s.dataUri}" alt="Screenshot: ${escapeHtml(s.title)}" />
          <div>
            <p class="step-title">${escapeHtml(s.title)}</p>
            <p class="step-desc">${escapeHtml(s.description)}</p>
            <span class="step-url">${escapeHtml(s.url)}</span>
          </div>
        </div>
      </div>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>HiFly — Navigations- &amp; Flow-Analyse</title>
<style>
  :root {
    --bg: #f7f5f3; --surface: #ffffff; --surface-2: #f1efec; --border: #e2ded9;
    --text: #1c1c1c; --text-muted: #6b6b6b; --accent: #d9603f;
    --accent-soft: rgba(217, 96, 63, 0.1); --danger: #c23b3b; --danger-soft: rgba(194, 59, 59, 0.07);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #121212; --surface: #1b1b1b; --surface-2: #202020; --border: #2e2e2e;
      --text: #ededed; --text-muted: #9a9a9a; --accent: #ff7f50;
      --accent-soft: rgba(255, 127, 80, 0.12); --danger: #e5484d; --danger-soft: rgba(229, 72, 77, 0.1);
    }
  }
  :root[data-theme="dark"] {
    --bg: #121212; --surface: #1b1b1b; --surface-2: #202020; --border: #2e2e2e;
    --text: #ededed; --text-muted: #9a9a9a; --accent: #ff7f50;
    --accent-soft: rgba(255, 127, 80, 0.12); --danger: #e5484d; --danger-soft: rgba(229, 72, 77, 0.1);
  }
  :root[data-theme="light"] {
    --bg: #f7f5f3; --surface: #ffffff; --surface-2: #f1efec; --border: #e2ded9;
    --text: #1c1c1c; --text-muted: #6b6b6b; --accent: #d9603f;
    --accent-soft: rgba(217, 96, 63, 0.1); --danger: #c23b3b; --danger-soft: rgba(194, 59, 59, 0.07);
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; line-height: 1.5; }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 56px 24px 96px; display: flex; flex-direction: column; gap: 64px; }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85em; }
  header h1 { font-size: clamp(1.8rem, 4vw, 2.4rem); font-weight: 700; letter-spacing: -0.02em; margin: 0 0 8px; text-wrap: balance; }
  header p { color: var(--text-muted); margin: 0; max-width: 65ch; }
  header .meta { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  .tag { font-size: 0.75rem; letter-spacing: 0.03em; text-transform: uppercase; color: var(--text-muted); border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; }
  section > h2 { font-size: 1.3rem; font-weight: 650; margin: 0 0 6px; display: flex; align-items: center; gap: 10px; }
  section > h2 .accent-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
  section > .section-desc { color: var(--text-muted); margin: 0 0 28px; max-width: 68ch; }
  .diagram-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
  .diagram-scroll svg { display: block; min-width: 720px; }
  .node-box { fill: var(--surface-2); stroke: var(--border); stroke-width: 1.5; rx: 10; }
  .node-box.entry { fill: none; stroke: var(--text-muted); stroke-dasharray: 4 4; }
  .node-label { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: 15px; font-weight: 650; fill: var(--text); }
  .node-path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; fill: var(--accent); font-weight: 600; }
  .node-sub { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: 11.5px; fill: var(--text-muted); }
  .edge { fill: none; stroke: var(--text-muted); stroke-width: 1.6; }
  .edge.danger { stroke: var(--danger); stroke-dasharray: 5 4; }
  .edge-label { font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: 11.5px; fill: var(--text-muted); }
  .guard-box { fill: var(--danger-soft); stroke: var(--danger); stroke-width: 1.2; stroke-dasharray: 3 3; rx: 10; }
  .guard-title { font-family: Inter, sans-serif; font-size: 12.5px; font-weight: 700; fill: var(--danger); }
  .guard-text { font-family: Inter, sans-serif; font-size: 12px; fill: var(--text); }
  .steps { display: flex; flex-direction: column; gap: 0; position: relative; }
  .step { display: grid; grid-template-columns: 44px 1fr; gap: 20px; padding-bottom: 36px; position: relative; }
  .step:last-child { padding-bottom: 0; }
  .step-rail { display: flex; flex-direction: column; align-items: center; }
  .step-num { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); color: #1c1200; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .step-line { width: 2px; flex: 1; background: var(--border); margin-top: 6px; }
  .step:last-child .step-line { display: none; }
  .step-card { display: grid; grid-template-columns: minmax(240px, 380px) 1fr; gap: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; align-items: start; }
  @media (max-width: 720px) { .step-card { grid-template-columns: 1fr; } }
  .step-card img { width: 100%; border-radius: 8px; border: 1px solid var(--border); display: block; }
  .step-title { font-weight: 650; font-size: 1.02rem; margin: 0 0 4px; }
  .step-desc { color: var(--text-muted); margin: 0 0 10px; font-size: 0.92rem; }
  .step-url { display: inline-block; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.78rem; color: var(--accent); background: var(--accent-soft); padding: 3px 8px; border-radius: 6px; }
  footer { color: var(--text-muted); font-size: 0.85rem; border-top: 1px solid var(--border); padding-top: 20px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>HiFly — Navigations- &amp; Flow-Analyse</h1>
    <p>Zwei Sichten auf dieselbe App: eine statische Karte aller Seiten und Übergänge aus dem Routing-Code, und ein echter, per Playwright durchgeklickter Ablauf mit frischen Screenshots jedes Schritts.</p>
    <div class="meta">
      <span class="tag">4 Seiten</span>
      <span class="tag">Auth.js + Middleware-Guards</span>
      <span class="tag">${steps.length} Schritte simuliert</span>
      <span class="tag">Generiert ${escapeHtml(generatedAt)}</span>
    </div>
  </header>

  <section id="map">
    <h2><span class="accent-dot"></span>Navigationskarte (aus dem Code)</h2>
    <p class="section-desc">Alle Seiten und die Bedingungen, unter denen man zwischen ihnen wechselt — abgeleitet aus <code>middleware.ts</code>, <code>auth.config.ts</code> und den Redirects/Links in den Seiten selbst. Von Hand gepflegt, zeigt mögliche Wege, keine echten Klicks.</p>
    <div class="diagram-scroll">
      <svg viewBox="0 0 820 700" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Navigationsdiagramm der HiFly-App">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" style="color: var(--text-muted)"/>
          </marker>
          <marker id="arrow-danger" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" style="color: var(--danger)"/>
          </marker>
        </defs>
        <rect class="node-box entry" x="250" y="16" width="220" height="44" rx="22"/>
        <text class="node-sub" x="360" y="43" text-anchor="middle">Anonymer Besucher</text>
        <path class="edge" d="M360,60 V96" marker-end="url(#arrow)"/>
        <rect class="node-box" x="250" y="100" width="220" height="66"/>
        <text class="node-path" x="270" y="128">/</text>
        <text class="node-label" x="270" y="150">HiFly Startseite</text>
        <path class="edge" d="M360,166 V234" marker-end="url(#arrow)"/>
        <text class="edge-label" x="366" y="204">Login-Icon (anonym)</text>
        <rect class="node-box" x="250" y="238" width="220" height="66"/>
        <text class="node-path" x="270" y="266">/login</text>
        <text class="node-label" x="270" y="288">Anmeldeformular</text>
        <path class="edge" d="M470,258 H 590 V 133 H 470" marker-end="url(#arrow)"/>
        <text class="edge-label" x="596" y="196" transform="rotate(90 596 196)" text-anchor="middle">Login erfolgreich · oder schon eingeloggt (Auto-Redirect)</text>
        <path class="edge" d="M250,133 H 150 V 431 H 250" marker-end="url(#arrow)"/>
        <text class="edge-label" x="144" y="290" transform="rotate(-90 144 290)" text-anchor="middle">Menü → Admin-Bereich (admin / super_admin)</text>
        <rect class="node-box" x="250" y="398" width="220" height="66"/>
        <text class="node-path" x="270" y="426">/admin</text>
        <text class="node-label" x="270" y="448">Admin-Bereich</text>
        <path class="edge" d="M360,464 V 556" marker-end="url(#arrow)"/>
        <text class="edge-label" x="366" y="512">Link → User-Rechte (super_admin)</text>
        <path class="edge" d="M250,150 H 70 V 622 H 250" marker-end="url(#arrow)"/>
        <text class="edge-label" x="64" y="400" transform="rotate(-90 64 400)" text-anchor="middle">Menü → User-Rechte direkt (super_admin)</text>
        <rect class="node-box" x="250" y="560" width="220" height="66"/>
        <text class="node-path" x="270" y="588">/admin/users</text>
        <text class="node-label" x="270" y="610">User-Rechte verwalten</text>
        <path class="edge" d="M470,420 H 500 V 133 H 470" marker-end="url(#arrow)"/>
        <text class="edge-label" x="506" y="290" transform="rotate(90 506 290)" text-anchor="middle">Brand-Mark / Konto-Menü → zurück</text>
        <rect class="guard-box" x="560" y="470" width="230" height="120"/>
        <text class="guard-title" x="576" y="494">Middleware-Guards</text>
        <text class="guard-text" x="576" y="516">nicht eingeloggt</text>
        <text class="guard-text" x="576" y="532">→ /login</text>
        <text class="guard-text" x="576" y="556">eingeloggt, falsche Rolle</text>
        <text class="guard-text" x="576" y="572">→ /?error=forbidden</text>
        <path class="edge danger" d="M470,431 H 560" marker-end="url(#arrow-danger)"/>
        <path class="edge danger" d="M470,593 H 520 V 530 H 560" marker-end="url(#arrow-danger)"/>
      </svg>
    </div>
  </section>

  <section id="walkthrough">
    <h2><span class="accent-dot"></span>Screenshot-Walkthrough (echter, simulierter Ablauf)</h2>
    <p class="section-desc">Gerade eben live durchgeklickt: Login, Navigation, eine echte Blockier-Aktion, Abmelden. Zeigt einen simulierten, keinen echten Besucher-Pfad.</p>
    <div class="steps">${stepsHtml}
    </div>
  </section>

  <footer>Generiert per scripts/generate-flow-screenshots.mjs gegen den lokalen Dev-Server, ${escapeHtml(generatedAt)}.</footer>
</div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
