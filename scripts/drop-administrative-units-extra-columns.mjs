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
  await client.query(
    `ALTER TABLE administrative_units
       DROP COLUMN IF EXISTS is_featured,
       DROP COLUMN IF EXISTS latitude,
       DROP COLUMN IF EXISTS longitude`
  );
  console.log("Dropped is_featured, latitude, longitude from administrative_units.");
} catch (err) {
  console.error("Drop FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
