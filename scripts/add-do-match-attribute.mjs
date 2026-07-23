// Einmaliger Umbau: fügt jedem Eintrag in image_data/klosterneuburg_stadt.ts
// ein neues Attribut do_match: true hinzu (direkt vor der schließenden
// Klammer der Zeile) — jede Zeile im "images"-Array folgt demselben festen
// Muster ("    { id: ... print_ranking: 1 },"), daher genügt ein einfacher
// Zeilen-Ersatz statt eines vollen JS/TS-Parsers.
//
// Usage: node scripts/add-do-match-attribute.mjs
import { readFile, writeFile } from "node:fs/promises";

const filePath = new URL("../image_data/klosterneuburg_stadt.ts", import.meta.url);
const ENTRY_LINE_RE = /^(\s*\{ id: "[^"]+",.*print_ranking: \d+) \},$/;

const content = await readFile(filePath, "utf8");
const lines = content.split("\n");

let changed = 0;
const updated = lines.map((line) => {
  const match = line.match(ENTRY_LINE_RE);
  if (!match) return line;
  changed += 1;
  return `${match[1]}, do_match: true },`;
});

if (changed === 0) {
  console.error("Keine passenden Zeilen gefunden — Muster prüfen, nichts geändert.");
  process.exitCode = 1;
} else {
  await writeFile(filePath, updated.join("\n"));
  console.log(`do_match: true zu ${changed} Einträgen hinzugefügt.`);
}
