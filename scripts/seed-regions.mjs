// Seedet Beispiel-Regionen, die quer zur Verwaltungsgliederung liegen.
// Idempotent: Regionen werden per (eindeutigem) Namen upserted, ihre
// Verknüpfungen werden bei jedem Lauf vollständig durch die hier
// definierte Liste ersetzt.
//
// Voraussetzung: scripts/seed-administrative-units.mjs wurde bereits
// gelaufen (die hier verlinkten Bezirke müssen existieren).
//
// Usage: node scripts/seed-regions.mjs
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function upsertRegion(client, { name, description = null, color = null, homeParentId, homeLevel }) {
  const { rows } = await client.query(
    `INSERT INTO regions (name, description, color, home_parent_id, home_level) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (name) DO UPDATE SET
       description = $2, color = $3, home_parent_id = $4, home_level = $5, updated_at = now()
     RETURNING id`,
    [name, description, color, homeParentId, homeLevel]
  );
  return rows[0].id;
}

async function getUnitIdByName(client, name) {
  const { rows } = await client.query("SELECT id FROM administrative_units WHERE name = $1 LIMIT 1", [name]);
  if (rows.length === 0) {
    throw new Error(
      `Keine administrative_units-Zeile mit name = "${name}" gefunden — zuerst db:seed:administrative-units laufen lassen.`
    );
  }
  return rows[0].id;
}

async function replaceRegionUnits(client, regionId, unitIds) {
  await client.query("DELETE FROM region_administrative_units WHERE region_id = $1", [regionId]);
  for (const unitId of unitIds) {
    await client.query(
      "INSERT INTO region_administrative_units (region_id, administrative_unit_id) VALUES ($1, $2)",
      [regionId, unitId]
    );
  }
}

try {
  await client.connect();

  const oesterreichId = await getUnitIdByName(client, "Österreich");
  const niederoesterreichId = await getUnitIdByName(client, "Niederösterreich");

  // homeParentId/homeLevel = die Spalte, in der die Region admin-seitig
  // "angelegt" gedacht ist (bleibt danach unveränderlich, siehe schema.ts) —
  // die tatsächlichen Verknüpfungen unten liegen bewusst auf GENAU dieser
  // Ebene (Geschwister-Einheiten derselben Spalte), damit die Checkboxen im
  // Bearbeiten-Dialog den echten Zustand zeigen: Hohe Tauern verknüpft
  // direkt mit den Bundesländern Salzburg/Tirol/Kärnten (nicht mit
  // einzelnen Bezirken darunter), Wachau mit den Bezirken Krems-Land/Melk
  // unter Niederösterreich.
  const hoheTauernId = await upsertRegion(client, {
    name: "Hohe Tauern",
    description: "Gebirgsgruppe/Nationalpark über Salzburg, Tirol (Osttirol) und Kärnten hinweg.",
    homeParentId: oesterreichId,
    homeLevel: "state",
  });
  const hoheTauernUnitIds = [];
  for (const name of ["Salzburg", "Tirol", "Kärnten"]) {
    hoheTauernUnitIds.push(await getUnitIdByName(client, name));
  }
  await replaceRegionUnits(client, hoheTauernId, hoheTauernUnitIds);

  const wachauId = await upsertRegion(client, {
    name: "Wachau",
    description: "Donautal/Weinbauregion über mehrere Bezirke in Niederösterreich hinweg.",
    homeParentId: niederoesterreichId,
    homeLevel: "district",
  });
  const wachauUnitIds = [];
  for (const name of ["Krems-Land", "Melk"]) {
    wachauUnitIds.push(await getUnitIdByName(client, name));
  }
  await replaceRegionUnits(client, wachauId, wachauUnitIds);

  console.log(
    `Regionen geseedet: Hohe Tauern (${hoheTauernUnitIds.length} Einheiten), Wachau (${wachauUnitIds.length} Einheiten).`
  );
} catch (err) {
  console.error("Seed fehlgeschlagen:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
