// Einmaliger Umbau: liest image_data/klosterneuburg_stadt.ts (TS/JS-Modul,
// unquoted keys) ein und schreibt denselben Inhalt als
// image_data/klosterneuburg_stadt.json (base_region_path, area_letters,
// images) — danach kann die App die Datei nativ über JSON.parse einlesen,
// ohne eigenen Parser/new Function (siehe src/lib/parse-match-file.ts).
// Das .ts-Original wird anschließend gelöscht, die .json ist die neue
// kanonische Quelle.
//
// Usage: node scripts/convert-image-data-to-json.mjs
import { readFile, writeFile, rm } from "node:fs/promises";

const tsPath = new URL("../image_data/klosterneuburg_stadt.ts", import.meta.url);
const jsonPath = new URL("../image_data/klosterneuburg_stadt.json", import.meta.url);

function findMatchingArrayEnd(source, startIndex) {
  let index = source.indexOf("[", startIndex);
  if (index === -1) throw new Error(`Kein Array-Literal ab Position ${startIndex} gefunden.`);
  let depth = 0;
  let inString = null;
  for (; index < source.length; index++) {
    const char = source[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") inString = char;
    else if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Schließendes ] nicht gefunden.");
}

function extractArray(source, exportName) {
  const marker = source.match(new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*`));
  if (!marker || marker.index === undefined) {
    throw new Error(`"export const ${exportName} =" nicht gefunden.`);
  }
  const searchFrom = marker.index + marker[0].length - 1;
  const start = source.indexOf("[", searchFrom);
  const end = findMatchingArrayEnd(source, searchFrom);
  const literal = source.slice(start, end + 1);
  return new Function(`"use strict"; return (${literal});`)();
}

const source = await readFile(tsPath, "utf8");
const images = extractArray(source, "images");
const baseRegionPath = extractArray(source, "BASE_REGION_PATH");
const areaLetters = extractArray(source, "AREA_LETTERS");

// Ein JSON-Objekt pro Bild-Zeile (statt vollständigem JSON.stringify mit
// indent) — hält dieselbe kompakte, diff-freundliche Zeilen-pro-Eintrag-
// Optik wie das bisherige .ts-File bei über 1000 Einträgen.
const imagesLines = images.map((entry) => `    ${JSON.stringify(entry)}`).join(",\n");
const json = `{
  "base_region_path": ${JSON.stringify(baseRegionPath)},
  "area_letters": ${JSON.stringify(areaLetters)},
  "images": [
${imagesLines}
  ]
}
`;

// Validieren, dass das Ergebnis tatsächlich gültiges JSON ist, bevor die
// alte Datei gelöscht wird.
const parsed = JSON.parse(json);
if (parsed.images.length !== images.length) {
  throw new Error("Anzahl der images-Einträge stimmt nach der Konvertierung nicht überein.");
}

await writeFile(jsonPath, json);
await rm(tsPath);
console.log(`${images.length} Einträge nach ${jsonPath.pathname} geschrieben, ${tsPath.pathname} gelöscht.`);
