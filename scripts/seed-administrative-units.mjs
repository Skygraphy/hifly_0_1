// Seedet die österreichische Verwaltungsgliederung (Bund -> Bundesland ->
// Bezirk -> Gemeinde -> Katastralgemeinde -> Gebiet): den vollständigen Zweig
// Österreich -> Niederösterreich -> Tulln -> Klosterneuburg, sowie zusätzlich
// einige weitere Bundesländer/Bezirke nur bis Bezirksebene (Salzburg, Tirol,
// Kärnten, sowie Krems-Land/Melk unter Niederösterreich) — ausschließlich
// damit sich die regionsübergreifenden Beispiele "Hohe Tauern" und "Wachau"
// (siehe scripts/seed-regions.mjs) sinnvoll mit echten Verwaltungseinheiten
// verknüpfen lassen. Idempotent (sicher erneut ausführbar): matcht
// bestehende Zeilen über (parent_id, code) und aktualisiert statt zu
// duplizieren.
//
// Usage: node scripts/seed-administrative-units.mjs
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Nutzt bewusst "parent_id IS NOT DISTINCT FROM $1" statt ON CONFLICT: der
// Unique Index liegt auf (parent_id, code), aber Postgres behandelt zwei
// NULL-Werte in einem Unique Index nie als Konflikt — ON CONFLICT würde den
// Bund-Eintrag (parent_id IS NULL) bei jedem erneuten Lauf duplizieren statt
// zu aktualisieren. IS NOT DISTINCT FROM behandelt NULL = NULL korrekt.
async function upsertUnit(client, { parentId, level, code, name, shortName = null }) {
  const { rows: existing } = await client.query(
    "SELECT id FROM administrative_units WHERE parent_id IS NOT DISTINCT FROM $1 AND code = $2",
    [parentId, code]
  );

  if (existing.length > 0) {
    const { rows } = await client.query(
      "UPDATE administrative_units SET name = $1, short_name = $2, updated_at = now() WHERE id = $3 RETURNING id",
      [name, shortName, existing[0].id]
    );
    return rows[0].id;
  }

  const { rows } = await client.query(
    "INSERT INTO administrative_units (parent_id, level, code, name, short_name) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [parentId, level, code, name, shortName]
  );
  return rows[0].id;
}

try {
  await client.connect();

  const oesterreichId = await upsertUnit(client, {
    parentId: null,
    level: "federal",
    code: "AT",
    name: "Österreich",
    shortName: "AT",
  });

  const niederoesterreichId = await upsertUnit(client, {
    parentId: oesterreichId,
    level: "state",
    code: "AT-3",
    name: "Niederösterreich",
    shortName: "NÖ",
  });

  const tullnId = await upsertUnit(client, {
    parentId: niederoesterreichId,
    level: "district",
    code: "321",
    name: "Tulln",
    shortName: "Tulln",
  });

  const klosterneuburgId = await upsertUnit(client, {
    parentId: tullnId,
    level: "municipality",
    code: "32144",
    name: "Klosterneuburg",
    shortName: "Klbg",
  });

  const katastralgemeinden = [
    { code: "1701", name: "Gugging" },
    { code: "1702", name: "Höflein" },
    { code: "1703", name: "Kierling" },
    { code: "1704", name: "Klosterneuburg Stadt", shortName: "Klbg Std" },
    { code: "1705", name: "Kritzendorf" },
    { code: "1706", name: "Weidling" },
    { code: "1707", name: "Weidlingbach" },
  ];

  let klosterneuburgStadtId;
  for (const kg of katastralgemeinden) {
    const id = await upsertUnit(client, {
      parentId: klosterneuburgId,
      level: "cadastral_municipality",
      code: kg.code,
      name: kg.name,
      shortName: kg.shortName ?? null,
    });
    if (kg.code === "1704") klosterneuburgStadtId = id;
  }

  // Gebiete A-W (kein X/Y/Z) ausschließlich unterhalb von Klosterneuburg Stadt.
  const gebietsBuchstaben = "ABCDEFGHIJKLMNOPQRSTUVW".split("");
  for (const buchstabe of gebietsBuchstaben) {
    await upsertUnit(client, {
      parentId: klosterneuburgStadtId,
      level: "area",
      code: buchstabe,
      name: buchstabe,
    });
  }

  // Zusätzliche Bundesländer/Bezirke ausschließlich, um die Regionen-
  // Beispiele "Hohe Tauern" (Salzburg/Tirol/Kärnten) und "Wachau" (weitere
  // NÖ-Bezirke) sinnvoll verknüpfen zu können — bewusst nur bis
  // Bezirksebene, keine Gemeinde/Katastralgemeinde/Gebiets-Tiefe nötig.
  const salzburgId = await upsertUnit(client, {
    parentId: oesterreichId,
    level: "state",
    code: "AT-5",
    name: "Salzburg",
    shortName: "Sbg",
  });
  await upsertUnit(client, {
    parentId: salzburgId,
    level: "district",
    code: "506",
    name: "Zell am See",
    shortName: "ZeAm",
  });

  const tirolId = await upsertUnit(client, {
    parentId: oesterreichId,
    level: "state",
    code: "AT-7",
    name: "Tirol",
    shortName: "T",
  });
  await upsertUnit(client, {
    parentId: tirolId,
    level: "district",
    code: "706",
    name: "Lienz",
    shortName: "Osttirol",
  });

  const kaerntenId = await upsertUnit(client, {
    parentId: oesterreichId,
    level: "state",
    code: "AT-2",
    name: "Kärnten",
    shortName: "Ktn",
  });
  await upsertUnit(client, {
    parentId: kaerntenId,
    level: "district",
    code: "204",
    name: "Spittal an der Drau",
    shortName: "Spittal",
  });

  await upsertUnit(client, {
    parentId: niederoesterreichId,
    level: "district",
    code: "310",
    name: "Krems-Land",
    shortName: "Krems-Land",
  });
  await upsertUnit(client, {
    parentId: niederoesterreichId,
    level: "district",
    code: "315",
    name: "Melk",
    shortName: "Melk",
  });

  console.log(
    `Verwaltungsgliederung geseedet: 1 Bund, 4 Bundesländer, 6 Bezirke, 1 Gemeinde, ${katastralgemeinden.length} Katastralgemeinden, ${gebietsBuchstaben.length} Gebiete.`
  );
} catch (err) {
  console.error("Seed fehlgeschlagen:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
