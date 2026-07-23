// Read-only Bestandsaufnahme der images-Tabelle vor einem geplanten
// physischen Spalten-Reorder (siehe scripts/rebuild-images-column-order.mjs)
// — Spaltenreihenfolge, Constraints, Indizes, RLS-Status und ob eine andere
// Tabelle per FK auf images verweist.
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

  const columns = await client.query(
    `select column_name, data_type, udt_name, is_nullable, column_default, ordinal_position
     from information_schema.columns
     where table_name = 'images'
     order by ordinal_position`
  );
  console.log("Spalten (physische Reihenfolge):");
  for (const row of columns.rows) {
    console.log(
      `- [${row.ordinal_position}] ${row.column_name} (${row.udt_name}${row.udt_name === "_text" ? "[]" : ""}, nullable=${row.is_nullable}, default=${row.column_default ?? "—"})`
    );
  }

  const constraints = await client.query(
    `select conname, pg_get_constraintdef(oid) as definition
     from pg_constraint
     where conrelid = 'images'::regclass
     order by conname`
  );
  console.log("\nConstraints:");
  for (const row of constraints.rows) {
    console.log(`- ${row.conname}: ${row.definition}`);
  }

  const indexes = await client.query(
    `select indexname, indexdef from pg_indexes where tablename = 'images' order by indexname`
  );
  console.log("\nIndizes:");
  for (const row of indexes.rows) {
    console.log(`- ${row.indexname}: ${row.indexdef}`);
  }

  const triggers = await client.query(
    `select tgname from pg_trigger where tgrelid = 'images'::regclass and not tgisinternal`
  );
  console.log("\nTrigger:", triggers.rows.length === 0 ? "keine" : triggers.rows.map((r) => r.tgname).join(", "));

  const rls = await client.query(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'images'::regclass`);
  console.log("Row Level Security:", rls.rows[0]);

  const policies = await client.query(`select policyname from pg_policies where tablename = 'images'`);
  console.log("RLS-Policies:", policies.rows.length === 0 ? "keine" : policies.rows.map((r) => r.policyname).join(", "));

  const referencingFks = await client.query(
    `select conname, conrelid::regclass as referencing_table, pg_get_constraintdef(oid) as definition
     from pg_constraint
     where confrelid = 'images'::regclass`
  );
  console.log(
    "\nFremdschlüssel ANDERER Tabellen auf images:",
    referencingFks.rows.length === 0 ? "keine" : ""
  );
  for (const row of referencingFks.rows) {
    console.log(`- ${row.referencing_table}.${row.conname}: ${row.definition}`);
  }

  const views = await client.query(
    `select distinct table_name from information_schema.view_table_usage where table_name = 'images'`
  );
  console.log("Views, die images verwenden:", views.rows.length === 0 ? "keine" : views.rows.map((r) => r.table_name).join(", "));

  const publications = await client.query(
    `select pubname from pg_publication_tables where tablename = 'images'`
  );
  console.log(
    "Replication-Publications mit images:",
    publications.rows.length === 0 ? "keine" : publications.rows.map((r) => r.pubname).join(", ")
  );

  const rowCount = await client.query(`select count(*)::int as count from images`);
  console.log("\nAktuelle Zeilenanzahl:", rowCount.rows[0].count);
} catch (err) {
  console.error("Query FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
