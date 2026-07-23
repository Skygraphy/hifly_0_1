// Einmaliger, physischer Spalten-Reorder der images-Tabelle: Postgres kennt
// kein "ALTER TABLE ... ADD COLUMN ... AFTER x" — neue Spalten landen über
// ALTER TABLE IMMER physisch am Ende, unabhängig davon, wo sie in
// src/db/schema.ts deklariert sind. Die 10 zuletzt hinzugefügten Felder
// (lat...print_ranking) stehen deshalb aktuell physisch NACH updated_at,
// obwohl schema.ts sie zwischen uploaded_by und created_at zeigt (siehe
// scripts/check-images-structure.mjs für die Bestandsaufnahme davor).
//
// Verschiebt sie stattdessen zwischen region_id und uploaded_by — per
// "Tabelle neu aufbauen, Daten kopieren, umbenennen" (der einzige sichere
// Weg, Postgres-Spalten wirklich umzusortieren), alles in EINER Transaktion:
// schlägt irgendein Schritt fehl, bleibt die bestehende images-Tabelle
// unverändert (Rollback).
//
// Vorbedingungen (per check-images-structure.mjs bestätigt): keine anderen
// Tabellen referenzieren images per FK, keine Views/Publications/Trigger
// hängen daran, keine RLS-Policies (RLS selbst ist aktiviert, ohne Force —
// wird nach dem Rebuild exakt so wiederhergestellt).
//
// Usage: node scripts/rebuild-images-column-order.mjs
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

const ORIGINAL_COLUMNS = [
  "id",
  "address",
  "capture_date",
  "sequence_number",
  "hash",
  "uuid",
  "administrative_unit_id",
  "region_id",
  "uploaded_by",
  "created_at",
  "updated_at",
  "lat",
  "lng",
  "main_location",
  "secondary_locations",
  "tags",
  "user_tags",
  "web_visible",
  "web_ranking",
  "print_visible",
  "print_ranking",
];

const NEW_COLUMNS = [
  "id",
  "address",
  "capture_date",
  "sequence_number",
  "hash",
  "uuid",
  "administrative_unit_id",
  "region_id",
  "lat",
  "lng",
  "main_location",
  "secondary_locations",
  "tags",
  "user_tags",
  "web_visible",
  "web_ranking",
  "print_visible",
  "print_ranking",
  "uploaded_by",
  "created_at",
  "updated_at",
];

// Dieselbe Spaltenmenge, nur umsortiert — kein Feld darf beim Umbau verloren
// gehen oder neu dazukommen.
const sameSet =
  ORIGINAL_COLUMNS.length === NEW_COLUMNS.length &&
  ORIGINAL_COLUMNS.every((col) => NEW_COLUMNS.includes(col));
if (!sameSet) {
  throw new Error("ORIGINAL_COLUMNS und NEW_COLUMNS enthalten nicht dieselben Spalten.");
}

try {
  await client.connect();

  const before = await client.query("select count(*)::int as count from images");
  const beforeCount = before.rows[0].count;
  console.log(`Zeilen vor dem Umbau: ${beforeCount}`);

  await client.query("BEGIN");

  // Postgres-Constraint-Namen sind zwar pro Tabelle eindeutig, die
  // dahinterliegenden Indizes (PK/UNIQUE) sind aber Relationen im ganzen
  // Schema — "images_pkey"/"images_uuid_unique" wären sonst mit der noch
  // existierenden alten Tabelle doppelt vergeben. ALTER TABLE ... RENAME TO
  // benennt dabei NUR die Tabelle um, nicht ihre Constraints/Indizes — die
  // müssen daher explizit mit umbenannt werden, damit images_new sofort die
  // finalen Namen bekommen kann. Bei einem Fehler rollt die Transaktion
  // alle diese Umbenennungen zurück — "images" bleibt dann unverändert.
  await client.query("ALTER TABLE images RENAME TO images_old");
  await client.query("ALTER TABLE images_old RENAME CONSTRAINT images_pkey TO images_old_pkey");
  await client.query("ALTER TABLE images_old RENAME CONSTRAINT images_uuid_unique TO images_old_uuid_unique");
  await client.query(
    "ALTER TABLE images_old RENAME CONSTRAINT images_administrative_unit_id_administrative_units_id_fk TO images_old_administrative_unit_id_fk"
  );
  await client.query(
    "ALTER TABLE images_old RENAME CONSTRAINT images_region_id_regions_id_fk TO images_old_region_id_fk"
  );
  await client.query(
    "ALTER TABLE images_old RENAME CONSTRAINT images_uploaded_by_users_id_fk TO images_old_uploaded_by_fk"
  );
  await client.query("ALTER TABLE images_old RENAME CONSTRAINT images_standort_check TO images_old_standort_check");

  await client.query(`
    CREATE TABLE images_new (
      id text NOT NULL,
      address text NOT NULL,
      capture_date date NOT NULL,
      sequence_number integer NOT NULL,
      hash text NOT NULL,
      uuid uuid NOT NULL,
      administrative_unit_id uuid,
      region_id uuid,
      lat double precision,
      lng double precision,
      main_location text,
      secondary_locations text[],
      tags text[],
      user_tags text[],
      web_visible boolean,
      web_ranking integer,
      print_visible boolean,
      print_ranking integer,
      uploaded_by uuid NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT images_pkey PRIMARY KEY (id),
      CONSTRAINT images_uuid_unique UNIQUE (uuid),
      CONSTRAINT images_administrative_unit_id_administrative_units_id_fk
        FOREIGN KEY (administrative_unit_id) REFERENCES administrative_units(id) ON DELETE RESTRICT,
      CONSTRAINT images_region_id_regions_id_fk
        FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE RESTRICT,
      CONSTRAINT images_uploaded_by_users_id_fk
        FOREIGN KEY (uploaded_by) REFERENCES users(id),
      CONSTRAINT images_standort_check
        CHECK ((administrative_unit_id IS NULL) <> (region_id IS NULL))
    )
  `);

  await client.query(`
    INSERT INTO images_new (${NEW_COLUMNS.join(", ")})
    SELECT ${NEW_COLUMNS.join(", ")} FROM images_old
  `);

  const after = await client.query("select count(*)::int as count from images_new");
  const afterCount = after.rows[0].count;
  if (afterCount !== beforeCount) {
    throw new Error(`Zeilenanzahl stimmt nicht überein: vorher ${beforeCount}, in images_new ${afterCount}.`);
  }

  await client.query("DROP TABLE images_old");
  await client.query("ALTER TABLE images_new RENAME TO images");
  await client.query("ALTER TABLE images ENABLE ROW LEVEL SECURITY");

  await client.query("COMMIT");
  console.log(`Umbau abgeschlossen, ${afterCount} Zeilen übernommen.`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Umbau FEHLGESCHLAGEN, Rollback ausgeführt:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
