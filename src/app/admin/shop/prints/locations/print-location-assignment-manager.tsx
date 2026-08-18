"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdministrativeUnitColumnsView } from "@/components/administrative-unit-columns-view";
import { groupByParent, type AdministrativeUnit } from "@/lib/administrative-units";
import { groupRegionsByHome, type Region } from "@/lib/regions";
import type { StandortRef } from "@/lib/standort";
import { setShopLocationPrintFormatAssignment } from "./actions";
import { showAppAlert } from "@/lib/app-alert";
import type { ShopPrintFormat, ShopPrintQuality } from "@/lib/shop";

interface LocationAssignmentRow {
  administrativeUnitId: string | null;
  regionId: string | null;
  printFormatId: string;
  printQualityId: string;
}

function firstLeafPath(startUnit: AdministrativeUnit, byParent: Map<string | null, AdministrativeUnit[]>): string[] {
  const path: string[] = [];
  let current: AdministrativeUnit | undefined = startUnit;
  while (current) {
    path.push(current.id);
    const children: AdministrativeUnit[] = byParent.get(current.id) ?? [];
    current = children[0];
  }
  return path;
}

function standortKey(standort: StandortRef): string {
  return `${standort.type}:${standort.id}`;
}

/**
 * Format-Zuordnung je Verwaltungseinheit/Region (super_admin, siehe
 * shop_location_print_format_assignments in src/db/schema.ts) — gleiches
 * Baum-Navigations-Muster wie ShopLocationAssignmentManager
 * (src/app/admin/shop/packages/locations/shop-location-assignment-manager.tsx),
 * aber KEIN Single-Select pro Format: ein Format kann hier gleichzeitig in
 * mehreren Druckqualitäten verfügbar sein (auf Wunsch des Users, z.B. "A5
 * sowohl in Fotopapier als auch Premium-Fotopapier"). Pro Format daher eine
 * Checkbox je Qualität statt einer einzelnen Auswahl — jede Checkbox
 * schaltet unabhängig genau ein (Standort, Format, Qualität)-Tripel.
 */
export function PrintLocationAssignmentManager({
  units,
  regions,
  formats,
  qualities,
  assignments,
}: {
  units: AdministrativeUnit[];
  regions: Region[];
  formats: ShopPrintFormat[];
  qualities: ShopPrintQuality[];
  assignments: LocationAssignmentRow[];
}) {
  const router = useRouter();
  const [assignmentByKey, setAssignmentByKey] = useState(() => {
    const map = new Map<string, Map<string, Set<string>>>();
    for (const row of assignments) {
      const key = row.administrativeUnitId ? `unit:${row.administrativeUnitId}` : `region:${row.regionId}`;
      const byFormat = map.get(key) ?? new Map<string, Set<string>>();
      const qualitySet = byFormat.get(row.printFormatId) ?? new Set<string>();
      qualitySet.add(row.printQualityId);
      byFormat.set(row.printFormatId, qualitySet);
      map.set(key, byFormat);
    }
    return map;
  });
  const [isPending, startTransition] = useTransition();

  const byParent = useMemo(() => groupByParent(units), [units]);
  const byId = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const regionsByParentId = useMemo(() => groupRegionsByHome(regions), [regions]);
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);

  const [path, setPath] = useState<string[]>(() => {
    const roots = byParent.get(null) ?? [];
    return roots.length > 0 ? firstLeafPath(roots[0], byParent) : [];
  });
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const pathUnits = path.map((id) => byId.get(id)).filter((unit): unit is AdministrativeUnit => Boolean(unit));

  const standort: StandortRef | null = selectedRegionId
    ? { type: "region", id: selectedRegionId }
    : path.length > 0
      ? { type: "unit", id: path[path.length - 1] }
      : null;

  const selectedName = selectedRegionId
    ? (regionById.get(selectedRegionId)?.name ?? "")
    : (pathUnits[pathUnits.length - 1]?.name ?? "");

  function handleQualityToggle(printFormatId: string, printQualityId: string, available: boolean) {
    if (!standort) return;
    const key = standortKey(standort);
    setAssignmentByKey((prev) => {
      const next = new Map(prev);
      const byFormat = new Map(next.get(key) ?? []);
      const qualitySet = new Set(byFormat.get(printFormatId) ?? []);
      if (available) qualitySet.add(printQualityId);
      else qualitySet.delete(printQualityId);
      byFormat.set(printFormatId, qualitySet);
      next.set(key, byFormat);
      return next;
    });
    startTransition(async () => {
      const result = await setShopLocationPrintFormatAssignment(standort, printFormatId, printQualityId, available);
      if (!result.success) {
        showAppAlert(result.error ?? "Änderung fehlgeschlagen.");
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <AdministrativeUnitColumnsView
        pathUnits={pathUnits}
        byParent={byParent}
        onSelect={(levelIndex, unitId) => {
          setPath([...path.slice(0, levelIndex), unitId]);
          setSelectedRegionId(null);
        }}
        regionsByParentId={regionsByParentId}
        onSelectRegion={(regionId) => setSelectedRegionId(regionId)}
        selectedRegionId={selectedRegionId ?? undefined}
      />

      {standort ? (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium" data-testid="print-location-assignment-selected-name">
            Format-Zuordnung — {selectedName}
          </h2>
          <div className="flex flex-col gap-3">
            {formats.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Formate angelegt.</p>}
            {qualities.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Druckqualitäten angelegt.</p>}
            {formats.map((format) => {
              const currentQualityIds = assignmentByKey.get(standortKey(standort))?.get(format.id) ?? new Set<string>();
              return (
                <div key={format.id} className="flex items-center justify-between gap-4">
                  <span className="text-sm">{format.name}</span>
                  <div className="flex flex-wrap items-center gap-3">
                    {qualities.map((quality) => (
                      <label key={quality.id} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          // dark:[color-scheme:dark]: ohne das rendert der
                          // Browser den NICHT angehakten Kasten mit seinem
                          // Standard-Formularfeld-Rendering (helles Weiß),
                          // unabhängig von accent-color (das färbt nur den
                          // angehakten Zustand) — color-scheme:dark weist
                          // native Formularelemente an, sich am dunklen
                          // Farbschema zu orientieren (dunkler Kasten statt
                          // Weiß), nur im Dark-Theme dieser App aktiv.
                          className="size-3.5 shrink-0 cursor-pointer accent-primary dark:[color-scheme:dark]"
                          data-testid={`print-location-format-${format.id}-quality-${quality.id}`}
                          disabled={isPending}
                          checked={currentQualityIds.has(quality.id)}
                          onChange={(event) => handleQualityToggle(format.id, quality.id, event.target.checked)}
                        />
                        {quality.name}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Wähle links eine Einheit oder Region aus.</p>
      )}
    </div>
  );
}
