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
  /** Bund-Ebene ist immer true (serverseitig erzwungen). Nicht freigegebene
   * Einheiten UND ihr gesamter Unterbaum sind öffentlich unsichtbar — siehe
   * filterPublishedUnits. */
  published: boolean;
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

/**
 * Kaskadierende Freigabe-Filterung für die öffentliche Anzeige: eine Einheit
 * bleibt nur erhalten, wenn sie SELBST und ihre GESAMTE Vorfahrenkette
 * published sind — eine nicht freigegebene Einheit blockiert damit auch
 * ihren gesamten (ggf. selbst freigegebenen) Unterbaum, analog dazu, dass
 * man im Picker ja ohnehin nicht an ihr vorbeiklicken kann. Einzige Stelle
 * mit dieser Kaskaden-Logik — pathToRoot/groupByParent/groupRegionsByParent
 * bekommen danach nur noch eine bereits bereinigte Liste und brauchen keine
 * eigene Behandlung von Lücken im Baum (sie tolerieren das ohnehin, siehe
 * pathToRoot oben, aber nur unter der Annahme, dass fehlende Knoten immer
 * einen kompletten Unterbaum betreffen, nie einen Knoten mittendrin — genau
 * das garantiert diese Funktion).
 *
 * Generisch über T statt fest auf AdministrativeUnit: der Deep-Link-Resolver
 * ([unitId]/page.tsx) braucht für denselben Kaskaden-Check nur id/parentId/
 * published, nicht den vollen Datensatz.
 */
export function filterPublishedUnits<T extends Pick<AdministrativeUnit, "id" | "parentId" | "published">>(
  units: T[]
): T[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));

  function isVisible(unit: T): boolean {
    if (!unit.published) return false;
    if (unit.parentId === null) return true;
    const parent = byId.get(unit.parentId);
    return parent ? isVisible(parent) : false;
  }

  return units.filter(isVisible);
}
