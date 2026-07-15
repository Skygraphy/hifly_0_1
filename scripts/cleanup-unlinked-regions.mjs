// Löscht Regionen ohne jede Verknüpfung — laut aktueller Definition darf es
// die nicht (mehr) geben (siehe regions.home_parent_id/home_level in
// src/db/schema.ts sowie die Speichern-Validierung in region-actions.ts).
// Kann vorkommen, wenn eine Region vor Einführung dieser Regel angelegt
// wurde.
//
// Usage: node scripts/cleanup-unlinked-regions.mjs
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const { rows } = await client.query(`
    DELETE FROM regions
    WHERE id IN (
      SELECT r.id
      FROM regions r
      LEFT JOIN region_administrative_units rau ON rau.region_id = r.id
      GROUP BY r.id
      HAVING count(rau.administrative_unit_id) = 0
    )
    RETURNING name
  `);
  console.log(
    rows.length > 0 ? `Gelöscht: ${rows.map((row) => row.name).join(", ")}` : "Keine unverknüpften Regionen gefunden."
  );
} catch (err) {
  console.error("Cleanup fehlgeschlagen:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
