import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser, getSuperAdminCredentials } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";

const targetEmail = "e2e-grant-revoke-user@example.com";
const password = "e2e-test-password-123";

test.beforeAll(async () => {
  await createFixtureUser({ email: targetEmail, password, role: "user" });
});

test.afterAll(async () => {
  await deleteFixtureUser(targetEmail);
});

test("super_admin kann einem User admin-Rechte geben und wieder entziehen", async ({ page }) => {
  const { email: superAdminEmail, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, superAdminEmail, superAdminPassword);
  await page.goto("/admin/users");

  const row = page.locator("tr", { hasText: targetEmail });
  await expect(row.getByText("user", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "zu admin machen" }).click();
  await expect(row.getByText("admin", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "admin entziehen" }).click();
  await expect(row.getByText("user", { exact: true })).toBeVisible();
});
