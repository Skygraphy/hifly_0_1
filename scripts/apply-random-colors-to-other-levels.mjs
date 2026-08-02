// Befüllt administrative_units.color für alle Ebenen AUSSER 'area' (die
// haben ihre Farbe bereits fix aus dem Buchstaben-Mapping bekommen, siehe
// scripts/apply-area-colors-from-file.mjs) mit einem zufällig gewählten Wert
// aus den vier Basisfarben in image_data/colors.ts (green/blue/orange/pink).
// colors.ts ist Browser-Code (referenziert `window`), wird also wie im
// area-Script als Text geparst statt importiert.
//
// Standardmäßig werden nur Zeilen OHNE bestehende Farbe (color IS NULL)
// befüllt — bereits gesetzte Farben bleiben unangetastet, da die Zuweisung
// zufällig ist und ein erneuter Lauf sonst nicht sinnvoll vergleichbar/
// idempotent wäre. Mit --force werden auch bereits gesetzte Farben neu
// ausgewürfelt und überschrieben — mit --code=<code> eingeschränkt auf eine
// einzelne Zeile (sonst würde --force jede bereits gesetzte Farbe neu
// auswürfeln, nicht nur die gewünschte).
//
// Standardmäßig ein Dry-Run (zeigt nur, was sich ändern würde). Erst mit
// --apply wird tatsächlich in die DB geschrieben.
//
// Usage: node scripts/apply-random-colors-to-other-levels.mjs [--apply] [--force] [--code=<code>]
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const CODE_FILTER = process.argv.find((arg) => arg.startsWith("--code="))?.slice("--code=".length) ?? null;

function parseBaseColors(source) {
  const colors = [];
  for (const match of source.matchAll(/const\s+\w+\s*=\s*"([^"]*)";/g)) {
    colors.push(match[1].trim());
  }
  if (colors.length === 0) {
    throw new Error("Keine Farb-Konstanten (const x = \"...\";) in colors.ts gefunden.");
  }
  return colors;
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const colorsPath = path.resolve("image_data/colors.ts");
  const source = await readFile(colorsPath, "utf8");
  const baseColors = parseBaseColors(source);
  console.log(`${baseColors.length} Basisfarben aus ${colorsPath} gelesen:`, baseColors);

  await client.connect();

  const { rows: units } = await client.query(
    `SELECT id, level, code, name, color FROM administrative_units WHERE level <> 'area' ORDER BY level, code`
  );
  console.log(`\n${units.length} administrative_units mit level <> 'area' gefunden.`);

  const toUpdate = [];
  const skipped = [];
  for (const unit of units) {
    const isForced = FORCE && (!CODE_FILTER || unit.code === CODE_FILTER);
    if (unit.color && !isForced) {
      skipped.push(unit);
      continue;
    }
    const newColor = baseColors[Math.floor(Math.random() * baseColors.length)];
    toUpdate.push({ ...unit, newColor });
  }

  console.log(`\nÄnderungen (${toUpdate.length}):`);
  for (const u of toUpdate) {
    console.log(`  [${u.level}] ${u.code} (${u.name}): "${u.color ?? "—"}" -> "${u.newColor}"`);
  }
  if (skipped.length > 0) {
    console.log(`\nBereits gesetzt, bleiben unangetastet ohne --force (${skipped.length}):`);
    for (const u of skipped) {
      console.log(`  [${u.level}] ${u.code} (${u.name}): "${u.color}"`);
    }
  }

  if (!APPLY) {
    console.log("\nDry-Run — keine Änderungen geschrieben. Mit --apply erneut ausführen, um zu übernehmen.");
  } else {
    for (const u of toUpdate) {
      await client.query(`UPDATE administrative_units SET color = $1, updated_at = now() WHERE id = $2`, [
        u.newColor,
        u.id,
      ]);
    }
    console.log(`\n${toUpdate.length} Zeile(n) aktualisiert.`);
  }
} catch (err) {
  console.error("Fehlgeschlagen:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
