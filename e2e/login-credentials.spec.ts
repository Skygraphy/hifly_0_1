import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";

const email = "e2e-login-user@example.com";
const password = "e2e-test-password-123";

test.beforeAll(async () => {
  await createFixtureUser({ email, password, role: "user" });
});

test.afterAll(async () => {
  await deleteFixtureUser(email);
});

test("nicht eingeloggter Zugriff auf /dashboard wird zu /login umgeleitet", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("Login mit falschem Passwort zeigt eine Fehlermeldung", async ({ page }) => {
  await loginWithCredentials(page, email, "falsches-passwort");
  await expect(page.getByTestId("login-error")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("Login mit korrekten Credentials führt zum Dashboard", async ({ page }) => {
  await loginWithCredentials(page, email, password);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(email)).toBeVisible();
});
