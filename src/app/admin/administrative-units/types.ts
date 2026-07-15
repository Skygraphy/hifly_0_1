import type { AdministrativeLevel, AdministrativeUnit } from "@/lib/administrative-units";
import type { Region } from "@/lib/regions";

export type FormState =
  | { mode: "create"; parentId: string | null; level: AdministrativeLevel; replaceIndex: number }
  | { mode: "edit"; unit: AdministrativeUnit };

/**
 * Ziel für CreateColumnRegionDialog/RegionFormDialog: die Geschwister-
 * Einheiten EINER Spalte/eines Segments, die als Verknüpfungs-Kandidaten
 * angeboten werden — siehe Kommentar bei setRegionUnitsWithinScope in
 * region-actions.ts. parentId ist zugleich die homeParentId, unter der eine
 * hier neu angelegte Region dauerhaft gespeichert wird (siehe
 * regions.homeParentId in src/db/schema.ts).
 */
export interface ColumnRegionsTarget {
  parentId: string | null;
  candidateUnits: AdministrativeUnit[];
  level: AdministrativeLevel;
}

/** Ziel für RegionFormDialog: die zu bearbeitende Region PLUS die
 * Spalte/das Segment, dessen Zeile angeklickt wurde (bestimmt die
 * candidateUnits für die Verknüpfungs-Checkboxen). */
export interface EditRegionTarget extends ColumnRegionsTarget {
  region: Region;
}
