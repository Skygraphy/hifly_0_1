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
  const res = await client.query(
    `select column_name, data_type
     from information_schema.columns
     where table_name = 'administrative_units'
     order by ordinal_position`
  );
  console.log("Columns of administrative_units:");
  for (const row of res.rows) {
    console.log(`- ${row.column_name} (${row.data_type})`);
  }
} catch (err) {
  console.error("Query FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
