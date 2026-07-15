// Diagnose-Skript: zeigt alle Regionen ohne jede Verknüpfung (sollte es laut
// aktueller Definition gar nicht mehr geben).
//
// Usage: node scripts/check-hohe-tauern-links.mjs
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
    SELECT r.id, r.name, r.home_level, count(rau.administrative_unit_id) AS link_count
    FROM regions r
    LEFT JOIN region_administrative_units rau ON rau.region_id = r.id
    GROUP BY r.id, r.name, r.home_level
    ORDER BY r.name
  `);
  console.table(rows);
  const orphans = rows.filter((row) => Number(row.link_count) === 0);
  console.log(orphans.length > 0 ? `${orphans.length} unverknüpfte Region(en) gefunden.` : "Keine unverknüpften Regionen.");
} finally {
  await client.end().catch(() => {});
}
