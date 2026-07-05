import { chromium, request } from "@playwright/test";

/**
 * Next.js kompiliert Routen im Dev-Server on-demand beim ersten Treffer.
 * Der POST-Pfad von /api/auth/callback/credentials (next-auth + Drizzle-
 * Adapter + pg + bcryptjs + jose) ist dabei besonders schwer und hat in der
 * Praxis dazu geführt, dass ausgerechnet der allererste Login-Versuch in
 * einem frischen Testlauf fehlschlug — ein reines GET-Warmup auf /api/auth/
 * session reicht nicht, weil das ein anderer Codepfad ist. Deshalb hier
 * einmal einen echten (bewusst falschen) Login-Versuch über die UI
 * durchspielen, bevor die eigentlichen Tests starten.
 */
export default async function globalSetup() {
  const baseURL = "http://localhost:3000";

  const context = await request.newContext({ baseURL });
  for (const path of ["/login", "/dashboard", "/admin", "/admin/users"]) {
    await context.get(path).catch(() => {});
  }
  await context.dispose();

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill("warmup@example.com");
  await page.getByLabel("Passwort").fill("warmup-password");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByTestId("login-error").waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  await browser.close();
}
