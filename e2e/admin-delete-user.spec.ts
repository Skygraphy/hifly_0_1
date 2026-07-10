import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser, getSuperAdminCredentials } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";

const targetEmail = "e2e-delete-user@example.com";
const password = "e2e-test-password-123";

test.beforeEach(async () => {
  await createFixtureUser({ email: targetEmail, password, role: "user" });
});

test.afterAll(async () => {
  await deleteFixtureUser(targetEmail);
});

test("Abbrechen im Bestätigungsdialog löscht nichts", async ({ page }) => {
  const { email: superAdminEmail, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, superAdminEmail, superAdminPassword);
  await page.goto("/admin/users");

  const row = page.locator("tr", { hasText: targetEmail });
  await row.getByRole("button", { name: "löschen" }).click();

  await expect(page.getByText("Account wirklich löschen?")).toBeVisible();
  await page.getByRole("button", { name: "Abbrechen" }).click();

  await expect(page.getByText("Account wirklich löschen?")).not.toBeVisible();
  await expect(row).toBeVisible();
});

test("super_admin kann einen User über den Bestätigungsdialog endgültig löschen", async ({ page }) => {
  const { email: superAdminEmail, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, superAdminEmail, superAdminPassword);
  await page.goto("/admin/users");

  const row = page.locator("tr", { hasText: targetEmail });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "löschen" }).click();

  await expect(page.getByText("Account wirklich löschen?")).toBeVisible();
  await page.getByTestId("confirm-delete-user").click();

  await expect(page.locator("tr", { hasText: targetEmail })).not.toBeVisible();

  // Gelöschter Account kann sich nicht mehr einloggen.
  await page.context().clearCookies();
  await loginWithCredentials(page, targetEmail, password);
  await expect(page.getByTestId("login-error")).toBeVisible();
});
