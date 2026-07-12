export const ADMINISTRATIVE_LEVELS = [
  "federal",
  "state",
  "district",
  "municipality",
  "cadastral_municipality",
  "area",
] as const;

export type AdministrativeLevel = (typeof ADMINISTRATIVE_LEVELS)[number];

export const ADMINISTRATIVE_LEVEL_LABELS: Record<AdministrativeLevel, string> = {
  federal: "Bund",
  state: "Bundesland",
  district: "Bezirk",
  municipality: "Gemeinde",
  cadastral_municipality: "Katastralgemeinde",
  area: "Gebiet",
};

/**
 * Nächsttiefere Ebene, oder null bei "area" (die tiefste). Bestimmt, welche
 * Ebene ein neu angelegtes Kind bekommt — Ebene ist beim Anlegen nie frei
 * wählbar, sondern folgt zwingend aus dem Elternknoten.
 */
export function getChildLevel(level: AdministrativeLevel): AdministrativeLevel | null {
  const index = ADMINISTRATIVE_LEVELS.indexOf(level);
  return index < ADMINISTRATIVE_LEVELS.length - 1 ? ADMINISTRATIVE_LEVELS[index + 1] : null;
}
