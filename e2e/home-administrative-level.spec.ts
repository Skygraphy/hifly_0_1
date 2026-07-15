import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";

const userEmail = "e2e-home-admin-level-user@example.com";
const password = "e2e-test-password-123";

test.beforeAll(async () => {
  await createFixtureUser({ email: userEmail, password, role: "user" });
});

test.afterAll(async () => {
  await deleteFixtureUser(userEmail);
});

test("frischer anonymer Besuch zeigt den Spalten-Picker statt der Breadcrumb-Ansicht", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Wähle deinen Standort")).toBeVisible();
  await expect(page.locator('[data-testid^="unit-column-select-"]', { hasText: "Österreich" })).toBeVisible();
  await expect(page.locator('[data-testid^="unit-breadcrumb-"]')).toHaveCount(0);
});

test("Auswahl über mehrere Spalten hinweg bleibt im Picker, Reload zeigt danach die Breadcrumb-Ansicht", async ({
  page,
}) => {
  await page.goto("/");

  // Durch mehrere Spalten klicken — nach jedem Klick bleibt die
  // Spalten-Ansicht sichtbar (kein Umschalten auf Breadcrumb innerhalb
  // desselben Besuchs), erst ein Reload zeigt die Breadcrumb-Ansicht.
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Österreich" }).click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Niederösterreich" }).click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Tulln" }).click();
  await expect(page.getByText("Wähle deinen Standort")).toBeVisible();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Klosterneuburg" }).click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Gugging" }).click();

  await page.reload();
  await expect(page.getByTestId("unit-breadcrumb-federal")).toContainText("Österreich");
  await expect(page.getByTestId("unit-breadcrumb-state")).toContainText("Niederösterreich");
  await expect(page.getByTestId("unit-breadcrumb-district")).toContainText("Tulln");
  await expect(page.getByTestId("unit-breadcrumb-municipality")).toContainText("Klosterneuburg");
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText("Gugging");
  await expect(page.getByText("Wähle deinen Standort")).toHaveCount(0);

  // Klick auf ein Segment öffnet die Geschwister-Auswahl (reine Selection,
  // kein "Neu anlegen"/"Bearbeiten"/"Löschen" wie im Admin-Bereich) und
  // ändert die gespeicherte Ebene dauerhaft.
  await page.getByTestId("unit-breadcrumb-cadastral_municipality").click();
  await expect(page.getByText("Neu anlegen")).toHaveCount(0);
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Höflein" }).click();
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText("Höflein");

  await page.reload();
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText("Höflein");
});

test("Breadcrumb-Ansicht erlaubt Weiterverzweigen in eine tiefere, bereits existierende Ebene", async ({
  page,
}) => {
  await page.goto("/");
  // Nur bis "Tulln" (Bezirk) auswählen — bewusst nicht bis zum tiefsten
  // Blatt, um den Fall zu reproduzieren: nach einem Reload zeigt die
  // Breadcrumb-Ansicht "Tulln" als letztes Segment, obwohl es unterhalb
  // noch existierende Gemeinden/Katastralgemeinden gibt.
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Österreich" }).click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Niederösterreich" }).click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Tulln" }).click();

  await page.reload();
  await expect(page.getByTestId("unit-breadcrumb-district")).toContainText("Tulln");
  await expect(page.getByTestId("unit-breadcrumb-municipality")).toHaveCount(0);

  // "Weiter verzweigen": zeigt bestehende Kinder zur Auswahl (kein "Neu
  // anlegen" wie im Admin-Bereich).
  await page.getByTestId("unit-breadcrumb-deepen-municipality").click();
  await expect(page.getByText("Neu anlegen")).toHaveCount(0);
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Klosterneuburg" }).click();
  await expect(page.getByTestId("unit-breadcrumb-municipality")).toContainText("Klosterneuburg");

  // Noch eine Ebene tiefer, um sicherzustellen, dass sich beliebig oft
  // weiterverzweigen lässt, nicht nur einmal.
  await page.getByTestId("unit-breadcrumb-deepen-cadastral_municipality").click();
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Gugging" }).click();
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText("Gugging");

  await page.reload();
  await expect(page.getByTestId("unit-breadcrumb-district")).toContainText("Tulln");
  await expect(page.getByTestId("unit-breadcrumb-municipality")).toContainText("Klosterneuburg");
  await expect(page.getByTestId("unit-breadcrumb-cadastral_municipality")).toContainText("Gugging");
});

test("Region als Standort wählen: erscheint als eigenes Breadcrumb-Segment hinter ihrer Vorfahrenkette, Dropdown erlaubt Wechsel zurück zu einer Einheit", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Österreich" }).click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Niederösterreich" }).click();

  // "Wachau" erscheint in derselben Spalte wie Tulln/Krems-Land/Melk (alle
  // Kinder von Niederösterreich), getrennt durch eine dünne Linie und das
  // Label "Gegend" — kein separater Tab mehr nötig. (In der Bundesland-Spalte
  // ist zu diesem Zeitpunkt zusätzlich noch "Hohe Tauern" unter einem
  // eigenen "Gegend"-Label sichtbar, daher hier gezielt auf die
  // Region-Option statt auf den generischen Label-Text geprüft.)
  await expect(page.locator('[data-testid^="region-option-"]', { hasText: "Wachau" })).toBeVisible();
  await page.locator('[data-testid^="region-option-"]', { hasText: "Wachau" }).click();

  await expect(page.getByTestId("administrative-level-label")).toContainText("Wachau");
  // Wachau ist mit Krems-Land + Melk verknüpft, beide Kinder von
  // Niederösterreich — ihr niedrigster gemeinsamer Vorfahre ist
  // Niederösterreich, daher erscheint die Region als eigenes
  // Breadcrumb-Segment HINTER der vollen Vorfahrenkette (Österreich >
  // Niederösterreich), nicht als isolierte flache Anzeige mit
  // "Standort ändern"-Link.
  await expect(page.getByTestId("unit-breadcrumb-federal")).toContainText("Österreich");
  await expect(page.getByTestId("unit-breadcrumb-state")).toContainText("Niederösterreich");
  await expect(page.locator('[data-testid^="region-breadcrumb-"]', { hasText: "Wachau" })).toBeVisible();
  await expect(page.getByTestId("standort-change-region")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("administrative-level-label")).toContainText("Wachau");
  await expect(page.getByTestId("unit-breadcrumb-state")).toContainText("Niederösterreich");

  // Das Dropdown des Region-Segments zeigt dieselben Geschwister wie ein
  // normales Segment (Bezirke von Niederösterreich) UND die Region selbst —
  // ein Klick auf eine Einheit wechselt zurück zu einer normalen
  // Unit-Auswahl an genau dieser Stelle.
  await page.locator('[data-testid^="region-breadcrumb-"]', { hasText: "Wachau" }).click();
  await page.locator('[data-testid^="unit-option-"]', { hasText: "Tulln" }).click();
  await expect(page.getByTestId("unit-breadcrumb-district")).toContainText("Tulln");
  await expect(page.getByTestId("administrative-level-label")).toContainText("Tulln");
});

test("eine Region mit verknüpften Einheiten unter verschiedenen Bundesländern erscheint einmal an deren niedrigstem gemeinsamem Vorfahren (Hohe Tauern in der Bundesland-Spalte, nicht je Bundesland dupliziert)", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Österreich" }).click();

  // Salzburg, Tirol und Kärnten sind alle Kinder von Österreich — das ist der
  // gemeinsame Vorfahre der drei mit Hohe Tauern verknüpften Bundesländer,
  // daher erscheint die Region genau hier, in der Bundesland-Spalte, statt
  // einzeln in jeder der drei Bezirk-Spalten darunter.
  await expect(page.locator('[data-testid^="region-option-"]', { hasText: "Hohe Tauern" })).toHaveCount(1);

  // Salzburg auswählen öffnet eine neue Bezirk-Spalte (Zell am See) — "Hohe
  // Tauern" bleibt weiterhin genau einmal sichtbar (in der
  // Bundesland-Spalte), wird nicht zusätzlich in der neuen Bezirk-Spalte
  // dupliziert.
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Salzburg" }).click();
  await expect(page.locator('[data-testid^="unit-column-select-"]', { hasText: "Zell am See" })).toBeVisible();
  await expect(page.locator('[data-testid^="region-option-"]', { hasText: "Hohe Tauern" })).toHaveCount(1);
});

test("Region-Injektion funktioniert auch im Breadcrumb-Segment-Dropdown (nicht nur in der Spalten-Ansicht)", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Österreich" }).click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Niederösterreich" }).click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Tulln" }).click();
  await page.reload();
  await expect(page.getByTestId("unit-breadcrumb-district")).toContainText("Tulln");

  // Das Segment-Dropdown für "Tulln" zeigt die Geschwister (andere Bezirke
  // von Niederösterreich) UND, abgetrennt durch das Label "Gegend", die dort
  // verknüpfte Region "Wachau" — derselbe Injektionspfad wie in der
  // Spalten-Ansicht, nur im BaseUI-Dropdown statt in der Spalte selbst.
  await page.getByTestId("unit-breadcrumb-district").click();
  await expect(page.getByText("Gegend")).toBeVisible();
  await page.locator('[data-testid^="region-option-"]', { hasText: "Wachau" }).click();

  await expect(page.getByTestId("administrative-level-label")).toContainText("Wachau");
});

test("eingeloggter Roundtrip: Auswahl bleibt nach Aus- und wieder Einloggen erhalten", async ({ page }) => {
  await loginWithCredentials(page, userEmail, password);
  await page.goto("/");
  await expect(page.getByText("Wähle deinen Standort")).toBeVisible();

  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Österreich" }).click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Niederösterreich" }).click();
  // Eingeloggt schreibt persist() per Server Action (fire-and-forget aus
  // Sicht des Klicks) — vor dem Reload muss der Request tatsächlich
  // durchgelaufen sein, sonst race't der Reload gegen den noch laufenden
  // DB-Write (siehe gleiches Muster in settings.spec.ts).
  await expect(page.getByTestId("administrative-level-widget")).not.toHaveAttribute("aria-busy", "true");

  await page.reload();
  await expect(page.getByTestId("unit-breadcrumb-state")).toContainText("Niederösterreich");

  await page.getByTestId("account-menu-trigger").click();
  await page.getByTestId("account-menu-sign-out").click();
  await expect(page).toHaveURL("http://localhost:3000/");
  // Beweist, dass die Session-Cookie tatsächlich weg ist, bevor erneut
  // eingeloggt wird — sonst würde /login (redirect("/") für bereits
  // angemeldete User) auf die noch nicht abgeschlossene Abmeldung race'n.
  await expect(page.getByTestId("login-link")).toBeVisible();

  await loginWithCredentials(page, userEmail, password);
  await page.goto("/");
  await expect(page.getByTestId("unit-breadcrumb-state")).toContainText("Niederösterreich");
});
