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

  // Der Standardpfad beim Laden klappt automatisch bis zum ersten Blatt auf
  // (alphabetisch je Ebene) — inzwischen gibt es mehrere Bundesländer/
  // Bezirke (für die Regionen-Beispiele Hohe Tauern/Wachau), daher explizit
  // zum Klosterneuburg-Zweig navigieren statt den Default-Pfad anzunehmen.
  await expect(page.getByTestId("unit-breadcrumb-federal")).toContainText("Österreich");
  await page.getByTestId("unit-breadcrumb-state").click();
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Niederösterreich" }).click();
  await page.getByTestId("unit-breadcrumb-district").click();
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Tulln" }).click();

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

  // Explizit zum Klosterneuburg-Zweig navigieren statt den (jetzt durch
  // mehrere Bundesländer/Bezirke beeinflussten) Default-Pfad anzunehmen.
  await page.getByTestId("unit-breadcrumb-state").click();
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Niederösterreich" }).click();
  await page.getByTestId("unit-breadcrumb-district").click();
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Tulln" }).click();

  await page.getByTestId("unit-view-toggle-columns").click();

  // Mehrere Katastralgemeinden gleichzeitig sichtbar, ohne ein Popup zu öffnen.
  await expect(page.locator('[data-testid^="unit-column-select-"]', { hasText: "Gugging" })).toBeVisible();
  await expect(page.locator('[data-testid^="unit-column-select-"]', { hasText: "Höflein" })).toBeVisible();
  await expect(page.locator('[data-testid^="unit-column-select-"]', { hasText: "Kierling" })).toBeVisible();

  // Zwei eigene Testeinträge über die Katastralgemeinde-Spalte anlegen —
  // bewusst KEINE echten Seed-Daten (z.B. Gugging) anfassen. Der zweite
  // wird danach automatisch ausgewählt (Standardpfad), der erste bleibt
  // eine nicht ausgewählte Zeile in derselben Spalte.
  // Der "+ Neu anlegen"-Button ist jetzt ein 2-Punkte-Menü ("Katastralgemeinde"
  // / "Region") statt eines Direkt-Klicks — siehe unit-column-add-unit-*.
  const addColumnButton = page.locator('[data-testid^="unit-column-add-cadastral_municipality-"]');
  await addColumnButton.click();
  await page.getByTestId(/^unit-column-add-unit-cadastral_municipality-/).click();
  await page.getByTestId("unit-form-name").fill("E2E Spalten-Test A");
  await page.getByTestId("unit-form-code").fill("8888");
  await page.getByTestId("unit-form-submit").click();
  await expect(
    page.locator('[data-testid^="unit-column-select-"]', { hasText: "E2E Spalten-Test A" })
  ).toBeVisible();

  await addColumnButton.click();
  await page.getByTestId(/^unit-column-add-unit-cadastral_municipality-/).click();
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

test("eine Region kann nie auf null Verknüpfungen gebracht werden — Speichern ist deaktiviert, sobald das letzte Häkchen entfernt würde", async ({
  page,
}) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.goto("/admin/administrative-units");
  await page.getByTestId("unit-view-toggle-columns").click();

  // Anlegen mit genau einer Verknüpfung ("Zell am See", die einzige Einheit
  // dieser Spalte) — bleibt dauerhaft an dieser Anlage-Spalte sichtbar.
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Salzburg" }).click();
  await page.locator('[data-testid^="unit-column-add-district-"]').click();
  await page.getByTestId(/^unit-column-add-region-district-/).click();
  await page.getByTestId("column-regions-new-name").fill("E2E Testregion");
  await page.getByTestId("column-regions-new-description").fill("E2E Beschreibung");
  await page.getByTestId("column-regions-new-color").fill("#d9603f");
  await page.locator("label", { hasText: "Zell am See" }).locator('input[type="checkbox"]').check();
  await page.getByTestId("column-regions-submit").click();
  await expect(page.getByTestId("column-regions-submit")).not.toBeVisible();

  await page.reload();
  await page.getByTestId("unit-view-toggle-columns").click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Salzburg" }).click();
  const row = page.locator('[data-testid^="region-row-"]', { hasText: "E2E Testregion" });
  await expect(row).toBeVisible();

  // Beschreibung und Farbe wurden bei der Neuanlage tatsächlich gespeichert
  // (nicht nur der Name).
  await row.getByTestId(/^region-edit-/).click();
  await expect(page.getByTestId("region-form-description")).toHaveValue("E2E Beschreibung");
  await expect(page.getByTestId("region-form-color")).toHaveValue("#d9603f");

  // Das letzte (einzige) Häkchen entfernen → "Speichern" wird deaktiviert,
  // ein Hinweistext erklärt warum. Die Region hat hier keine weitere
  // Verknüpfung außerhalb dieser Spalte, ein Speichern würde sie also
  // vollständig verwaisen lassen — genau das ist per Definition ausgeschlossen.
  await page.locator("label", { hasText: "Zell am See" }).locator('input[type="checkbox"]').uncheck();
  await expect(page.getByTestId("region-form-submit")).toBeDisabled();
  await expect(page.getByTestId("region-form-no-links-hint")).toBeVisible();

  // Stattdessen umbenennen (mit dem Häkchen wieder gesetzt) und speichern.
  await page.locator("label", { hasText: "Zell am See" }).locator('input[type="checkbox"]').check();
  await page.getByTestId("region-form-name").fill("E2E Testregion (bearbeitet)");
  await expect(page.getByTestId("region-form-submit")).toBeEnabled();
  await page.getByTestId("region-form-submit").click();
  await expect(page.getByTestId("region-form-submit")).not.toBeVisible();

  await page.reload();
  await page.getByTestId("unit-view-toggle-columns").click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Salzburg" }).click();
  const renamedRow = page.locator('[data-testid^="region-row-"]', { hasText: "E2E Testregion (bearbeitet)" });
  await expect(renamedRow).toBeVisible();

  // Löschen (Cleanup) — anders als Entknüpfen ist vollständiges Löschen
  // natürlich weiterhin erlaubt.
  await renamedRow.getByTestId(/^region-delete-/).click();
  await expect(page.getByText("wirklich löschen?")).toBeVisible();
  await page.getByTestId("region-confirm-delete").click();
  await expect(renamedRow).not.toBeVisible();
});

test("eine Region kann bei der Neuanlage mit mehreren Geschwister-Einheiten derselben Spalte auf einmal verknüpft werden (z.B. mehrere Bundesländer)", async ({
  page,
}) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.goto("/admin/administrative-units");
  await page.getByTestId("unit-view-toggle-columns").click();

  // Eine Region, die mehrere Bundesländer umfassen soll, wird direkt auf
  // Bundesland-Ebene angelegt — dort sind alle Bundesländer Kandidaten
  // derselben Spalte und lassen sich in einem Schritt anhaken (kein
  // nachträgliches Verknüpfen über mehrere Äste hinweg nötig).
  await page.locator('[data-testid^="unit-column-add-state-"]').click();
  await page.getByTestId(/^unit-column-add-region-state-/).click();
  await page.getByTestId("column-regions-new-name").fill("E2E Mehrere Bundesländer");
  await page.locator("label", { hasText: "Kärnten" }).locator('input[type="checkbox"]').check();
  await page.locator("label", { hasText: "Salzburg" }).locator('input[type="checkbox"]').check();
  await page.getByTestId("column-regions-submit").click();
  await expect(page.getByTestId("column-regions-submit")).not.toBeVisible();

  await page.reload();
  await page.getByTestId("unit-view-toggle-columns").click();
  const row = page.locator('[data-testid^="region-row-"]', { hasText: "E2E Mehrere Bundesländer" });
  await expect(row).toBeVisible();

  // Cleanup.
  await row.getByTestId(/^region-delete-/).click();
  await page.getByTestId("region-confirm-delete").click();
  await expect(row).not.toBeVisible();
});

test("Neu-anlegen in der Breadcrumb-Ansicht bietet ebenfalls eine 'Region'-Option an", async ({ page }) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.goto("/admin/administrative-units");

  await page.getByTestId("unit-breadcrumb-state").click();
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Salzburg" }).click();
  await page.getByTestId("unit-breadcrumb-state").click();
  await page.getByTestId("unit-create-region-state").click();
  await page.getByTestId("column-regions-new-name").fill("E2E Breadcrumb-Testregion");
  await page.locator("label", { hasText: "Salzburg" }).locator('input[type="checkbox"]').check();
  await page.getByTestId("column-regions-submit").click();
  await expect(page.getByTestId("column-regions-submit")).not.toBeVisible();

  // Cleanup über die Spalten-Ansicht (Gegend-Zeile in der Bundesland-Spalte,
  // da "Salzburg" — ein Kind von Österreich — die einzige verknüpfte Einheit
  // ist; die Bundesland-Spalte ist Teil des Default-Pfads beim Laden).
  await page.reload();
  await page.getByTestId("unit-view-toggle-columns").click();
  const row = page.locator('[data-testid^="region-row-"]', { hasText: "E2E Breadcrumb-Testregion" });
  await expect(row).toBeVisible();
  await row.getByTestId(/^region-delete-/).click();
  await page.getByTestId("region-confirm-delete").click();
  await expect(row).not.toBeVisible();
});

test("+ Neu anlegen zeigt bei der Region-Option keine bestehenden Regionen zur Auswahl (reine Neuanlage)", async ({
  page,
}) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.goto("/admin/administrative-units");
  await page.getByTestId("unit-view-toggle-columns").click();

  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Salzburg" }).click();
  await page.locator('[data-testid^="unit-column-add-district-"]').click();
  await page.getByTestId(/^unit-column-add-region-district-/).click();

  // Keine Liste/Auswahl bestehender Regionen (z.B. "Hohe Tauern", bereits
  // geseedet und in der Bundesland-Spalte im Hintergrund sichtbar) — INNERHALB
  // des Dialogs nur ein Namensfeld für die Neuanlage.
  const dialog = page.getByTestId("column-regions-dialog");
  await expect(dialog.getByText("Hohe Tauern")).toHaveCount(0);
  await expect(page.getByTestId("column-regions-new-name")).toBeVisible();
  await page.getByRole("button", { name: "Abbrechen" }).click();
});

test("Region-Bearbeiten-Dialog zeigt die tatsächlichen Verknüpfungen als angehakte Checkboxen an, wenn sie auf derselben Ebene wie die Anlage-Spalte liegen", async ({
  page,
}) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.goto("/admin/administrative-units");
  await page.getByTestId("unit-view-toggle-columns").click();

  // "Hohe Tauern" ist auf Bundesland-Ebene angelegt UND direkt mit den
  // Bundesländern Salzburg/Tirol/Kärnten selbst verknüpft (nicht mit
  // einzelnen Bezirken darunter) — die Checkboxen zeigen den tatsächlichen
  // Zustand deshalb direkt an, ohne dass man auf die Verknüpfungs-Übersicht
  // angewiesen wäre.
  const regionRow = page.locator('[data-testid^="region-row-"]', { hasText: "Hohe Tauern" });
  await regionRow.getByTestId(/^region-edit-/).click();

  for (const bundesland of ["Kärnten", "Salzburg", "Tirol"]) {
    await expect(page.locator("label", { hasText: bundesland }).locator('input[type="checkbox"]')).toBeChecked();
  }
  for (const bundesland of ["Niederösterreich", "Oberösterreich"]) {
    await expect(
      page.locator("label", { hasText: bundesland }).locator('input[type="checkbox"]')
    ).not.toBeChecked();
  }

  const summary = page.getByTestId("column-regions-current-links");
  await expect(summary).toContainText("Kärnten");
  await expect(summary).toContainText("Salzburg");
  await expect(summary).toContainText("Tirol");

  await page.getByRole("button", { name: "Abbrechen" }).click();
});

test("+ Neu anlegen verlangt mindestens eine Verknüpfung — Anlegen ist ohne Häkchen deaktiviert", async ({ page }) => {
  const { email, password: superAdminPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superAdminPassword);
  await page.goto("/admin/administrative-units");
  await page.getByTestId("unit-view-toggle-columns").click();

  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Salzburg" }).click();
  await page.locator('[data-testid^="unit-column-add-district-"]').click();
  await page.getByTestId(/^unit-column-add-region-district-/).click();
  await page.getByTestId("column-regions-new-name").fill("E2E Testregion Pflichtverknüpfung");
  await expect(page.getByTestId("column-regions-submit")).toBeDisabled();
  await expect(page.getByTestId("column-regions-no-links-hint")).toBeVisible();

  await page.locator("label", { hasText: "Zell am See" }).locator('input[type="checkbox"]').check();
  await expect(page.getByTestId("column-regions-submit")).toBeEnabled();
  await page.getByTestId("column-regions-submit").click();
  await expect(page.getByTestId("column-regions-submit")).not.toBeVisible();

  await page.reload();
  await page.getByTestId("unit-view-toggle-columns").click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Salzburg" }).click();
  const row = page.locator('[data-testid^="region-row-"]', { hasText: "E2E Testregion Pflichtverknüpfung" });
  await expect(row).toBeVisible();

  // Cleanup.
  await row.getByTestId(/^region-delete-/).click();
  await page.getByTestId("region-confirm-delete").click();
  await expect(row).not.toBeVisible();
});
