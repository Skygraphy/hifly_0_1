// Ordnername-Format: <Adresse>_<Jahr>_<Monat>_<Tag>_<Sequenz 3-stellig>_
// <Hash 6-stellig>_<UUID>, z.B.
// "Adalbert_Stifter_Gasse_2024_07_13_001_C3E2EA_0f4e99ef-3261-416e-9de5-aa8223857b91".
// Adresse ist der variable Teil (kann selbst Unterstriche enthalten), daher
// am Ende verankert — Datum/Sequenz/Hash/UUID haben ein festes Format und
// werden von hinten weg abgeschnitten, der Rest davor ist die Adresse.
// Nummerierte statt benannte Gruppen: das Projekt-tsconfig zielt auf
// ES2017, wo TS die `groups`-Eigenschaft auf RegExpMatchArray noch nicht
// kennt (reine Typing-Einschränkung, zur Laufzeit wäre es egal) — mit
// nummerierten Gruppen kein Problem.
const FOLDER_NAME_RE =
  /^(.+)_(\d{4})_(\d{2})_(\d{2})_(\d{3})_([0-9A-Fa-f]{6})_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export interface ParsedImageFolder {
  address: string;
  /** ISO "YYYY-MM-DD", direkt für die Postgres date-Spalte verwendbar. */
  captureDate: string;
  sequenceNumber: number;
  hash: string;
  uuid: string;
}

/**
 * `null` bei nicht passendem Namensformat — Aufrufer (Upload-Seite) markiert
 * einen solchen Ordner als Fehler statt abzustürzen. Prüft NUR den
 * Ordnernamen, nicht seinen Inhalt (welche/wie viele Dateien darin liegen
 * ist beliebig, siehe src/app/admin/images/upload/page.tsx).
 */
export function parseImageFolderName(name: string): ParsedImageFolder | null {
  const match = name.match(FOLDER_NAME_RE);
  if (!match) return null;

  const [, address, year, month, day, sequence, hash, uuid] = match;
  return {
    address,
    captureDate: `${year}-${month}-${day}`,
    sequenceNumber: Number(sequence),
    hash: hash.toUpperCase(),
    uuid: uuid.toLowerCase(),
  };
}

/** Einzige Stelle, die den S3-Key aus Ordner-id + Dateiname zusammensetzt. */
export function s3KeyFor(folderId: string, filename: string): string {
  return `${folderId}/${filename}`;
}
