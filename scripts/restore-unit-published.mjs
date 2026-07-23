// Einmaliger Reparatur-Lauf: "Oberösterreich" wurde während e2e-Testläufen
// (vermutlich durch eine fehlerhafte Checkbox-Interaktion in einem Testlauf)
// versehentlich auf published=false gesetzt — diese Zeile ist nicht Teil von
// scripts/seed-administrative-units.mjs (das Skript kennt nur Niederösterreich,
// Salzburg, Tirol, Kärnten), ein erneuter Seed-Lauf korrigiert sie daher nicht.
//
// Usage: node scripts/restore-unit-published.mjs
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const { rows } = await client.query(
    "UPDATE administrative_units SET published = true WHERE name = 'Oberösterreich' AND published = false RETURNING name"
  );
  console.log(
    rows.length > 0 ? `Korrigiert: ${rows.map((row) => row.name).join(", ")}` : "Nichts zu korrigieren."
  );
} catch (err) {
  console.error("Reparatur fehlgeschlagen:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
