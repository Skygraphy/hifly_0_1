import type { Page } from "@playwright/test";

export async function loginWithCredentials(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  // Wartet auf das tatsächliche Ergebnis des Submits (Erfolg ODER Fehler),
  // bevor der Aufrufer weiternavigiert — sonst race't ein direkt folgendes
  // page.goto() gegen die noch laufende Server Action/Navigation.
  await Promise.race([
    page.waitForURL((url) => url.pathname === "/"),
    page.getByTestId("login-error").waitFor({ state: "visible" }),
  ]);
}
