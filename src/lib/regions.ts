import { pathToRoot, type AdministrativeLevel, type AdministrativeUnit } from "@/lib/administrative-units";

export interface Region {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  /** Die Spalte/Ebene, in der die Region admin-seitig angelegt wurde —
   * unveränderlich danach (siehe src/db/schema.ts). null = Bund-Ebene. */
  parentId: string | null;
  homeLevel: AdministrativeLevel;
  /** Nur veröffentlichte Regionen erscheinen öffentlich (Picker/Deep-Link) —
   * bereits serverseitig gefiltert, siehe getStandortPickerData. Im Admin-
   * Bereich (groupRegionsByHome) sind auch unveröffentlichte enthalten. */
  published: boolean;
}

export interface RegionAdministrativeUnitLink {
  regionId: string;
  administrativeUnitId: string;
}

/**
 * Ordnet jede Region GENAU EINEM Schlüssel zu: der niedrigsten Ebene, die
 * alle ihre verknüpften Einheiten gemeinsam abdeckt (niedrigster gemeinsamer
 * Vorfahre der Eltern der verknüpften Einheiten). Eine Region mit nur einer
 * verknüpften Einheit (oder mehreren mit demselben Elternknoten, wie
 * "Wachau" unter Krems-Land + Melk) erscheint als Geschwister dieser
 * Einheit(en) — in der Spalte, die deren Elternknoten auflistet. Eine
 * Region mit Einheiten unter unterschiedlichen Eltern (z.B. "Hohe Tauern"
 * unter Salzburg/Tirol/Kärnten) erscheint hingegen genau EINMAL, in der
 * Spalte der niedrigsten Ebene, die diese unterschiedlichen Eltern gemeinsam
 * enthält (hier: Bundesland-Spalte, da Österreich der gemeinsame Vorfahre
 * von Salzburg/Tirol/Kärnten ist) — dort, wo man sich sonst zwischen ihnen
 * entscheiden müsste.
 */
export function groupRegionsByParent(
  units: AdministrativeUnit[],
  regions: Region[],
  links: RegionAdministrativeUnitLink[]
): Map<string | null, Region[]> {
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const regionById = new Map(regions.map((region) => [region.id, region]));

  const linkedUnitIdsByRegion = new Map<string, Set<string>>();
  for (const link of links) {
    if (!unitById.has(link.administrativeUnitId) || !regionById.has(link.regionId)) continue;
    const set = linkedUnitIdsByRegion.get(link.regionId) ?? new Set<string>();
    set.add(link.administrativeUnitId);
    linkedUnitIdsByRegion.set(link.regionId, set);
  }

  const map = new Map<string | null, Region[]>();
  for (const [regionId, unitIds] of linkedUnitIdsByRegion) {
    const region = regionById.get(regionId);
    if (!region) continue;

    const parentIds = new Set([...unitIds].map((unitId) => unitById.get(unitId)?.parentId ?? null));
    const key = lowestCommonAncestor([...parentIds], unitById);
    map.set(key, [...(map.get(key) ?? []), region]);
  }

  for (const list of map.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  return map;
}

/**
 * Admin-Gegenstück zu groupRegionsByParent: ordnet jede Region ihrer FEST
 * gespeicherten parentId zu (kein LCA über tatsächliche Verknüpfungen).
 * Zeigt eine Region dadurch immer an genau einer, unveränderlichen Stelle
 * an — im Gegensatz zur öffentlichen Anzeige/Auswahl, die weiterhin
 * ausschließlich per LCA über die tatsächlichen Verknüpfungen berechnet.
 */
export function groupRegionsByHome(regions: Region[]): Map<string | null, Region[]> {
  const map = new Map<string | null, Region[]>();
  for (const region of regions) {
    map.set(region.parentId, [...(map.get(region.parentId) ?? []), region]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "de"));
  }
  return map;
}

/**
 * Niedrigster gemeinsamer Vorfahre einer Menge von Einheiten-IDs (oder
 * null). Jede ID wird auf ihren vollständigen Pfad ab einer virtuellen
 * Wurzel (null, oberhalb von "Bund") erweitert, damit auch Eingaben ohne
 * gemeinsamen Vorfahren innerhalb der Baumdaten definiert bleiben (Ergebnis
 * dann null). Ein einzelnes Element ist trivial sein eigener LCA.
 */
function lowestCommonAncestor(
  ids: (string | null)[],
  unitById: Map<string, AdministrativeUnit>
): string | null {
  const paths = ids.map((id) => [null, ...(id ? pathToRoot(id, unitById) : [])]);
  let common: string | null = null;
  for (let i = 0; ; i++) {
    const nodeAtIndex = paths[0][i];
    if (nodeAtIndex === undefined) break;
    if (paths.some((path) => path[i] !== nodeAtIndex)) break;
    common = nodeAtIndex;
  }
  return common;
}
