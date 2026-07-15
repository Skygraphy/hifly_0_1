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

export interface AdministrativeUnit {
  id: string;
  parentId: string | null;
  level: AdministrativeLevel;
  code: string;
  name: string;
  shortName: string | null;
  color: string | null;
}

export function groupByParent(units: AdministrativeUnit[]): Map<string | null, AdministrativeUnit[]> {
  const map = new Map<string | null, AdministrativeUnit[]>();
  for (const unit of units) {
    const siblings = map.get(unit.parentId) ?? [];
    siblings.push(unit);
    map.set(unit.parentId, siblings);
  }
  return map;
}

/**
 * Pfad von der Wurzel bis unitId (root zuerst). Leeres Array, wenn unitId
 * leer ist oder nicht (mehr) existiert (z.B. zwischenzeitlich gelöscht) —
 * Aufrufer fällt dann auf den Auswahl-Picker zurück statt abzustürzen.
 */
export function pathToRoot(unitId: string, byId: Map<string, AdministrativeUnit>): string[] {
  if (!unitId) return [];
  const path: string[] = [];
  let current = byId.get(unitId);
  while (current) {
    path.unshift(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
