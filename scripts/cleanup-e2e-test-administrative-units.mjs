// Löscht Verwaltungseinheiten, die von fehlgeschlagenen/abgebrochenen
// e2e-Testläufen oder manuellen Diagnose-Skripten übrig geblieben sind
// (Testfälle legen Einheiten mit dem Namenspräfix "E2E " an und räumen sie
// am Ende normalerweise wieder auf — bricht ein Lauf vorher ab, bleiben sie
// liegen und können spätere Läufe verfälschen, z.B. über Code-Kollisionen).
// parent_id hat ON DELETE CASCADE, ein Löschen einer übergeordneten Einheit
// nimmt liegen gebliebene Kinder automatisch mit.
//
// Usage: node scripts/cleanup-e2e-test-administrative-units.mjs
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const { rows } = await client.query("DELETE FROM administrative_units WHERE name LIKE 'E2E %' RETURNING name");
  console.log(
    rows.length > 0
      ? `Gelöscht: ${rows.map((row) => row.name).join(", ")}`
      : "Keine liegen gebliebenen E2E-Testeinheiten gefunden."
  );
} catch (err) {
  console.error("Cleanup fehlgeschlagen:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
