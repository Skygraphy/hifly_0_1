// Übernimmt die Gebiets-Farben aus image_data/colors.ts in die Spalte
// administrative_units.color — ausschließlich für Zeilen mit level = 'area'.
// colors.ts ist Browser-Code (referenziert `window`), kann also nicht direkt
// importiert/ausgeführt werden — die Datei wird stattdessen als Text
// geparst: zuerst die vier Farb-Konstanten (green/blue/orange/pink), dann die
// ["<Buchstabe>", <farbvariable>]-Paare, daraus ergibt sich Buchstabe -> Hex.
//
// Standardmäßig ein Dry-Run (zeigt nur, was sich ändern würde). Erst mit
// --apply wird tatsächlich in die DB geschrieben.
//
// Usage: node scripts/apply-area-colors-from-file.mjs [--apply]
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const APPLY = process.argv.includes("--apply");

function parseColorsFile(source) {
  const constDefs = new Map();
  for (const match of source.matchAll(/const\s+(\w+)\s*=\s*"([^"]*)";/g)) {
    const [, name, rawValue] = match;
    constDefs.set(name, rawValue.trim());
  }

  const letterToColor = new Map();
  for (const match of source.matchAll(/\[\s*"([A-Za-z])"\s*,\s*(\w+)\s*\]/g)) {
    const [, letter, varName] = match;
    const color = constDefs.get(varName);
    if (!color) {
      throw new Error(`Farbvariable "${varName}" für Buchstabe "${letter}" nicht in den const-Definitionen gefunden.`);
    }
    letterToColor.set(letter.toUpperCase(), color);
  }

  if (letterToColor.size === 0) {
    throw new Error("Keine ['<Buchstabe>', <farbvariable>]-Paare in colors.ts gefunden.");
  }

  return letterToColor;
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const colorsPath = path.resolve("image_data/colors.ts");
  const source = await readFile(colorsPath, "utf8");
  const letterToColor = parseColorsFile(source);
  console.log(`${letterToColor.size} Farben aus ${colorsPath} gelesen:`, Object.fromEntries(letterToColor));

  await client.connect();

  const { rows: areaUnits } = await client.query(
    `SELECT id, code, name, color FROM administrative_units WHERE level = 'area' ORDER BY code`
  );
  console.log(`\n${areaUnits.length} administrative_units mit level = 'area' gefunden.`);

  const toUpdate = [];
  const unmatched = [];
  for (const unit of areaUnits) {
    const newColor = letterToColor.get(unit.code.toUpperCase());
    if (!newColor) {
      unmatched.push(unit);
      continue;
    }
    if (unit.color !== newColor) {
      toUpdate.push({ ...unit, newColor });
    }
  }

  console.log(`\nÄnderungen (${toUpdate.length}):`);
  for (const u of toUpdate) {
    console.log(`  ${u.code} (${u.name}): "${u.color ?? "—"}" -> "${u.newColor}"`);
  }
  if (unmatched.length > 0) {
    console.log(`\nOhne Treffer in colors.ts (${unmatched.length}, bleiben unverändert):`);
    for (const u of unmatched) {
      console.log(`  ${u.code} (${u.name})`);
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
