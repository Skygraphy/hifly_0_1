"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdministrativeUnitColumnsView } from "@/components/administrative-unit-columns-view";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { groupByParent, type AdministrativeUnit } from "@/lib/administrative-units";
import { groupRegionsByHome, type Region } from "@/lib/regions";
import type { StandortRef } from "@/lib/standort";
import { setShopLocationPackageAssignment } from "./actions";
import { showAppAlert } from "@/lib/app-alert";
import type { ShopPackage, ShopPackageCategory } from "@/lib/shop";

// Sentinel statt eines leeren Strings als Select-Wert: Base UI Select (wie
// die meisten Listbox-Implementierungen) behandelt einen leeren String
// nicht zuverlässig als eigenen, von "kein Wert" unterscheidbaren Options-
// Wert — ein eindeutiger String ist hier robuster.
const UNAVAILABLE_VALUE = "__unavailable__";

interface LocationAssignmentRow {
  administrativeUnitId: string | null;
  regionId: string | null;
  packageId: string;
  categoryId: string;
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
 * Paket-Zuordnung je Verwaltungseinheit/Region (super_admin, siehe
 * shop_location_package_assignments in src/db/schema.ts) — wiederverwendet
 * unverändert AdministrativeUnitColumnsView für die Baum-Navigation (exakt
 * das Muster von LocationGrantsManager, siehe
 * src/app/admin/users/[userId]/locations/location-grants-manager.tsx),
 * zeigt aber statt einer einzelnen Freigabe-Checkbox pro Zeile ein
 * Detail-Panel für den aktuell ausgewählten Knoten: pro Paket ein
 * Auswahlfeld mit allen Kategorien + "Nicht verfügbar". Auto-Save bei
 * Änderung + router.refresh(), gleiches Muster wie
 * handleToggleUnitGranted dort.
 */
export function ShopLocationAssignmentManager({
  units,
  regions,
  packages,
  categories,
  assignments,
}: {
  units: AdministrativeUnit[];
  regions: Region[];
  packages: ShopPackage[];
  categories: ShopPackageCategory[];
  assignments: LocationAssignmentRow[];
}) {
  const router = useRouter();
  const [assignmentByKey, setAssignmentByKey] = useState(() => {
    const map = new Map<string, Map<string, string>>();
    for (const row of assignments) {
      const key = row.administrativeUnitId ? `unit:${row.administrativeUnitId}` : `region:${row.regionId}`;
      const byPackage = map.get(key) ?? new Map<string, string>();
      byPackage.set(row.packageId, row.categoryId);
      map.set(key, byPackage);
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

  function handleCategoryChange(packageId: string, categoryId: string | null) {
    if (!standort) return;
    const key = standortKey(standort);
    setAssignmentByKey((prev) => {
      const next = new Map(prev);
      const byPackage = new Map(next.get(key) ?? []);
      if (categoryId) byPackage.set(packageId, categoryId);
      else byPackage.delete(packageId);
      next.set(key, byPackage);
      return next;
    });
    startTransition(async () => {
      const result = await setShopLocationPackageAssignment(standort, packageId, categoryId);
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
          <h2 className="mb-3 text-sm font-medium" data-testid="location-assignment-selected-name">
            Paket-Zuordnung — {selectedName}
          </h2>
          <div className="flex flex-col gap-3">
            {packages.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Pakete angelegt.</p>}
            {packages.map((pkg) => {
              const currentCategoryId = assignmentByKey.get(standortKey(standort))?.get(pkg.id) ?? "";
              const selectValue = currentCategoryId || UNAVAILABLE_VALUE;
              return (
                <div key={pkg.id} className="flex items-center justify-between gap-4">
                  <span className="text-sm">{pkg.name}</span>
                  <Select
                    value={selectValue}
                    onValueChange={(next) => handleCategoryChange(pkg.id, next === UNAVAILABLE_VALUE ? null : next)}
                    disabled={isPending}
                  >
                    <SelectTrigger data-testid={`location-package-select-${pkg.id}`} className="w-40">
                      <SelectValue>
                        {currentCategoryId
                          ? (categories.find((category) => category.id === currentCategoryId)?.name ?? currentCategoryId)
                          : "Nicht verfügbar"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNAVAILABLE_VALUE}>Nicht verfügbar</SelectItem>
                      {categories.map((category) => (
                        <SelectItem
                          key={category.id}
                          value={category.id}
                          data-testid={`location-package-select-${pkg.id}-option-${category.id}`}
                        >
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
