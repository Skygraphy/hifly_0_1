import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser, getSuperAdminCredentials } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";

const userEmail = "e2e-account-menu-user@example.com";
const password = "e2e-test-password-123";

test.beforeAll(async () => {
  await createFixtureUser({ email: userEmail, password, role: "user" });
});

test.afterAll(async () => {
  await deleteFixtureUser(userEmail);
});

test("anonymer Besucher sieht auf / ein Login-Icon statt eines Avatars", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("login-link")).toBeVisible();
  await expect(page.getByTestId("account-menu-trigger")).toHaveCount(0);
});

test("eingeloggter plain user sieht E-Mail, aber keine Admin-Links, im Menü", async ({ page }) => {
  await loginWithCredentials(page, userEmail, password);
  await page.getByTestId("account-menu-trigger").click();

  await expect(page.getByText(userEmail)).toBeVisible();
  await expect(page.getByTestId("account-menu-admin-link")).toHaveCount(0);
  await expect(page.getByTestId("account-menu-users-link")).toHaveCount(0);
  await expect(page.getByTestId("account-menu-sign-out")).toBeVisible();
});

test("Abmelden führt zurück zum anonymen Zustand auf /", async ({ page }) => {
  await loginWithCredentials(page, userEmail, password);
  await page.getByTestId("account-menu-trigger").click();
  await page.getByTestId("account-menu-sign-out").click();

  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByTestId("login-link")).toBeVisible();
});

test("super_admin kann über das Menü direkt zu /admin/users navigieren", async ({ page }) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.getByTestId("account-menu-trigger").click();
  await page.getByTestId("account-menu-users-link").click();

  await expect(page).toHaveURL(/\/admin\/users/);
  await expect(page.getByRole("heading", { name: "User-Rechte verwalten" })).toBeVisible();
});

test("super_admin kann über das Menü direkt zu /admin/administrative-units navigieren (Standorte & Regionen)", async ({
  page,
}) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.getByTestId("account-menu-trigger").click();
  await page.getByTestId("account-menu-administrative-units-link").click();

  await expect(page).toHaveURL(/\/admin\/administrative-units/);
  await expect(page.getByRole("heading", { name: "Standorte & Regionen" })).toBeVisible();
});
