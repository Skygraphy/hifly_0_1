import { config } from "dotenv";
import pg from "pg";
import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser, getSuperAdminCredentials } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";
import { getAdministrativeUnitIdByName } from "./fixtures/administrative-units";

config({ path: ".env.local", quiet: true });

test("Auswahl übernehmen führt von / zu /images und der Standort-Filter dort zeigt dieselbe Auswahl", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Österreich" }).click();
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Niederösterreich" }).click();

  await page.getByTestId("submit-selection-link").click();
  await expect(page).toHaveURL(/\/images$/);
  await expect(page.getByTestId("standort-filter")).toContainText("Niederösterreich");

  await page.getByTestId("back-link").click();
  await expect(page).toHaveURL("http://localhost:3000/");
});

test("Auswahl übernehmen funktioniert auch für eine gewählte Region", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-testid^="unit-column-select-"]', { hasText: "Österreich" }).click();
  await page.locator('[data-testid^="region-option-"]', { hasText: "Hohe Tauern" }).click();

  await page.getByTestId("submit-selection-link").click();
  await expect(page).toHaveURL(/\/images$/);
  await expect(page.getByTestId("standort-filter")).toContainText("Hohe Tauern");
});

test("/images ist auch ohne vorherige Auswahl direkt erreichbar und zeigt den Standort-Filter (anonym)", async ({
  page,
}) => {
  await page.goto("/images");
  await expect(page).toHaveURL(/\/images$/);
  await expect(page.getByTestId("standort-filter")).toBeVisible();
});

test("/images ist auch für eingeloggte User ohne gespeicherten Standort direkt erreichbar", async ({ page }) => {
  const userEmail = "e2e-images-no-standort-user@example.com";
  const password = "e2e-test-password-123";
  await createFixtureUser({ email: userEmail, password, role: "user" });
  try {
    await loginWithCredentials(page, userEmail, password);
    await page.goto("/images");
    await expect(page).toHaveURL(/\/images$/);
    await expect(page.getByTestId("standort-filter")).toBeVisible();
  } finally {
    await deleteFixtureUser(userEmail);
  }
});

test("Text-Filter (Ort, Tags) filtert das Grid bei jedem Tastendruck live", async ({ page }) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { email: superEmail, password: superPassword } = getSuperAdminCredentials();
  const folderA = "Filtertest_Gasse_2024_01_01_020_AAAAAA_99999999-9999-9999-9999-999999999990";
  const folderB = "Filtertest_Gasse_2024_01_01_021_BBBBBB_99999999-9999-9999-9999-999999999991";

  try {
    const { rows: userRows } = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      superEmail,
    ]);
    const uploaderId = userRows[0].id;
    const tullnId = await getAdministrativeUnitIdByName("Tulln");

    // web_ranking bewusst sehr hoch gesetzt (sortiert web_ranking DESC NULLS
    // LAST): die Standort-Filterung liefert nur eine Seite (60 Treffer) —
    // ohne hohen Rang würden diese Fixture-Zeilen hinter den mittlerweile
    // 60 echten, bereits gerankten Bildern unter Tulln landen und wären auf
    // der ersten Seite nicht sichtbar.
    await client.query(
      `INSERT INTO images
         (id, address, capture_date, sequence_number, hash, uuid, administrative_unit_id, uploaded_by,
          main_location, tags, web_visible, web_ranking)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, 999999),
         ($11, $12, $13, $14, $15, $16, $17, $18, $19, $20, true, 999999)`,
      [
        folderA,
        "Filtertest Gasse",
        "2024-01-01",
        20,
        "AAAAAA",
        "99999999-9999-9999-9999-999999999990",
        tullnId,
        uploaderId,
        "Sonnenplatz",
        ["herbst"],
        folderB,
        "Filtertest Gasse",
        "2024-01-01",
        21,
        "BBBBBB",
        "99999999-9999-9999-9999-999999999991",
        tullnId,
        uploaderId,
        "Mondwiese",
        ["winter"],
      ]
    );

    // super_admin ist ein echter, dauerhafter Account — dessen gespeicherter
    // Standard-Standort kann von früherer Arbeit bereits irgendwo anders
    // gesetzt sein (Breadcrumb UND Spalten-Ansicht würden dann nicht leer
    // starten). Direkt auf Tulln setzen statt über die UI zu navigieren,
    // damit der Test unabhängig vom aktuellen Zustand deterministisch ist.
    await client.query(
      `INSERT INTO user_settings (user_id, key, value, updated_at)
       VALUES ($1, 'default_administrative_unit', $2, now())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = now()`,
      [uploaderId, JSON.stringify({ type: "unit", id: tullnId })]
    );

    await loginWithCredentials(page, superEmail, superPassword);
    await page.goto("/images");

    await expect(page.getByTestId(`image-thumbnail-${folderA}`)).toBeVisible();
    await expect(page.getByTestId(`image-thumbnail-${folderB}`)).toBeVisible();

    await page.getByTestId("images-filter-location").fill("Sonnen");
    await expect(page.getByTestId(`image-thumbnail-${folderA}`)).toBeVisible();
    await expect(page.getByTestId(`image-thumbnail-${folderB}`)).toHaveCount(0);

    await page.getByTestId("images-filter-location").fill("");
    await page.getByTestId("images-filter-tags").fill("winter");
    await expect(page.getByTestId(`image-thumbnail-${folderB}`)).toBeVisible();
    await expect(page.getByTestId(`image-thumbnail-${folderA}`)).toHaveCount(0);
  } finally {
    await client.query("DELETE FROM images WHERE id = ANY($1)", [[folderA, folderB]]);
    await client.end();
  }
});

test("admin kann ein Bild bearbeiten und löschen", async ({ page }) => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { email: superEmail, password: superPassword } = getSuperAdminCredentials();
  const folderId = "Edittest_Gasse_2024_01_01_030_CCCCCC_99999999-9999-9999-9999-999999999992";

  try {
    const { rows: userRows } = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      superEmail,
    ]);
    const uploaderId = userRows[0].id;
    const tullnId = await getAdministrativeUnitIdByName("Tulln");

    // web_ranking bewusst sehr hoch gesetzt (sortiert web_ranking DESC NULLS
    // LAST) — sonst landet diese Fixture-Zeile hinter den mittlerweile 60
    // echten, bereits gerankten Bildern unter Tulln und ist auf der ersten
    // (einzigen geladenen) Seite nicht sichtbar.
    await client.query(
      `INSERT INTO images (id, address, capture_date, sequence_number, hash, uuid, administrative_unit_id, uploaded_by, main_location, web_visible, web_ranking)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 999999)`,
      [
        folderId,
        "Edittest Gasse",
        "2024-01-01",
        30,
        "CCCCCC",
        "99999999-9999-9999-9999-999999999992",
        tullnId,
        uploaderId,
        "Alter Ort",
      ]
    );

    // super_admin ist ein echter, dauerhafter Account — dessen gespeicherter
    // Standard-Standort kann von früherer Arbeit bereits irgendwo anders
    // gesetzt sein (Breadcrumb UND Spalten-Ansicht würden dann nicht leer
    // starten). Direkt auf Tulln setzen statt über die UI zu navigieren,
    // damit der Test unabhängig vom aktuellen Zustand deterministisch ist.
    await client.query(
      `INSERT INTO user_settings (user_id, key, value, updated_at)
       VALUES ($1, 'default_administrative_unit', $2, now())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = now()`,
      [uploaderId, JSON.stringify({ type: "unit", id: tullnId })]
    );

    await loginWithCredentials(page, superEmail, superPassword);
    await page.goto("/images");

    const thumbnail = page.getByTestId(`image-thumbnail-${folderId}`);
    await expect(thumbnail).toBeVisible();
    await thumbnail.hover();
    await page.getByTestId(`image-edit-${folderId}`).click();

    await expect(page.getByTestId("image-edit-main-location")).toHaveValue("Alter Ort");
    await page.getByTestId("image-edit-main-location").fill("Neuer Ort");
    await page.getByTestId("image-edit-save").click();
    await expect(page.getByTestId("image-edit-main-location")).toHaveCount(0);
    await expect(thumbnail).toContainText("Neuer Ort");

    const { rows: afterEdit } = await client.query("SELECT main_location FROM images WHERE id = $1", [folderId]);
    expect(afterEdit[0].main_location).toBe("Neuer Ort");

    await thumbnail.hover();
    await page.getByTestId(`image-delete-${folderId}`).click();
    await page.getByTestId("image-confirm-delete").click();
    await expect(thumbnail).toHaveCount(0);

    const { rows: afterDelete } = await client.query("SELECT id FROM images WHERE id = $1", [folderId]);
    expect(afterDelete).toHaveLength(0);
  } finally {
    await client.query("DELETE FROM images WHERE id = $1", [folderId]);
    await client.end();
  }
});
