"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AdministrativeUnitColumnsView } from "@/components/administrative-unit-columns-view";
import { groupByParent, pathToRoot, type AdministrativeUnit } from "@/lib/administrative-units";
import { groupRegionsByHome, type Region } from "@/lib/regions";
import type { StandortRef } from "@/lib/standort";

/**
 * Standort-Picker fürs Bild-Upload (Batch-Default UND Einzelbild-
 * Abweichung, siehe image-upload-manager.tsx) — dieselbe Spalten-Ansicht
 * wie überall sonst, aber auf genau die für diesen admin freigegebenen
 * Einheiten/Regionen ZUGESCHNITTEN (plus die Vorfahren, die zum Navigieren
 * dorthin nötig sind) — statt den kompletten Baum mit rot markierten,
 * nicht wählbaren Zeilen zu zeigen. Für super_admin (grantedUnitIds/
 * grantedRegionIds = alle IDs, siehe getImageUploadLocationData) ergibt das
 * wieder den vollständigen, ungefilterten Baum.
 *
 * Klicks legen nur einen KANDIDATEN fest (und navigieren weiter, falls es
 * eine Einheit ist) — erst der "Übernehmen"-Button unten schließt den
 * Dialog und meldet die Auswahl. So kann man mehrere Ebenen durchklicken,
 * ohne dass schon der erste Treffer sofort übernommen wird.
 */
export function LocationPickerDialog({
  open,
  onOpenChange,
  title,
  units,
  regions,
  grantedUnitIds,
  grantedRegionIds,
  initialStandort,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  units: AdministrativeUnit[];
  regions: Region[];
  grantedUnitIds: Set<string>;
  grantedRegionIds: Set<string>;
  initialStandort: StandortRef | null;
  onPick: (standort: StandortRef) => void;
}) {
  const byId = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);

  // Jede Freigabe zieht ihre gesamte Vorfahrenkette nach sich — ohne die
  // wäre die freigegebene Einheit in der Spalten-Navigation gar nicht erst
  // erreichbar. Freigegebene Regionen brauchen dasselbe für ihre
  // Home-Ebenen-Einheit (regionsByParentId hängt Regionen genau an DER
  // Spalte auf).
  const visibleUnitIds = useMemo(() => {
    const ids = new Set<string>();
    for (const unitId of grantedUnitIds) {
      for (const ancestorId of pathToRoot(unitId, byId)) ids.add(ancestorId);
    }
    for (const region of regions) {
      if (!grantedRegionIds.has(region.id) || !region.parentId) continue;
      for (const ancestorId of pathToRoot(region.parentId, byId)) ids.add(ancestorId);
    }
    return ids;
  }, [grantedUnitIds, grantedRegionIds, regions, byId]);

  const visibleUnits = useMemo(() => units.filter((unit) => visibleUnitIds.has(unit.id)), [units, visibleUnitIds]);
  const visibleRegions = useMemo(
    () => regions.filter((region) => grantedRegionIds.has(region.id)),
    [regions, grantedRegionIds]
  );

  const byParent = useMemo(() => groupByParent(visibleUnits), [visibleUnits]);
  const regionsByParentId = useMemo(() => groupRegionsByHome(visibleRegions), [visibleRegions]);

  // Beim erneuten Öffnen mit einem bereits gesetzten Standort (Pencil-Icon
  // auf einer Zeile mit vorhandenem Wert) soll die Spalten-Navigation direkt
  // dorthin aufgeklappt sein statt wieder bei "Bund" zu starten — bei einer
  // Region über deren Home-Ebenen-Einheit (regionsByParentId hängt sie
  // genau dort auf), bei einer Einheit direkt über ihre eigene Kette.
  function initialPathFor(standort: StandortRef | null): string[] {
    if (standort?.type === "unit") return pathToRoot(standort.id, byId);
    if (standort?.type === "region") {
      const homeParentId = regionById.get(standort.id)?.parentId;
      if (homeParentId) return pathToRoot(homeParentId, byId);
    }
    return [];
  }

  const [path, setPath] = useState<string[]>(() => initialPathFor(initialStandort));
  const [candidate, setCandidate] = useState<StandortRef | null>(initialStandort);

  // Dieselbe Dialog-Instanz wird für Batch- UND jede Einzelbild-Zeile
  // wiederverwendet (siehe image-upload-manager.tsx) — ohne dieses Reset
  // bliebe beim erneuten Öffnen für einen anderen Ordner die Navigation
  // und der Kandidat vom letzten Mal stehen.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPath(initialPathFor(initialStandort));
      setCandidate(initialStandort);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pathUnits = path.map((id) => byId.get(id)).filter((unit): unit is AdministrativeUnit => Boolean(unit));

  function handleSelect(levelIndex: number, unitId: string) {
    // Immer navigieren (eine freigegebene Einheit kann unterhalb einer nur
    // zur Navigation sichtbaren Vorfahren-Einheit liegen). Ein bestehender
    // Kandidat gilt nur, solange der Pfad noch zu ihm führt — jeder Klick
    // ersetzt ihn daher entweder durch die neu getroffene freigegebene
    // Einheit ODER verwirft ihn (null), wenn die Einheit selbst nicht
    // freigegeben ist. Sonst bliebe der Übernehmen-Button nach dem
    // Zurückgehen auf eine Vorfahren-Ebene fälschlich mit dem alten,
    // inzwischen verlassenen Kandidaten aktiv.
    setPath([...path.slice(0, levelIndex), unitId]);
    setCandidate(grantedUnitIds.has(unitId) ? { type: "unit", id: unitId } : null);
  }

  function handleSelectRegion(regionId: string) {
    setCandidate({ type: "region", id: regionId });
  }

  function handleConfirm() {
    if (!candidate) return;
    onPick(candidate);
    onOpenChange(false);
  }

  const candidateLabel = candidate
    ? candidate.type === "unit"
      ? (byId.get(candidate.id)?.name ?? "Unbekannt")
      : (regionById.get(candidate.id)?.name ?? "Unbekannt")
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-6xl flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto">
          <AdministrativeUnitColumnsView
            pathUnits={pathUnits}
            byParent={byParent}
            onSelect={handleSelect}
            regionsByParentId={regionsByParentId}
            onSelectRegion={handleSelectRegion}
            selectedRegionId={candidate?.type === "region" ? candidate.id : undefined}
            hideEmptyTrailingColumn
          />
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {candidateLabel ? `Ausgewählt: ${candidateLabel}` : "Noch kein freigegebener Standort ausgewählt."}
          </span>
          <Button type="button" data-testid="location-picker-confirm" disabled={!candidate} onClick={handleConfirm}>
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
