import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser, getSuperAdminCredentials } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";

const adminEmail = "e2e-admin-units-admin@example.com";
const password = "e2e-test-password-123";

test.beforeAll(async () => {
  await createFixtureUser({ email: adminEmail, password, role: "admin" });
});

test.afterAll(async () => {
  await deleteFixtureUser(adminEmail);
});

test("ein plain admin wird von /admin/administrative-units weggeleitet", async ({ page }) => {
  await loginWithCredentials(page, adminEmail, password);
  await page.goto("/admin/administrative-units");
  await expect(page).toHaveURL(/\/\?error=forbidden/);
});

test("super_admin kann durch die Verwaltungsgliederung navigieren und eine Katastralgemeinde anlegen, bearbeiten und löschen", async ({
  page,
}) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.goto("/admin/administrative-units");

  // Der bestehende Klosterneuburg-Zweig wird beim Laden automatisch bis zum
  // ersten Blatt aufgeklappt (alphabetisch zuerst: Gugging).
  await expect(page.getByTestId("unit-breadcrumb-federal")).toContainText("Österreich");
  await expect(page.getByTestId("unit-breadcrumb-state")).toContainText("Niederösterreich");
  await expect(page.getByTestId("unit-breadcrumb-district")).toContainText("Tulln");
  await expect(page.getByTestId("unit-breadcrumb-municipality")).toContainText("Klosterneuburg");
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toBeVisible();

  // Neue Katastralgemeinde als Geschwister von der aktuell gewählten anlegen.
  await page.getByTestId("unit-breadcrumb-cadastral_municipality").click();
  await page.getByTestId("unit-create-sibling-cadastral_municipality").click();
  await page.getByTestId("unit-form-name").fill("E2E Testgemeinde");
  await page.getByTestId("unit-form-code").fill("9999");
  await page.getByTestId("unit-form-submit").click();
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText(
    "E2E Testgemeinde"
  );

  // Bearbeiten: Name ändern.
  await page.getByTestId("unit-breadcrumb-cadastral_municipality").click();
  await page.getByTestId(/^unit-edit-/).click();
  await page.getByTestId("unit-form-name").fill("E2E Testgemeinde (bearbeitet)");
  await page.getByTestId("unit-form-submit").click();
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText(
    "E2E Testgemeinde (bearbeitet)"
  );

  // Löschen (Cleanup) über den Bestätigungsdialog.
  await page.getByTestId("unit-breadcrumb-cadastral_municipality").click();
  await page.getByTestId(/^unit-delete-/).click();
  await expect(page.getByText("wirklich löschen?")).toBeVisible();
  await page.getByTestId("unit-confirm-delete").click();
  // Nach dem Löschen des aktuell gewählten Knotens bricht der Pfad an dieser
  // Stelle ab (kein automatisches Nachrücken auf ein Geschwister) — das
  // Segment verschwindet komplett.
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).not.toBeVisible();
});

test("Spalten-Ansicht zeigt Geschwister gleichzeitig und erlaubt Bearbeiten/Löschen nicht ausgewählter Zeilen", async ({
  page,
}) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.goto("/admin/administrative-units");
  await page.getByTestId("unit-view-toggle-columns").click();

  // Mehrere Katastralgemeinden gleichzeitig sichtbar, ohne ein Popup zu öffnen.
  await expect(page.locator('[data-testid^="unit-column-select-"]', { hasText: "Gugging" })).toBeVisible();
  await expect(page.locator('[data-testid^="unit-column-select-"]', { hasText: "Höflein" })).toBeVisible();
  await expect(page.locator('[data-testid^="unit-column-select-"]', { hasText: "Kierling" })).toBeVisible();

  // Zwei eigene Testeinträge über die Katastralgemeinde-Spalte anlegen —
  // bewusst KEINE echten Seed-Daten (z.B. Gugging) anfassen. Der zweite
  // wird danach automatisch ausgewählt (Standardpfad), der erste bleibt
  // eine nicht ausgewählte Zeile in derselben Spalte.
  const addColumnButton = page.locator('[data-testid^="unit-column-add-cadastral_municipality-"]');
  await addColumnButton.click();
  await page.getByTestId("unit-form-name").fill("E2E Spalten-Test A");
  await page.getByTestId("unit-form-code").fill("8888");
  await page.getByTestId("unit-form-submit").click();
  await expect(
    page.locator('[data-testid^="unit-column-select-"]', { hasText: "E2E Spalten-Test A" })
  ).toBeVisible();

  await addColumnButton.click();
  await page.getByTestId("unit-form-name").fill("E2E Spalten-Test B");
  await page.getByTestId("unit-form-code").fill("8889");
  await page.getByTestId("unit-form-submit").click();
  await expect(
    page.locator('[data-testid^="unit-column-select-"]', { hasText: "E2E Spalten-Test B" })
  ).toBeVisible();

  // "Test A" ist jetzt eine andere, NICHT ausgewählte Zeile in derselben
  // Spalte ("Test B" wurde zuletzt angelegt und ist damit ausgewählt) —
  // genau die soll jetzt bearbeitet und gelöscht werden, ohne sie vorher
  // anzuklicken.
  const testARow = page.locator('[data-testid^="unit-column-row-"]', { hasText: "E2E Spalten-Test A" });
  await testARow.getByTestId(/^unit-column-edit-/).click();
  await page.getByTestId("unit-form-name").fill("E2E Spalten-Test A (bearbeitet)");
  await page.getByTestId("unit-form-submit").click();
  await expect(
    page.locator('[data-testid^="unit-column-select-"]', { hasText: "E2E Spalten-Test A (bearbeitet)" })
  ).toBeVisible();
  // Die zuvor getroffene Auswahl (Test B) ist von der Bearbeitung einer
  // fremden Zeile unberührt geblieben.
  await expect(
    page.locator('[data-testid^="unit-column-select-"]', { hasText: "E2E Spalten-Test B" })
  ).toBeVisible();

  const editedRow = page.locator('[data-testid^="unit-column-row-"]', {
    hasText: "E2E Spalten-Test A (bearbeitet)",
  });
  await editedRow.getByTestId(/^unit-column-delete-/).click();
  await page.getByTestId("unit-confirm-delete").click();
  await expect(
    page.locator('[data-testid^="unit-column-select-"]', { hasText: "E2E Spalten-Test A" })
  ).not.toBeVisible();

  // Cleanup: den zweiten Testeintrag (aktuell ausgewählt) ebenfalls löschen.
  const testBRow = page.locator('[data-testid^="unit-column-row-"]', { hasText: "E2E Spalten-Test B" });
  await testBRow.getByTestId(/^unit-column-delete-/).click();
  await page.getByTestId("unit-confirm-delete").click();
  await expect(
    page.locator('[data-testid^="unit-column-select-"]', { hasText: "E2E Spalten-Test B" })
  ).not.toBeVisible();
});
