import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser, getSuperAdminCredentials } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";
import { deleteAppSetting } from "./fixtures/settings";

const userEmail = "e2e-settings-user@example.com";
const password = "e2e-test-password-123";

test.beforeAll(async () => {
  await createFixtureUser({ email: userEmail, password, role: "user" });
});

test.afterAll(async () => {
  await deleteFixtureUser(userEmail);
  await deleteAppSetting("maintenance_mode");
});

test("Gast schaltet Theme um, Wert übersteht Reload, und wird beim Login ins Konto übernommen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByTestId("display-settings-trigger").click();
  await page.getByTestId("display-settings-theme-light").click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  // Reload-Persistenz: Cookie + localStorage müssen den Wert ohne Flackern
  // erhalten, ganz ohne eingeloggt zu sein.
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await loginWithCredentials(page, userEmail, password);

  // Der Sync läuft fire-and-forget im Hintergrund (useEffect nach dem
  // Login) — auf den Marker warten, statt sofort wegzunavigieren, sonst
  // kann die Navigation den laufenden Server-Action-Request abbrechen.
  await page.waitForFunction(() => localStorage.getItem("hifly_guest_settings_synced") === "1");

  // Erster Login: die lokale Gast-Einstellung wird automatisch als
  // Konto-Einstellung übernommen (rein additiv, siehe syncGuestSettingsOnLogin).
  await page.goto("/settings");
  await expect(page.getByTestId("setting-theme")).toContainText("Hell");
});

test("Theme-Auswahl auf /settings wirkt sofort, ohne Reload", async ({ page }) => {
  await loginWithCredentials(page, userEmail, password);
  await page.goto("/settings");

  await page.getByTestId("setting-theme").click();
  await page.getByTestId("setting-theme-option-light").click();
  await expect(page.getByTestId("setting-theme")).toContainText("Hell");
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  // Auch der Header-Umschalter muss den neuen Wert sofort widerspiegeln —
  // ausgewählte Menüeinträge zeigen ein Check-Icon als Kind, es gibt kein
  // "checked"-Attribut auf einem DropdownMenuItem selbst.
  await expect(page.getByTestId("display-settings-trigger")).toBeVisible();
  await page.getByTestId("display-settings-trigger").click();
  await expect(page.getByTestId("display-settings-theme-light").locator("svg.lucide-check")).toBeVisible();
});

test("Theme 'System' folgt der OS-Präferenz, auch live bei Änderung", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/); // Default vor der Wahl, unabhängig vom OS.

  await page.getByTestId("display-settings-trigger").click();
  await page.getByTestId("display-settings-theme-system").click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  // Reload-Persistenz: "system" bleibt gespeichert und löst weiterhin per OS auf.
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  // Live-Reaktion auf einen OS-Theme-Wechsel, ohne Reload.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("super_admin aktiviert den Wartungsmodus: abgemeldete Besucher sehen den vollen Wartungsbildschirm, der super_admin selbst weiterhin die normale Startseite mit Reminder-Banner", async ({
  page,
  browser,
}) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);

  await page.goto("/admin/settings");
  await page.getByTestId("app-setting-maintenance_mode").click();
  await expect(page.getByTestId("app-setting-maintenance_mode")).toHaveAttribute("data-checked", "");
  // "data-checked" ist nur der optimistische Client-State — erst wenn das
  // Pending (disabled) wieder weg ist, ist die Server Action (DB-Write)
  // tatsächlich durchgelaufen. Sonst race't der anon-Check unten gegen den
  // noch laufenden Request.
  await expect(page.getByTestId("app-setting-maintenance_mode")).not.toHaveAttribute("data-disabled", "");

  // super_admin bleibt trotz aktivem Wartungsmodus auf der normalen
  // Startseite mit kleinem Reminder-Banner, statt selbst ausgesperrt zu sein.
  await page.goto("/");
  await expect(page.getByTestId("maintenance-banner")).toBeVisible();
  await expect(page.getByTestId("maintenance-screen")).not.toBeVisible();

  // Eigener, unangemeldeter Context — die globale Einstellung muss auch
  // ohne Session sichtbar sein (getGlobalSettings hat keinen Auth-Check).
  // Statt eines Hinweis-Banners sehen abgemeldete Besucher den vollen
  // Wartungsbildschirm anstelle der Startseite.
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto("/");
  await expect(anonPage.getByTestId("maintenance-screen")).toBeVisible();
  await expect(anonPage.getByRole("heading", { name: "Wartungsarbeiten" })).toBeVisible();
  // Login-Escape-Hatch bleibt erhalten, damit ein noch nicht eingeloggter
  // Admin den Modus umgehen kann.
  await expect(anonPage.getByTestId("login-link")).toBeVisible();
  await anonContext.close();
});

test("ein normaler User wird von /admin/settings weggeleitet", async ({ page }) => {
  await loginWithCredentials(page, userEmail, password);
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/\?error=forbidden/);
});
