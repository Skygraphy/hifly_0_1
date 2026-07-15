import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser } from "./fixtures/users";
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

test("bestehende statische Route /login wird vom neuen dynamischen Segment nicht verschluckt", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Anmelden", exact: true })).toBeVisible();
});
