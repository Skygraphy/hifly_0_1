import type { Page } from "@playwright/test";

export async function registerWithCredentials(
  page: Page,
  options: { name?: string; email: string; password: string; confirmPassword?: string }
) {
  await page.goto("/register");
  if (options.name) {
    await page.getByLabel("Name").fill(options.name);
  }
  await page.getByLabel("E-Mail").fill(options.email);
  await page.getByLabel("Passwort", { exact: true }).fill(options.password);
  await page.getByLabel("Passwort bestätigen").fill(options.confirmPassword ?? options.password);
  await page.getByRole("button", { name: "Registrieren", exact: true }).click();
  // Gleiches Race-Pattern wie loginWithCredentials: auf das tatsächliche
  // Submit-Ergebnis warten, bevor der Aufrufer weiternavigiert.
  await Promise.race([
    page.waitForURL((url) => url.pathname === "/"),
    page.getByTestId("register-error").waitFor({ state: "visible" }),
  ]);
}
