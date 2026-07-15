// Löscht Regionen, die von fehlgeschlagenen e2e-Testläufen übrig geblieben
// sind (Testfälle unter e2e/admin-administrative-units.spec.ts legen
// Regionen mit dem Namenspräfix "E2E " an und räumen sie am Ende normalerweise
// wieder auf — bricht ein Testlauf vorher ab, bleiben sie liegen und können
// spätere Läufe verfälschen, z.B. über Namenskollisionen).
//
// Usage: node scripts/cleanup-e2e-test-regions.mjs
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const { rows } = await client.query("DELETE FROM regions WHERE name LIKE 'E2E %' RETURNING name");
  console.log(
    rows.length > 0
      ? `Gelöscht: ${rows.map((row) => row.name).join(", ")}`
      : "Keine liegen gebliebenen E2E-Testregionen gefunden."
  );
} catch (err) {
  console.error("Cleanup fehlgeschlagen:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
