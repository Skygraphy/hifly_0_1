import { test, expect } from "@playwright/test";

test("zeigt die spezifische Meldung für den super_admin-OAuth-Block", async ({ page }) => {
  await page.goto("/login?error=SuperAdminOAuthDisabled");
  await expect(page.getByTestId("oauth-error")).toHaveText(
    "Der super_admin-Account kann sich aus Sicherheitsgründen nur per Passwort anmelden."
  );
});

test("zeigt eine generische Meldung für unbekannte Auth.js-Fehlercodes", async ({ page }) => {
  await page.goto("/login?error=SomeUnknownErrorCode");
  await expect(page.getByTestId("oauth-error")).toHaveText(
    "Anmeldung fehlgeschlagen. Bitte versuche es erneut."
  );
});

test("zeigt keine Fehlermeldung ohne error-Parameter", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("oauth-error")).toHaveCount(0);
});
