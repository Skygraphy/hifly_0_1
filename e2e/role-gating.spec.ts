import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser, getSuperAdminCredentials } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";

const userEmail = "e2e-role-user@example.com";
const adminEmail = "e2e-role-admin@example.com";
const password = "e2e-test-password-123";

test.beforeAll(async () => {
  await createFixtureUser({ email: userEmail, password, role: "user" });
  await createFixtureUser({ email: adminEmail, password, role: "admin" });
});

test.afterAll(async () => {
  await deleteFixtureUser(userEmail);
  await deleteFixtureUser(adminEmail);
});

test("plain user wird von /admin weggeleitet", async ({ page }) => {
  await loginWithCredentials(page, userEmail, password);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("admin darf /admin sehen, aber nicht /admin/users", async ({ page }) => {
  await loginWithCredentials(page, adminEmail, password);
  await page.goto("/admin");
  await expect(page.getByText("Admin-Bereich")).toBeVisible();

  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("super_admin darf /admin/users sehen", async ({ page }) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.goto("/admin/users");
  await expect(page.getByText("User-Rechte verwalten")).toBeVisible();
});
