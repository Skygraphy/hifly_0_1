import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser, getSuperAdminCredentials } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";

const targetEmail = "e2e-block-user@example.com";
const password = "e2e-test-password-123";

test.beforeAll(async () => {
  await createFixtureUser({ email: targetEmail, password, role: "user" });
});

test.afterAll(async () => {
  await deleteFixtureUser(targetEmail);
});

test("super_admin kann einen User blockieren, blockierter Login schlägt fehl, entsperren stellt Login wieder her", async ({ page, browser }) => {
  const { email: superAdminEmail, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, superAdminEmail, superAdminPassword);
  await page.goto("/admin/users");

  const row = page.locator("tr", { hasText: targetEmail });
  await expect(row.getByText("aktiv", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "blockieren" }).click();
  await expect(row.getByText("gesperrt", { exact: true })).toBeVisible();

  // Eigener, von der super_admin-Session isolierter Browser-Context — sonst
  // teilt eine neue Page im selben Context die Session-Cookies und /login
  // leitet wegen "schon eingeloggt" sofort weiter, statt das Formular zu zeigen.
  const blockedContext = await browser.newContext();
  const blockedPage = await blockedContext.newPage();
  await loginWithCredentials(blockedPage, targetEmail, password);
  await expect(blockedPage.getByTestId("login-error")).toBeVisible();
  await expect(blockedPage).toHaveURL(/\/login/);
  await blockedContext.close();

  await row.getByRole("button", { name: "entsperren" }).click();
  await expect(row.getByText("aktiv", { exact: true })).toBeVisible();

  // Entsperrter User kann sich wieder einloggen.
  const unblockedContext = await browser.newContext();
  const unblockedPage = await unblockedContext.newPage();
  await loginWithCredentials(unblockedPage, targetEmail, password);
  await expect(unblockedPage).toHaveURL("http://localhost:3000/");
  await unblockedContext.close();
});
