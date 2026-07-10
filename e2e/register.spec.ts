import { test, expect } from "@playwright/test";
import { deleteFixtureUser, createFixtureUser } from "./fixtures/users";
import { registerWithCredentials } from "./fixtures/register";

const newUserEmail = "e2e-register-new@example.com";
const existingUserEmail = "e2e-register-existing@example.com";
const password = "e2e-test-password-123";

test.afterAll(async () => {
  await deleteFixtureUser(newUserEmail);
  await deleteFixtureUser(existingUserEmail);
});

test("neuer User registriert sich, landet eingeloggt auf der Startseite und hat nur die Rolle user", async ({
  page,
}) => {
  await registerWithCredentials(page, { name: "Neuer User", email: newUserEmail, password });
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByTestId("account-menu-trigger")).toBeVisible();
  await expect(page.getByTestId("login-link")).not.toBeVisible();

  // Selbstregistrierung darf nie mehr als "user" vergeben — /admin bleibt gesperrt.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/\?error=forbidden/);
});

test("Registrierung mit bereits vergebener E-Mail zeigt eine Fehlermeldung", async ({ page }) => {
  await createFixtureUser({ email: existingUserEmail, password, role: "user" });

  await registerWithCredentials(page, { email: existingUserEmail, password: "another-password-123" });

  await expect(page.getByTestId("register-error")).toBeVisible();
  await expect(page.getByTestId("register-error")).toHaveText("Diese E-Mail ist bereits registriert.");
  await expect(page).toHaveURL(/\/register/);
});
