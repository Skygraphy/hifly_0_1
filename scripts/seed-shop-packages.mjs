// Legt die 3 Start-Pakete + 5 Start-Kategorien (A–E) an (idempotent, sicher
// erneut ausführbar — Pakete/Kategorien per ON CONFLICT(name) DO NOTHING).
// Bepreist wird dabei NUR die mittlere Kategorie (C) mit den vom User
// genannten Startpreisen — die übrigen Kategorien bleiben absichtlich
// unbepreist (kein Preis-Eintrag), bis der super_admin sie im Admin-UI
// selbst befüllt.
//
// Usage: node scripts/seed-shop-packages.mjs
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

// Pixel-Maße unten sind KEINE Schätzung, sondern aus den tatsächlichen S3-
// Dateien eines Beispielordners ausgelesen (small.jpg/medium.jpg/large.jpg
// per sharp; original.dng per manuellem TIFF-IFD-Parser, da die volle
// Sensorauflösung eines DNG in einem SubIFD [Tag 330] steckt, nicht in
// IFD0 — IFD0 ist dort nur eine 251×188px-Vorschau, sharp/exifr lesen ohne
// SubIFD-Traversal fälschlich diese). large.jpg und original.dng haben
// identische 8058×6042px (48,7 MP) — large.jpg ist ein Vollauflösungs-Export
// derselben Aufnahme. Druckgrößen sind bei 300 dpi (Fotoqualität) gerechnet:
// cm = px / 300 * 2,54.
const PACKAGES = [
  {
    name: "Web",
    description:
      "<p><strong>Für wen geeignet:</strong> Privatpersonen, die ihr Bild digital nutzen möchten.</p>" +
      "<p><strong>Was du bekommst:</strong> Die Auflösungen <em>small</em> (1920×1440 px, ca. 2,8 Megapixel) " +
      "und <em>medium</em> (4096×3071 px, ca. 12,6 Megapixel) – für die Bildschirmdarstellung gedacht: " +
      "Social Media, private Webseiten oder digitales Teilen mit Familie und Freunden. Für hochwertige Drucke " +
      "empfehlen wir das Paket „Print Private“.</p>",
    includedFiles: ["medium.jpg", "small.jpg"],
    sortOrder: 1,
    categoryCPriceCents: 1900,
  },
  {
    name: "Print Private",
    description:
      "<p><strong>Für wen geeignet:</strong> Privatpersonen, die ihr Bild ausdrucken oder verschenken möchten.</p>" +
      "<p><strong>Was du bekommst:</strong> Zusätzlich zu <em>small</em> und <em>medium</em> die große Druckdatei " +
      "<em>large</em> (8058×6042 px, ca. 48,7 Megapixel) – in Fotoqualität (300 dpi) druckbar bis ca. 68×51 cm, " +
      "also größer als DIN A2. Geeignet für Poster, Leinwandbilder oder hochwertige Drucke für den Eigenbedarf. " +
      "Ein beliebtes Geschenk für alle, die ihr Zuhause aus einer neuen Perspektive sehen möchten.</p>",
    includedFiles: ["large.jpg", "medium.jpg", "small.jpg"],
    sortOrder: 2,
    categoryCPriceCents: 3900,
  },
  {
    name: "Business Premium",
    description:
      "<p><strong>Für wen geeignet:</strong> Firmen, Immobilienmakler, Weingüter, Hotels, Gastronomie, Medien " +
      "und alle mit gewerblichem Nutzungsbedarf.</p>" +
      "<p><strong>Was du bekommst:</strong> Alle JPG-Auflösungen (small, medium, large) sowie zusätzlich die " +
      "Rohdatei im <em>DNG</em>-Format – native Sensorauflösung 8058×6042 px (ca. 48,7 Megapixel), aufgenommen " +
      "mit einer professionellen Drohnenkamera. In Fotoqualität (300 dpi) druckbar bis ca. 68×51 cm (größer als " +
      "DIN A2), bei größerem Betrachtungsabstand – Poster, Leinwand – auch deutlich darüber hinaus. Die Rohdatei " +
      "erlaubt zusätzlich maximale Qualität bei der professionellen Weiterverarbeitung. Ideal für Werbematerial, " +
      "Publikationen und alle Einsatzzwecke, die höchste Bildqualität erfordern.</p>",
    includedFiles: ["original.dng", "large.jpg", "medium.jpg", "small.jpg"],
    sortOrder: 3,
    categoryCPriceCents: 11900,
  },
];

const CATEGORIES = [
  { name: "A", sortOrder: 1 },
  { name: "B", sortOrder: 2 },
  { name: "C", sortOrder: 3 },
  { name: "D", sortOrder: 4 },
  { name: "E", sortOrder: 5 },
];

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  for (const category of CATEGORIES) {
    await client.query(
      `INSERT INTO shop_package_categories (name, sort_order) VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING`,
      [category.name, category.sortOrder]
    );
  }
  console.log(`Kategorien ok: ${CATEGORIES.map((c) => c.name).join(", ")}`);

  const { rows: categoryCRows } = await client.query("SELECT id FROM shop_package_categories WHERE name = 'C'");
  const categoryCId = categoryCRows[0]?.id;
  if (!categoryCId) throw new Error("Kategorie C wurde soeben angelegt, ist aber nicht auffindbar.");

  for (const pkg of PACKAGES) {
    await client.query(
      `INSERT INTO shop_packages (name, description, included_files, sort_order) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO NOTHING`,
      [pkg.name, pkg.description, pkg.includedFiles, pkg.sortOrder]
    );
    const { rows: packageRows } = await client.query("SELECT id FROM shop_packages WHERE name = $1", [pkg.name]);
    const packageId = packageRows[0]?.id;
    if (!packageId) throw new Error(`Paket "${pkg.name}" wurde soeben angelegt, ist aber nicht auffindbar.`);

    // Falls das Paket schon VOR dieser Beschreibungs-Funktion angelegt wurde
    // (description damals noch NULL): Beschreibung einmalig nachtragen, ohne
    // eine bereits vom super_admin selbst gepflegte Beschreibung zu
    // überschreiben.
    await client.query(`UPDATE shop_packages SET description = $1 WHERE id = $2 AND description IS NULL`, [
      pkg.description,
      packageId,
    ]);

    await client.query(
      `INSERT INTO shop_package_prices (package_id, category_id, price_cents) VALUES ($1, $2, $3)
       ON CONFLICT (package_id, category_id) DO NOTHING`,
      [packageId, categoryCId, pkg.categoryCPriceCents]
    );
    console.log(`Paket ok: ${pkg.name} (Kategorie C = ${(pkg.categoryCPriceCents / 100).toFixed(2)}€)`);
  }
} catch (err) {
  console.error("Seed fehlgeschlagen:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
