// Legt die 4 Start-Druckformate (A5..A2) + 3 Start-Druckqualitäten an
// (idempotent, sicher erneut ausführbar — ON CONFLICT(name) DO NOTHING).
// Befüllt anders als seed-shop-packages.mjs GLEICH ALLE 12 Preis-
// Kombinationen: der User hat explizit einen vollständigen Preisvorschlag
// angefordert (statt nur einer einzelnen Kategorie wie beim Pakete-Seed).
// Maße nach DIN 476, Preise sind DACH-Richtwerte für Luftbild-/Fine-Art-
// Drucke — im Admin-UI danach frei änderbar.
//
// Usage: node scripts/seed-shop-prints.mjs
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const FORMATS = [
  {
    name: "A5",
    description: "<p>Kompaktes Format für Schreibtisch oder Regal — passt in jeden handelsüblichen A5-Bilderrahmen.</p>",
    widthCm: 14.8,
    heightCm: 21.0,
    sortOrder: 1,
  },
  {
    name: "A4",
    description: "<p>Klassisches Format für Ordner, Mappen oder als dezentes Wandbild im Büro.</p>",
    widthCm: 21.0,
    heightCm: 29.7,
    sortOrder: 2,
  },
  {
    name: "A3",
    description: "<p>Deutlich mehr Wandpräsenz als A4 — beliebt als Poster oder besonderes Geschenk.</p>",
    widthCm: 29.7,
    heightCm: 42.0,
    sortOrder: 3,
  },
  {
    name: "A2",
    description: "<p>Großformat für den echten Blickfang — ideal für Wohnzimmer, Empfangsbereiche oder Ausstellungen.</p>",
    widthCm: 42.0,
    heightCm: 59.4,
    sortOrder: 4,
  },
];

const QUALITIES = [
  {
    name: "Fotopapier",
    description: "<p>Klassisches Fotopapier, glänzend oder matt — die günstige Einstiegsvariante für den Alltag.</p>",
    sortOrder: 1,
  },
  {
    name: "Premium-Fotopapier",
    description: "<p>Dickeres, hochwertigeres Fotopapier mit satteren Farben und längerer Haltbarkeit.</p>",
    sortOrder: 2,
  },
  {
    name: "Leinwand",
    description: "<p>Galerie-Keilrahmen aus Leinwand — kein Rahmen nötig, wirkt wie ein Kunstwerk direkt an der Wand.</p>",
    sortOrder: 3,
  },
];

// [formatName][qualityName] -> Cent.
const PRICES = {
  A5: { Fotopapier: 1290, "Premium-Fotopapier": 1990, Leinwand: 3490 },
  A4: { Fotopapier: 1990, "Premium-Fotopapier": 2990, Leinwand: 4990 },
  A3: { Fotopapier: 3490, "Premium-Fotopapier": 4990, Leinwand: 7990 },
  A2: { Fotopapier: 5990, "Premium-Fotopapier": 8490, Leinwand: 12990 },
};

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  for (const format of FORMATS) {
    await client.query(
      `INSERT INTO shop_print_formats (name, description, width_cm, height_cm, sort_order) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO NOTHING`,
      [format.name, format.description, format.widthCm, format.heightCm, format.sortOrder]
    );
    // Nachtrag für bereits (vor Einführung der description-Spalte) angelegte
    // Formate — überschreibt nie eine bereits vom super_admin gesetzte
    // Beschreibung.
    await client.query(`UPDATE shop_print_formats SET description = $1 WHERE name = $2 AND description IS NULL`, [
      format.description,
      format.name,
    ]);
  }
  console.log(`Druckformate ok: ${FORMATS.map((f) => f.name).join(", ")}`);

  for (const quality of QUALITIES) {
    await client.query(
      `INSERT INTO shop_print_qualities (name, description, sort_order) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      [quality.name, quality.description, quality.sortOrder]
    );
    await client.query(`UPDATE shop_print_qualities SET description = $1 WHERE name = $2 AND description IS NULL`, [
      quality.description,
      quality.name,
    ]);
  }
  console.log(`Druckqualitäten ok: ${QUALITIES.map((q) => q.name).join(", ")}`);

  const { rows: formatRows } = await client.query("SELECT id, name FROM shop_print_formats");
  const { rows: qualityRows } = await client.query("SELECT id, name FROM shop_print_qualities");

  for (const format of formatRows) {
    for (const quality of qualityRows) {
      const priceCents = PRICES[format.name]?.[quality.name];
      if (priceCents === undefined) continue; // unbekannte Kombination (z.B. später vom Admin ergänzte Namen) — überspringen statt raten.

      await client.query(
        `INSERT INTO shop_print_format_prices (print_format_id, print_quality_id, price_cents) VALUES ($1, $2, $3)
         ON CONFLICT (print_format_id, print_quality_id) DO NOTHING`,
        [format.id, quality.id, priceCents]
      );
    }
  }
  console.log("Preis-Matrix befüllt (12 Kombinationen, sofern Namen unverändert).");
} catch (err) {
  console.error("Seed fehlgeschlagen:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
