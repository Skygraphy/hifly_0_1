import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser, getSuperAdminCredentials } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";
import { deleteAppSetting } from "./fixtures/settings";

const userEmail = "e2e-setting-permission-user@example.com";
const password = "e2e-test-password-123";

test.beforeAll(async () => {
  await createFixtureUser({ email: userEmail, password, role: "user" });
});

test.afterAll(async () => {
  await deleteFixtureUser(userEmail);
  await deleteAppSetting("personal_setting_permissions");
});

test("super_admin senkt die Berechtigung von show_debug_info auf user, wodurch ein plain user sie sehen und setzen kann", async ({
  page,
  browser,
}) => {
  const { email: superAdminEmail, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, superAdminEmail, superAdminPassword);
  await page.goto("/admin/settings");

  await page.getByTestId("setting-permission-show_debug_info").click();
  await page.getByTestId("setting-permission-show_debug_info-option-user").click();
  await expect(page.getByTestId("setting-permission-show_debug_info")).toContainText("User");
  // Das Label aktualisiert sich optimistisch, bevor die Server Action (DB-
  // Write) durchgelaufen ist — erst wenn "disabled" (Pending) wieder weg
  // ist, ist der neue Wert tatsächlich gespeichert. Sonst race't der
  // Sichtbarkeits-Check in der zweiten Session unten gegen den noch
  // laufenden Request.
  await expect(page.getByTestId("setting-permission-show_debug_info")).not.toBeDisabled();

  // Eigener, von der super_admin-Session isolierter Context, damit /settings
  // die Sicht des plain user zeigt.
  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await loginWithCredentials(userPage, userEmail, password);
  await userPage.goto("/settings");

  await expect(userPage.getByTestId("setting-show_debug_info")).toBeVisible();
  await userPage.getByTestId("setting-show_debug_info").click();
  await expect(userPage.getByTestId("setting-show_debug_info")).toHaveAttribute("data-checked", "");

  await userContext.close();
});

test("super_admin hebt die Berechtigung von theme auf admin an, wodurch ein plain user sie nicht mehr sieht", async ({
  page,
  browser,
}) => {
  const { email: superAdminEmail, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, superAdminEmail, superAdminPassword);
  await page.goto("/admin/settings");

  await page.getByTestId("setting-permission-theme").click();
  await page.getByTestId("setting-permission-theme-option-admin").click();
  await expect(page.getByTestId("setting-permission-theme")).toContainText("Admin");
  await expect(page.getByTestId("setting-permission-theme")).not.toBeDisabled();

  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await loginWithCredentials(userPage, userEmail, password);
  await userPage.goto("/settings");

  await expect(userPage.getByTestId("setting-theme")).not.toBeVisible();

  await userContext.close();
});
