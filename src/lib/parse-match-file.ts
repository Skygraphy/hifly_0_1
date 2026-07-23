// Liest die Abgleich-Datendatei ein — reines JSON (siehe
// image_data/klosterneuburg_stadt.json), entweder als Objekt mit einem
// "images"-Array oder als bare Array. Native JSON.parse, kein eigener
// Parser/new Function nötig.

export interface MatchFileEntry {
  id: string;
  hash: string;
  lat_lng: [number, number] | null;
  main_location: string | null;
  secondary_locations: string[];
  tags: string[];
  user_tags: string[];
  area: string | null;
  web_visible: boolean | null;
  web_ranking: number | null;
  print_visible: boolean | null;
  print_ranking: number | null;
  do_match: boolean;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Wandelt ein rohes, aus JSON geparstes Objekt in einen MatchFileEntry um —
 * defensiv gegenüber fehlenden/falsch typisierten Feldern (z.B. eine
 * Datei-Zeile ohne "area"), damit eine einzelne abweichende Zeile nicht den
 * gesamten Abgleich zum Absturz bringt.
 */
function normalizeEntry(raw: unknown): MatchFileEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.id !== "string" || !entry.id) return null;

  const latLng =
    Array.isArray(entry.lat_lng) &&
    entry.lat_lng.length === 2 &&
    typeof entry.lat_lng[0] === "number" &&
    typeof entry.lat_lng[1] === "number"
      ? ([entry.lat_lng[0], entry.lat_lng[1]] as [number, number])
      : null;

  return {
    id: entry.id,
    hash: typeof entry.hash === "string" ? entry.hash : "",
    lat_lng: latLng,
    main_location: typeof entry.main_location === "string" ? entry.main_location : null,
    secondary_locations: toStringArray(entry.secondary_locations),
    tags: toStringArray(entry.tags),
    user_tags: toStringArray(entry.user_tags),
    area: typeof entry.area === "string" && entry.area ? entry.area : null,
    web_visible: typeof entry.web_visible === "boolean" ? entry.web_visible : null,
    web_ranking: typeof entry.web_ranking === "number" ? entry.web_ranking : null,
    print_visible: typeof entry.print_visible === "boolean" ? entry.print_visible : null,
    print_ranking: typeof entry.print_ranking === "number" ? entry.print_ranking : null,
    do_match: entry.do_match === true,
  };
}

/**
 * `null`-Einträge (fehlende/ungültige id) werden stillschweigend
 * herausgefiltert statt den ganzen Abgleich zu blockieren — genau eine
 * kaputte Zeile soll nicht alle anderen verhindern.
 */
export function parseMatchFileImages(sourceText: string): MatchFileEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceText);
  } catch (err) {
    throw new Error(`Datei ist kein gültiges JSON: ${err instanceof Error ? err.message : "unbekannter Fehler"}`);
  }

  const rawImages = Array.isArray(parsed)
    ? parsed
    : (parsed as Record<string, unknown> | null)?.images;
  if (!Array.isArray(rawImages)) {
    throw new Error('JSON enthält kein "images"-Array.');
  }

  return rawImages.map(normalizeEntry).filter((entry): entry is MatchFileEntry => entry !== null);
}
