import { config } from "dotenv";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import pg from "pg";
import { test, expect } from "@playwright/test";
import { createFixtureUser, deleteFixtureUser, getSuperAdminCredentials } from "./fixtures/users";
import { loginWithCredentials } from "./fixtures/login";
import { getAdministrativeUnitIdByName } from "./fixtures/administrative-units";

config({ path: ".env.local", quiet: true });

async function cleanupRealTestUpload(folderId: string) {
  const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Delete: { Objects: [{ Key: `${folderId}/original.dng` }] },
    })
  );
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query("DELETE FROM images WHERE id = $1", [folderId]);
  await client.end();
}

const plainUserEmail = "e2e-images-upload-user@example.com";
const grantedAdminEmail = "e2e-images-upload-admin@example.com";
const singleGrantAdminEmail = "e2e-images-upload-single-grant-admin@example.com";
const password = "e2e-test-password-123";

test.beforeAll(async () => {
  await createFixtureUser({ email: plainUserEmail, password, role: "user" });
  await createFixtureUser({ email: grantedAdminEmail, password, role: "admin" });
  await createFixtureUser({ email: singleGrantAdminEmail, password, role: "admin" });
});

test.afterAll(async () => {
  await deleteFixtureUser(plainUserEmail);
  await deleteFixtureUser(grantedAdminEmail);
  await deleteFixtureUser(singleGrantAdminEmail);
});

test("eine plain user-Rolle wird von /admin/images/upload weggeleitet", async ({ page }) => {
  await loginWithCredentials(page, plainUserEmail, password);
  await page.goto("/admin/images/upload");
  await expect(page).toHaveURL(/\/\?error=forbidden/);
});

test("super_admin gibt einem admin einen Standort frei, der admin kann danach genau diesen im Upload-Picker wählen", async ({
  page,
  browser,
}) => {
  const { email: superEmail, password: superPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, superEmail, superPassword);
  await page.goto("/admin/users");

  const adminRow = page.locator("tr", { hasText: grantedAdminEmail });
  await adminRow.getByRole("link", { name: "Standorte verwalten" }).click();
  await expect(page.getByRole("heading", { name: `Standorte freigeben — ${grantedAdminEmail}` })).toBeVisible();

  // Zu Niederösterreich > Tulln navigieren und nur dessen Freigabe-Checkbox
  // anhaken — kein Kaskadieren, alle anderen Bezirke bleiben nicht freigegeben.
  // Der Pfad ist beim Öffnen bereits bis zu einem Blatt aufgeklappt (siehe
  // LocationGrantsManager), Niederösterreich steht daher schon in der
  // Bundesland-Spalte — kein Klick auf Österreich nötig (das würde wegen
  // "Niederösterreich"/"Oberösterreich" als Teilstring ohnehin mehrdeutig).
  await page.getByRole("button", { name: "Niederösterreich", exact: true }).click();
  const tullnRow = page.locator('[data-testid^="unit-column-row-"]', { hasText: "Tulln" });
  await tullnRow.getByRole("checkbox", { name: "Freigegeben" }).check();
  await expect(tullnRow.getByRole("checkbox", { name: "Freigegeben" })).toBeChecked();

  // Als der frisch freigegebene admin in einer eigenen Session einloggen
  // (kein Logout des super_admin nötig, siehe unitVisibleAnonymously in
  // admin-administrative-units.spec.ts für dasselbe Muster).
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginWithCredentials(adminPage, grantedAdminEmail, password);
  await adminPage.goto("/admin/images/upload");

  await adminPage.getByTestId("batch-standort-picker-open").click();
  await expect(adminPage.getByRole("heading", { name: "Standort für alle Ordner" })).toBeVisible();

  // Der Baum ist auf die Freigabe zugeschnitten: in der Bundesland-Spalte
  // taucht ausschließlich Niederösterreich auf (als Vorfahre von Tulln
  // nötig für die Navigation) — alle anderen Bundesländer (z.B. Kärnten,
  // ohne eigene Freigabe und ohne Bezug zu Tulln) fehlen komplett, statt nur
  // rot markiert zu sein.
  await adminPage.getByRole("button", { name: "Österreich", exact: true }).click();
  await expect(adminPage.getByRole("button", { name: "Niederösterreich", exact: true })).toBeVisible();
  await expect(adminPage.getByRole("button", { name: "Kärnten", exact: true })).not.toBeVisible();

  // Niederösterreich ist selbst nicht freigegeben (nur Vorfahre von Tulln)
  // — Klick navigiert weiter, OHNE den Picker zu schließen oder schon einen
  // Kandidaten festzulegen; der Übernehmen-Button bleibt deaktiviert.
  await adminPage.getByRole("button", { name: "Niederösterreich", exact: true }).click();
  await expect(adminPage.getByRole("heading", { name: "Standort für alle Ordner" })).toBeVisible();
  await expect(adminPage.getByTestId("location-picker-confirm")).toBeDisabled();

  // Tulln ist freigegeben — der Klick legt es nur als Kandidat fest, der
  // Dialog bleibt offen, bis "Übernehmen" geklickt wird.
  await adminPage.getByRole("button", { name: "Tulln", exact: true }).click();
  await expect(adminPage.getByRole("heading", { name: "Standort für alle Ordner" })).toBeVisible();
  await expect(adminPage.getByText("Ausgewählt: Tulln")).toBeVisible();
  await expect(adminPage.getByTestId("location-picker-confirm")).toBeEnabled();

  // Zurückgehen (erneuter Klick auf den nicht freigegebenen Vorfahren
  // Niederösterreich) muss den Kandidaten verwerfen — Tulln ist nicht mehr
  // Teil des aktuellen Pfads, der Übernehmen-Button darf nicht mit dem
  // veralteten Kandidaten aktiv bleiben.
  await adminPage.getByRole("button", { name: "Niederösterreich", exact: true }).click();
  await expect(adminPage.getByText("Noch kein freigegebener Standort ausgewählt.")).toBeVisible();
  await expect(adminPage.getByTestId("location-picker-confirm")).toBeDisabled();

  // Erneut zu Tulln vor navigieren, um den regulären Bestätigungs-Fluss
  // fortzusetzen.
  await adminPage.getByRole("button", { name: "Tulln", exact: true }).click();
  await expect(adminPage.getByText("Ausgewählt: Tulln")).toBeVisible();
  await expect(adminPage.getByTestId("location-picker-confirm")).toBeEnabled();

  await adminPage.getByTestId("location-picker-confirm").click();
  await expect(adminPage.getByRole("heading", { name: "Standort für alle Ordner" })).not.toBeVisible();
  await expect(adminPage.getByTestId("batch-standort-picker-open")).toContainText("Tulln");

  await adminContext.close();
});

test("ein admin mit genau einer Freigabe sieht sie beim Öffnen bereits als Batch-Standard vorbelegt", async ({
  page,
  browser,
}) => {
  const { email: superEmail, password: superPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, superEmail, superPassword);
  await page.goto("/admin/users");

  const adminRow = page.locator("tr", { hasText: singleGrantAdminEmail });
  await adminRow.getByRole("link", { name: "Standorte verwalten" }).click();
  await page.getByRole("button", { name: "Niederösterreich", exact: true }).click();
  const tullnRow = page.locator('[data-testid^="unit-column-row-"]', { hasText: "Tulln" });
  await tullnRow.getByRole("checkbox", { name: "Freigegeben" }).check();
  await expect(tullnRow.getByRole("checkbox", { name: "Freigegeben" })).toBeChecked();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await loginWithCredentials(adminPage, singleGrantAdminEmail, password);
  await adminPage.goto("/admin/images/upload");

  // Es gibt ohnehin keine andere wählbare Alternative — direkt vorbelegt,
  // ohne dass der Picker erst geöffnet werden muss.
  await expect(adminPage.getByTestId("batch-standort-picker-open")).toContainText("Tulln");

  await adminContext.close();
});

test("eine Region-Auswahl entfernt das Häkchen aller zuvor gewählten Einheiten, auch über Spalten hinweg", async ({
  page,
}) => {
  // Tulln (Einheit, Bezirk-Spalte) und Wachau (Region, "Gegend"-Sektion in
  // derselben Spalte) stehen für denselben StandortRef-Slot — es darf immer
  // nur ein Häkchen gleichzeitig sichtbar sein, sonst sähe es so aus, als
  // wären zwei Standorte gleichzeitig ausgewählt. Das gilt auch für eine
  // TIEFER liegende, zuvor angeklickte Einheit (Klosterneuburg, eigene
  // Gemeinde-Spalte) — path zeigt weiterhin dorthin, ihr Häkchen muss trotzdem
  // verschwinden, sobald eine Region an anderer Stelle zum Kandidaten wird.
  const { email, password: superPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superPassword);
  await page.goto("/admin/images/upload");
  await page.getByTestId("batch-standort-picker-open").click();

  await page.getByRole("button", { name: "Österreich", exact: true }).click();
  await page.getByRole("button", { name: "Niederösterreich", exact: true }).click();
  const tullnRow = page.locator('[data-testid^="unit-column-row-"]', { hasText: "Tulln" });
  await tullnRow.getByRole("button", { name: "Tulln", exact: true }).click();
  await expect(tullnRow.locator("svg.lucide-check")).toBeVisible();

  const klosterneuburgRow = page.locator('[data-testid^="unit-column-row-"]', { hasText: "Klosterneuburg" });
  await klosterneuburgRow.getByRole("button", { name: "Klosterneuburg", exact: true }).click();
  await expect(klosterneuburgRow.locator("svg.lucide-check")).toBeVisible();
  // Beide bleiben vorerst mit Häkchen sichtbar — jede Spalte entlang des
  // Navigations-Pfads zeigt unabhängig ihre eigene Auswahl.
  await expect(tullnRow.locator("svg.lucide-check")).toBeVisible();

  await page.getByRole("button", { name: "Wachau", exact: true }).click();
  await expect(page.getByText("Ausgewählt: Wachau")).toBeVisible();
  await expect(tullnRow.locator("svg.lucide-check")).not.toBeVisible();
  await expect(klosterneuburgRow.locator("svg.lucide-check")).not.toBeVisible();
  const wachauRow = page.locator('[data-testid^="region-row-"]', { hasText: "Wachau" });
  await expect(wachauRow.locator("svg.lucide-check")).toBeVisible();
});

test("erneutes Öffnen des Pickers bei bereits gesetztem Region-Standort navigiert direkt dorthin", async ({
  page,
}) => {
  // Vorher: bei einem Region-Standort (z.B. Wachau) blieb path beim
  // erneuten Öffnen leer (nur initialStandort.type "unit" füllte ihn) —
  // der Picker sprang wieder auf die Bund-Spalte zurück, statt direkt zur
  // bereits gewählten Region aufzuklappen.
  const { email, password: superPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superPassword);
  await page.goto("/admin/images/upload");
  await page.getByTestId("batch-standort-picker-open").click();
  await page.getByRole("button", { name: "Österreich", exact: true }).click();
  await page.getByRole("button", { name: "Niederösterreich", exact: true }).click();
  await page.getByRole("button", { name: "Wachau", exact: true }).click();
  await page.getByTestId("location-picker-confirm").click();

  await page.getByTestId("batch-standort-picker-open").click();
  await expect(page.getByRole("button", { name: "Niederösterreich", exact: true })).toBeVisible();
  const wachauRow = page.locator('[data-testid^="region-row-"]', { hasText: "Wachau" });
  await expect(wachauRow).toBeVisible();
  await expect(wachauRow.locator("svg.lucide-check")).toBeVisible();
});

test("nach Abschluss ersetzt ein Status-Text den Upload-Button; Retry setzt einen fehlgeschlagenen Ordner zurück", async ({
  page,
}) => {
  const { email, password: superPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, email, superPassword);
  await page.goto("/admin/images/upload");

  const folderId = "Teststrasse_5_2024_01_01_005_ABCDEF_55555555-5555-5555-5555-555555555555";
  await page.evaluate((name) => {
    function makeFileEntry(fname: string, content: string) {
      const file = new File([content], fname, { type: "text/plain" });
      return { isFile: true, isDirectory: false, name: fname, file: (s: (f: File) => void) => s(file) };
    }
    function makeDirEntry(dname: string, children: unknown[]) {
      let delivered = false;
      return {
        isFile: false,
        isDirectory: true,
        name: dname,
        createReader: () => ({
          readEntries: (success: (entries: unknown[]) => void) => {
            const result = delivered ? [] : children;
            delivered = true;
            success(result);
          },
        }),
      };
    }
    const dir = makeDirEntry(name, [makeFileEntry("original.dng", "settled-summary-retry-test")]);
    const dataTransfer = { items: [{ kind: "file", webkitGetAsEntry: () => dir }], files: [], types: ["Files"] };
    const dropzone = document.querySelector('[data-testid="folder-dropzone"]');
    const event = new DragEvent("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    dropzone?.dispatchEvent(event);
  }, folderId);
  await expect(page.getByText(folderId)).toBeVisible();

  await page.getByTestId("batch-standort-picker-open").click();
  await page.getByRole("button", { name: "Österreich", exact: true }).click();
  await page.getByRole("button", { name: "Niederösterreich", exact: true }).click();
  await page.getByRole("button", { name: "Wachau", exact: true }).click();
  await page.getByTestId("location-picker-confirm").click();

  try {
    // Fehlschlag erzwingen, um Retry zu prüfen — ohne echten S3-Kontakt.
    await page.route("**/api/images/prepare-upload", (route) => route.fulfill({ status: 500, body: "forced" }));
    await page.getByTestId("start-upload").click();
    await expect(page.getByText("Erneut versuchen")).toBeVisible({ timeout: 15000 });

    // Alles erledigt (1 Fehler) — der Haupt-Button ist durch die
    // Zusammenfassung ersetzt, nicht nur deaktiviert.
    await expect(page.getByTestId("start-upload")).toHaveCount(0);
    const settledSummary = page.getByTestId("upload-settled-summary");
    await expect(settledSummary).toBeVisible();
    await expect(settledSummary).toContainText("1 fehlgeschlagen");

    await page.unroute("**/api/images/prepare-upload");
    await page.getByTestId(`retry-${folderId}`).click();

    // Zurückgesetzt auf "Bereit" — der Haupt-Button erscheint automatisch
    // wieder, ohne dass ein neuer Ordner hinzugefügt werden musste.
    await expect(page.getByTestId("start-upload")).toBeVisible();
    await expect(page.getByTestId("upload-settled-summary")).toHaveCount(0);

    await page.getByTestId("start-upload").click();
    await expect(page.getByText("Fertig")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("start-upload")).toHaveCount(0);
    await expect(page.getByTestId("upload-settled-summary")).toContainText("Alle 1 Ordner hochgeladen");

    // Fertige Zeile: Standort-Bearbeiten ist jetzt deaktiviert (eingefroren).
    await expect(page.getByTestId(`folder-standort-picker-open-${folderId}`)).toBeDisabled();
  } finally {
    await cleanupRealTestUpload(folderId);
  }
});

test("mehrere, nicht benachbarte Ordner lassen sich in einem Rutsch per Drag&Drop hinzufügen", async ({ page }) => {
  // <input webkitdirectory> erlaubt pro Dialog nur einen Startordner — echte
  // Mehrfachauswahl mehrerer (auch nicht benachbarter) Ordner geht nur per
  // Drag&Drop aus dem Explorer. Playwright kann keine echten OS-Dateien
  // ziehen, daher wird die File System Entry API hier direkt im Browser
  // nachgebaut (zwei Verzeichnis-Entries mit je einer Datei) und ein echtes
  // "drop"-Event auf die Dropzone gefeuert — exakt der Code-Pfad, den
  // pickedFilesFromDataTransfer in image-upload-manager.tsx auch für einen
  // echten Drop durchläuft.
  const { email: superEmail, password: superPassword } = getSuperAdminCredentials();
  await loginWithCredentials(page, superEmail, superPassword);
  await page.goto("/admin/images/upload");

  const folderA = "Teststrasse_1_2024_01_01_001_ABCDEF_11111111-1111-1111-1111-111111111111";
  const folderB = "Teststrasse_2_2024_01_02_002_ABCDEF_22222222-2222-2222-2222-222222222222";

  await page.evaluate(
    ([nameA, nameB]) => {
      function makeFileEntry(name: string, content: string) {
        const file = new File([content], name, { type: "text/plain" });
        return {
          isFile: true,
          isDirectory: false,
          name,
          file: (success: (file: File) => void) => success(file),
        };
      }
      function makeDirEntry(name: string, children: unknown[]) {
        let delivered = false;
        return {
          isFile: false,
          isDirectory: true,
          name,
          createReader: () => ({
            readEntries: (success: (entries: unknown[]) => void) => {
              // delivered MUSS vor dem Callback-Aufruf umschalten: echte
              // Browser rufen readEntries' Callback immer asynchron auf,
              // dieses Mock hier aber synchron — success() löst rekursiv
              // sofort den nächsten readBatch()-Aufruf aus (siehe
              // readDirectoryEntries in image-upload-manager.tsx), der bei
              // vertauschter Reihenfolge "delivered" noch als false sähe
              // und in eine Endlosrekursion liefe.
              const result = delivered ? [] : children;
              delivered = true;
              success(result);
            },
          }),
        };
      }

      const dirA = makeDirEntry(nameA, [makeFileEntry("original.dng", "content-a")]);
      const dirB = makeDirEntry(nameB, [makeFileEntry("original.dng", "content-b")]);

      const dataTransfer = {
        items: [
          { kind: "file", webkitGetAsEntry: () => dirA },
          { kind: "file", webkitGetAsEntry: () => dirB },
        ],
        files: [],
        types: ["Files"],
      };

      const dropzone = document.querySelector('[data-testid="folder-dropzone"]');
      const event = new DragEvent("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
      dropzone?.dispatchEvent(event);
    },
    [folderA, folderB]
  );

  await expect(page.getByText(folderA)).toBeVisible();
  await expect(page.getByText(folderB)).toBeVisible();
  await expect(page.getByText("2 Ordner erkannt")).toBeVisible();
});

test("Abgleich durchführen synchronisiert die Datei-Felder einer vorhandenen images-Zeile und warnt bei falschem area", async ({
  page,
}) => {
  const { email: superEmail, password: superPassword } = getSuperAdminCredentials();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const folderId = "Matchtest_Gasse_2024_01_01_009_AAAAAA_99999999-9999-9999-9999-999999999999";
  const folderId2 = "Matchtest_Gasse_2024_01_01_010_BBBBBB_99999999-9999-9999-9999-999999999998";

  try {
    const { rows: userRows } = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      superEmail,
    ]);
    const uploaderId = userRows[0].id;
    const tullnId = await getAdministrativeUnitIdByName("Tulln");

    // Zwei Fixture-Zeilen mit Alt-Werten anlegen — der Abgleich muss sie 1:1
    // durch die Datei-Werte ersetzen (auch den Standort NICHT verändern, nur
    // per area prüfen). Zwei Zeilen statt einer, damit der Live-Fortschritt
    // (siehe unten) einen echten Zwischenschritt zum Prüfen hat.
    await client.query(
      `INSERT INTO images (id, address, capture_date, sequence_number, hash, uuid, administrative_unit_id, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8), ($9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        folderId,
        "Matchtest Gasse",
        "2024-01-01",
        9,
        "AAAAAA",
        "99999999-9999-9999-9999-999999999999",
        tullnId,
        uploaderId,
        folderId2,
        "Matchtest Gasse",
        "2024-01-01",
        10,
        "DDDDDD",
        "99999999-9999-9999-9999-999999999998",
        tullnId,
        uploaderId,
      ]
    );

    // showSaveFilePicker (File System Access API) zeigt im echten Browser
    // einen nativen "Speichern unter"-Dialog — den kann Playwright nicht
    // bedienen (kein DOM, keine OS-Fenster). Simuliert stattdessen
    // createWritable/write/close und legt das Ergebnis in
    // window.__savedFile ab, damit der Test die tatsächliche Integration
    // prüfen kann, statt nur den Download-Fallback für Browser ohne diese API.
    await page.addInitScript(() => {
      (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = async (options: {
        suggestedName?: string;
      }) => ({
        createWritable: async () => ({
          write: async (data: string) => {
            (window as unknown as { __savedFile?: { name?: string; content: string } }).__savedFile = {
              name: options?.suggestedName,
              content: data,
            };
          },
          close: async () => {},
        }),
      });
    });

    await loginWithCredentials(page, superEmail, superPassword);
    await page.goto("/admin/images/upload");

    const fileContent = JSON.stringify({
      images: [
        {
          id: folderId,
          hash: "BBBBBB",
          lat_lng: [48.1, 16.1],
          main_location: "Neuer Ort",
          secondary_locations: ["S1"],
          tags: ["T1"],
          user_tags: ["U1"],
          area: "definitiv-falscher-code",
          web_visible: true,
          web_ranking: 2,
          print_visible: false,
          print_ranking: 3,
          do_match: true,
        },
        {
          id: folderId2,
          hash: "CCCCCC",
          lat_lng: [48.2, 16.2],
          main_location: "Neuer Ort 2",
          secondary_locations: [],
          tags: [],
          user_tags: [],
          area: null,
          web_visible: true,
          web_ranking: 1,
          print_visible: true,
          print_ranking: 1,
          do_match: true,
        },
      ],
    });

    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
      name: "match-test.json",
      mimeType: "application/json",
      buffer: Buffer.from(fileContent, "utf-8"),
    });
    await expect(page.getByText("match-test.json")).toBeVisible();

    // Jede Zeile wird einzeln geschrieben (nicht als ein Bulk-Aufruf) —
    // dadurch kann die UI live anzeigen, welcher Ordner gerade dran ist.
    // Die Server-Action-Aufrufe künstlich verzögern, damit der Fortschritt
    // im Test zuverlässig zwischen den beiden Zeilen beobachtbar ist.
    await page.route("**/admin/images/upload", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      await route.continue();
    });

    await page.getByTestId("run-match").click();
    const progress = page.getByTestId("match-progress");
    await expect(progress).toBeVisible();
    await expect(progress).toContainText("/ 2");
    await expect(progress).toContainText(new RegExp(`${folderId}|${folderId2}`));

    const result = page.getByTestId("match-result");
    await expect(result).toBeVisible({ timeout: 15000 });
    await page.unroute("**/admin/images/upload");
    await expect(result).toContainText("2 aktualisiert");
    await expect(result).toContainText(folderId);
    await expect(result).toContainText(/area/i);

    // Der Speichern-Button bietet dieselbe Datei mit do_match: false für die
    // gerade synchronisierte Zeile an — verhindert, dass ein erneuter Lauf
    // mit derselben Datei später in der DB gemachte Änderungen überschreibt.
    await page.getByTestId("save-updated-match-file").click();
    const saved = await page.evaluate(
      () => (window as unknown as { __savedFile?: { name?: string; content: string } }).__savedFile
    );
    expect(saved?.name).toBe("match-test.json");
    const downloadedEntries = JSON.parse(saved!.content);
    expect(downloadedEntries).toHaveLength(2);
    expect(downloadedEntries.every((entry: { do_match: boolean }) => entry.do_match === false)).toBe(true);

    const { rows } = await client.query(
      `SELECT hash, lat, lng, main_location, secondary_locations, tags, user_tags,
              web_visible, web_ranking, print_visible, print_ranking, administrative_unit_id
       FROM images WHERE id = $1`,
      [folderId]
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.hash).toBe("BBBBBB");
    expect(row.lat).toBeCloseTo(48.1);
    expect(row.lng).toBeCloseTo(16.1);
    expect(row.main_location).toBe("Neuer Ort");
    expect(row.secondary_locations).toEqual(["S1"]);
    expect(row.tags).toEqual(["T1"]);
    // user_tags wird vom Abgleich bewusst NICHT aus der Datei übernommen
    // (siehe PrepareImageMatchResult in src/app/admin/images/actions.ts) —
    // bleibt daher beim nie gesetzten Ausgangswert (null) statt "U1" aus der
    // Match-Datei zu übernehmen.
    expect(row.user_tags).toBeNull();
    expect(row.web_visible).toBe(true);
    expect(row.web_ranking).toBe(2);
    expect(row.print_visible).toBe(false);
    expect(row.print_ranking).toBe(3);
    // area validiert nur — der zugewiesene Standort bleibt unverändert.
    expect(row.administrative_unit_id).toBe(tullnId);
  } finally {
    await client.query("DELETE FROM images WHERE id = ANY($1)", [[folderId, folderId2]]);
    await client.end();
  }
});
