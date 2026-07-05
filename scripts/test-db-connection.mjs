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
  const res = await client.query("select now(), current_database(), version()");
  console.log("DB connection OK");
  console.log(res.rows[0]);
} catch (err) {
  console.error("DB connection FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
