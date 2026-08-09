// Vorab-Check vor dem Anlegen einer UNIQUE-Constraint auf images.hash
// (siehe drizzle-Migration): eine UNIQUE-Constraint schlägt beim Anlegen
// fehl, falls bereits doppelte hash-Werte in der Tabelle stehen. Read-only.
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  const duplicates = await client.query(
    `select hash, count(*)::int as count, array_agg(id) as image_ids
     from images
     group by hash
     having count(*) > 1
     order by count(*) desc`
  );

  if (duplicates.rows.length === 0) {
    console.log("Keine doppelten hash-Werte gefunden — UNIQUE-Constraint kann sicher angelegt werden.");
  } else {
    console.log(`${duplicates.rows.length} doppelte hash-Wert(e) gefunden:`);
    for (const row of duplicates.rows) {
      console.log(`- "${row.hash}" (${row.count}x): ${row.image_ids.join(", ")}`);
    }
    process.exitCode = 1;
  }
} catch (err) {
  console.error("Query FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
