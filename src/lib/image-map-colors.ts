import { getChildLevel, pathToRoot, type AdministrativeLevel, type AdministrativeUnit } from "@/lib/administrative-units";
import type { Region } from "@/lib/regions";
import type { StandortRef } from "@/lib/standort";

/** Wenn resolveImageColor null liefert (keine Zuordnung/kein Vorfahre bei der
 * Ziel-Ebene) — dieselbe Farbe für Karten-Marker (images-map-view.tsx) UND
 * den Standort-Punkt auf Kachel/Preview (image-map-dot.tsx), damit beide
 * Darstellungen konsistent bleiben. */
export const FALLBACK_MARKER_COLOR = "#9ca3af";

/**
 * Eigenes Modul statt in administrative-units.ts: würde einen Zirkelimport
 * erzeugen (regions.ts importiert bereits aus administrative-units.ts, hier
 * wird zusätzlich Region gebraucht).
 *
 * Farblogik für die Kartenansicht auf /images (User-Vorgabe): die
 * Marker-Farbe richtet sich nach der Ebene, die AKTUELL im Standort-Filter
 * ausgewählt ist — nicht nach der Ebene, der das einzelne Bild selbst
 * zugeordnet ist. Ist Ebene X ausgewählt, wird die Farbe der nächsttieferen
 * Ebene (X's Kind-Ebene) verwendet; bei "area" (tiefste Ebene) gibt es keine
 * tiefere Ebene mehr, dort wird area selbst verwendet. Ohne Auswahl gilt
 * derselbe Basisfall wie bei "area ausgewählt" (Default: area), damit die
 * Voll-Ansicht weiterhin die volle Farbvielfalt zeigt statt einer einzigen
 * Farbe für alle Bilder.
 */
export function resolveTargetLevel(
  standort: StandortRef | null,
  units: AdministrativeUnit[],
  regions: Region[]
): AdministrativeLevel {
  const level: AdministrativeLevel = !standort
    ? "area"
    : standort.type === "unit"
      ? (units.find((unit) => unit.id === standort.id)?.level ?? "area")
      : (regions.find((region) => region.id === standort.id)?.homeLevel ?? "area");

  return level === "area" ? "area" : (getChildLevel(level) ?? "area");
}

export interface ImageStandortRef {
  administrativeUnitId: string | null;
  regionId: string | null;
}

/**
 * Farbe für ein einzelnes Bild bei der aktuell berechneten Ziel-Ebene
 * (siehe resolveTargetLevel). Ein Bild mit regionId hat keine eigene
 * Ebenen-Hierarchie zum Durchwandern — es verwendet direkt die (flache)
 * Farbe seiner Region, unabhängig von targetLevel. Ein Bild mit
 * administrativeUnitId läuft seine Vorfahrenkette hoch (pathToRoot) bis zur
 * Ziel-Ebene; ist es gröber zugeordnet als die Ziel-Ebene (kein Vorfahre auf
 * genau dieser Ebene vorhanden — z.B. Ziel = Katastralgemeinde, Bild hängt
 * nur auf Gemeinde-Ebene ohne feinere Zuordnung), fällt es auf die Farbe
 * seiner eigenen, tatsächlich zugeordneten Einheit zurück.
 */
export function resolveImageColor(
  location: ImageStandortRef,
  targetLevel: AdministrativeLevel,
  unitsById: Map<string, AdministrativeUnit>,
  regionsById: Map<string, Region>
): string | null {
  if (location.regionId) {
    return regionsById.get(location.regionId)?.color ?? null;
  }
  if (!location.administrativeUnitId) return null;

  const chain = pathToRoot(location.administrativeUnitId, unitsById);
  const ancestorAtTarget = chain.map((id) => unitsById.get(id)).find((unit) => unit?.level === targetLevel);
  return ancestorAtTarget?.color ?? unitsById.get(location.administrativeUnitId)?.color ?? null;
}
