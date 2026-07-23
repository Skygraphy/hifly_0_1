import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser, getSuperAdminCredentials } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";
import { getAdministrativeUnitIdByName } from "./fixtures/administrative-units";
import { getRegionIdByName } from "./fixtures/regions";

const userEmail = "e2e-deep-link-user@example.com";
const password = "e2e-test-password-123";

test.beforeAll(async () => {
  await createFixtureUser({ email: userEmail, password, role: "user" });
});

test.afterAll(async () => {
  await deleteFixtureUser(userEmail);
});

test("anonymer Besucher: /<id> übernimmt den Standort und landet auf / mit korrekter Breadcrumb", async ({
  page,
}) => {
  const unitId = await getAdministrativeUnitIdByName("Klosterneuburg Stadt");

  await page.goto(`/${unitId}`);
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText(
    "Klosterneuburg Stadt"
  );
});

test("eingeloggter Besucher: /<id> speichert serverseitig (DB), übersteht Aus-/Wieder-Einloggen", async ({
  page,
}) => {
  const unitId = await getAdministrativeUnitIdByName("Klosterneuburg Stadt");

  await loginWithCredentials(page, userEmail, password);
  await page.goto(`/${unitId}`);
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText(
    "Klosterneuburg Stadt"
  );

  await page.getByTestId("account-menu-trigger").click();
  await page.getByTestId("account-menu-sign-out").click();
  await expect(page.getByTestId("login-link")).toBeVisible();

  await loginWithCredentials(page, userEmail, password);
  await page.goto("/");
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText(
    "Klosterneuburg Stadt"
  );
});

test("ein Deep-Link überschreibt einen bereits gespeicherten Standort", async ({ page }) => {
  const tullnId = await getAdministrativeUnitIdByName("Tulln");
  const klosterneuburgStadtId = await getAdministrativeUnitIdByName("Klosterneuburg Stadt");

  await page.goto(`/${tullnId}`);
  await expect(page.getByTestId("unit-breadcrumb-district")).toContainText("Tulln");

  await page.goto(`/${klosterneuburgStadtId}`);
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText(
    "Klosterneuburg Stadt"
  );
});

test("Deep-Link zu einer Region-id übernimmt sie als Standort (kein Unit-Treffer, Fallback auf regions)", async ({
  page,
}) => {
  const regionId = await getRegionIdByName("Hohe Tauern");

  await page.goto(`/${regionId}`);
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByTestId("administrative-level-label")).toContainText("Hohe Tauern");
  // "Hohe Tauern" ist mit Bezirken unter mehreren Bundesländern verknüpft —
  // ihr niedrigster gemeinsamer Vorfahre ist "Österreich" (Bund-Ebene), sie
  // erscheint daher als eigenes Breadcrumb-Segment HINTER diesem einen
  // Vorfahren-Segment, nicht ohne jede Breadcrumb.
  await expect(page.getByTestId("unit-breadcrumb-federal")).toContainText("Österreich");
  await expect(page.locator('[data-testid^="region-breadcrumb-"]')).toContainText("Hohe Tauern");
});

test("ein Region-Deep-Link überschreibt einen zuvor gewählten Unit-Standort und umgekehrt", async ({ page }) => {
  const klosterneuburgStadtId = await getAdministrativeUnitIdByName("Klosterneuburg Stadt");
  const regionId = await getRegionIdByName("Wachau");

  await page.goto(`/${klosterneuburgStadtId}`);
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText("Klosterneuburg Stadt");

  await page.goto(`/${regionId}`);
  await expect(page.getByTestId("administrative-level-label")).toContainText("Wachau");
  // "Wachau" ist mit Bezirken unter Niederösterreich verknüpft — ihr
  // niedrigster gemeinsamer Vorfahre ist Niederösterreich, sie erscheint
  // daher hinter der Vorfahrenkette Österreich > Niederösterreich.
  await expect(page.getByTestId("unit-breadcrumb-federal")).toContainText("Österreich");
  await expect(page.getByTestId("unit-breadcrumb-state")).toContainText("Niederösterreich");
  await expect(page.locator('[data-testid^="region-breadcrumb-"]')).toContainText("Wachau");

  await page.goto(`/${klosterneuburgStadtId}`);
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText("Klosterneuburg Stadt");
});

test("syntaktisch ungültige id zeigt die 404-Seite", async ({ page }) => {
  await page.goto("/not-a-uuid");
  await expect(page.getByText("Seite nicht gefunden")).toBeVisible();
});

test("gültig formatierte, aber nicht existierende id zeigt die 404-Seite", async ({ page }) => {
  await page.goto("/00000000-0000-0000-0000-000000000000");
  await expect(page.getByText("Seite nicht gefunden")).toBeVisible();
});

test("Deep-Link zu einer nicht freigegebenen Region-id zeigt ebenfalls die 404-Seite", async ({ page, browser }) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.goto("/admin/administrative-units");
  await page.getByTestId("unit-view-toggle-columns").click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Salzburg" }).click();
  await page.locator('[data-testid^="unit-column-add-district-"]').click();
  await page.getByTestId(/^unit-column-add-region-district-/).click();
  await page.getByTestId("column-regions-new-name").fill("E2E Deep-Link Entwurf");
  await page.locator("label", { hasText: "Zell am See" }).locator('input[type="checkbox"]').check();
  // "Veröffentlicht" bleibt bewusst unangetastet — Entwurf ist der Default.
  await page.getByTestId("column-regions-submit").click();
  await expect(page.getByTestId("column-regions-submit")).not.toBeVisible();

  const regionId = await getRegionIdByName("E2E Deep-Link Entwurf");

  // Eigener, anonymer Context — der Deep-Link-Guard gilt unabhängig von der
  // Rolle des Besuchers.
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto(`/${regionId}`);
  await expect(anonPage.getByText("Seite nicht gefunden")).toBeVisible();
  await anonContext.close();

  // Cleanup.
  await page.reload();
  await page.getByTestId("unit-view-toggle-columns").click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Salzburg" }).click();
  const row = page.locator('[data-testid^="region-row-"]', { hasText: "E2E Deep-Link Entwurf" });
  await row.getByTestId(/^region-delete-/).click();
  await page.getByTestId("region-confirm-delete").click();
  await expect(row).not.toBeVisible();
});

test("Deep-Link zu einer nicht freigegebenen Verwaltungseinheit zeigt ebenfalls die 404-Seite", async ({
  page,
  browser,
}) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.goto("/admin/administrative-units");
  await page.getByTestId("unit-view-toggle-breadcrumb").click();
  await page.getByTestId("unit-breadcrumb-state").click();
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Niederösterreich" }).click();
  await page.getByTestId("unit-breadcrumb-district").click();
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Tulln" }).click();
  await page.getByTestId("unit-view-toggle-columns").click();

  await page.locator('[data-testid^="unit-column-add-cadastral_municipality-"]').click();
  await page.getByTestId(/^unit-column-add-unit-cadastral_municipality-/).click();
  await page.getByTestId("unit-form-name").fill("E2E Deep-Link Entwurf-Einheit");
  await page.getByTestId("unit-form-code").fill("9996");
  // "Veröffentlicht" bleibt bewusst unangetastet — Entwurf ist der Default.
  await page.getByTestId("unit-form-submit").click();
  const row = page.locator('[data-testid^="unit-column-row-"]', { hasText: "E2E Deep-Link Entwurf-Einheit" });
  await expect(row).toBeVisible();

  const unitId = await getAdministrativeUnitIdByName("E2E Deep-Link Entwurf-Einheit");

  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto(`/${unitId}`);
  await expect(anonPage.getByText("Seite nicht gefunden")).toBeVisible();
  await anonContext.close();

  // Cleanup.
  await row.getByTestId(/^unit-column-delete-/).click();
  await page.getByTestId("unit-confirm-delete").click();
  await expect(row).not.toBeVisible();
});

test("Deep-Link zu einer freigegebenen Einheit unter einem nicht freigegebenen Vorfahren zeigt ebenfalls die 404-Seite (Kaskade)", async ({
  page,
  browser,
}) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.goto("/admin/administrative-units");
  await page.getByTestId("unit-view-toggle-breadcrumb").click();
  await page.getByTestId("unit-breadcrumb-state").click();
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Niederösterreich" }).click();
  await page.getByTestId("unit-breadcrumb-district").click();
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Tulln" }).click();
  await page.getByTestId("unit-view-toggle-columns").click();

  // Nicht freigegebene Katastralgemeinde ...
  await page.locator('[data-testid^="unit-column-add-cadastral_municipality-"]').click();
  await page.getByTestId(/^unit-column-add-unit-cadastral_municipality-/).click();
  await page.getByTestId("unit-form-name").fill("E2E Deep-Link Entwurf-Vorfahre");
  await page.getByTestId("unit-form-code").fill("9995");
  await page.getByTestId("unit-form-submit").click();
  const parentRow = page.locator('[data-testid^="unit-column-row-"]', { hasText: "E2E Deep-Link Entwurf-Vorfahre" });
  await expect(parentRow).toBeVisible();

  // ... mit einem FREIGEGEBENEN Gebiet darunter. Spalte ist leer, "+ Neu
  // anlegen" ist daher ein direkter Button (kein 2-Punkte-Menü).
  await page
    .locator('[data-testid^="unit-column-select-"]', { hasText: "E2E Deep-Link Entwurf-Vorfahre" })
    .click();
  await page.locator('[data-testid^="unit-column-add-area-"]').click();
  await page.getByTestId("unit-form-name").fill("E2E Deep-Link Freigegebenes Kind");
  await page.getByTestId("unit-form-code").fill("Y");
  await page.getByTestId("unit-form-submit").click();
  const childRow = page.locator('[data-testid^="unit-column-row-"]', { hasText: "E2E Deep-Link Freigegebenes Kind" });
  await expect(childRow).toBeVisible();
  // Nach dem Anlegen (Entwurf-Default) über die Checkbox freigeben.
  const childPublishCheckbox = childRow.getByTestId(/^unit-column-published-/);
  await childPublishCheckbox.click();
  await expect(childPublishCheckbox).toBeChecked();

  const childId = await getAdministrativeUnitIdByName("E2E Deep-Link Freigegebenes Kind");

  // Direkter Deep-Link zum (selbst freigegebenen!) Kind — 404, weil der
  // Vorfahre nicht freigegeben ist.
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto(`/${childId}`);
  await expect(anonPage.getByText("Seite nicht gefunden")).toBeVisible();
  await anonContext.close();

  // Cleanup (Löschen der Katastralgemeinde nimmt das Gebiet per ON DELETE
  // CASCADE mit).
  await parentRow.getByTestId(/^unit-column-delete-/).click();
  await page.getByTestId("unit-confirm-delete").click();
  await expect(parentRow).not.toBeVisible();
});

test("bestehende statische Route /login wird vom neuen dynamischen Segment nicht verschluckt", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Anmelden", exact: true })).toBeVisible();
});
