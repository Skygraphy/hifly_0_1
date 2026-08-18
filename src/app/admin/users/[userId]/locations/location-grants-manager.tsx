"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdministrativeUnitColumnsView } from "@/components/administrative-unit-columns-view";
import { groupByParent, type AdministrativeUnit } from "@/lib/administrative-units";
import { groupRegionsByHome, type Region } from "@/lib/regions";
import { grantAdminLocation, revokeAdminLocation } from "../../actions";
import { showAppAlert } from "@/lib/app-alert";

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

/**
 * Freigabe-Verwaltung (super_admin, siehe admin_location_grants in
 * src/db/schema.ts) — eigene Seite statt Dialog (siehe page.tsx): dieselbe
 * Spalten-Ansicht wie unter /admin/administrative-units, mit voller
 * Seitenbreite, damit alle Ebenen ohne horizontales Gequetsche nebeneinander
 * passen. Freigabe- statt Veröffentlichen-Checkboxen (grantedUnitIds/
 * onToggleUnitGranted, siehe administrative-unit-columns-view.tsx). Kein
 * Kaskadieren: jede Checkbox betrifft ausschließlich genau die eine
 * Einheit/Region dieser Zeile.
 */
export function LocationGrantsManager({
  adminUserId,
  units,
  regions,
  initialGrantedUnitIds,
  initialGrantedRegionIds,
}: {
  adminUserId: string;
  units: AdministrativeUnit[];
  regions: Region[];
  initialGrantedUnitIds: string[];
  initialGrantedRegionIds: string[];
}) {
  const router = useRouter();
  const [grantedUnitIds, setGrantedUnitIds] = useState(() => new Set(initialGrantedUnitIds));
  const [grantedRegionIds, setGrantedRegionIds] = useState(() => new Set(initialGrantedRegionIds));
  const [, startTransition] = useTransition();

  const byParent = useMemo(() => groupByParent(units), [units]);
  const byId = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const regionsByParentId = useMemo(() => groupRegionsByHome(regions), [regions]);

  const [path, setPath] = useState<string[]>(() => {
    const roots = byParent.get(null) ?? [];
    return roots.length > 0 ? firstLeafPath(roots[0], byParent) : [];
  });
  const pathUnits = path.map((id) => byId.get(id)).filter((unit): unit is AdministrativeUnit => Boolean(unit));

  function handleToggleUnitGranted(unit: AdministrativeUnit, granted: boolean) {
    setGrantedUnitIds((prev) => {
      const next = new Set(prev);
      if (granted) next.add(unit.id);
      else next.delete(unit.id);
      return next;
    });
    startTransition(async () => {
      const result = granted
        ? await grantAdminLocation(adminUserId, { type: "unit", id: unit.id })
        : await revokeAdminLocation(adminUserId, { type: "unit", id: unit.id });
      if (!result.success) {
        showAppAlert(result.error ?? "Änderung fehlgeschlagen.");
      }
      router.refresh();
    });
  }

  function handleToggleRegionGranted(region: Region, granted: boolean) {
    setGrantedRegionIds((prev) => {
      const next = new Set(prev);
      if (granted) next.add(region.id);
      else next.delete(region.id);
      return next;
    });
    startTransition(async () => {
      const result = granted
        ? await grantAdminLocation(adminUserId, { type: "region", id: region.id })
        : await revokeAdminLocation(adminUserId, { type: "region", id: region.id });
      if (!result.success) {
        showAppAlert(result.error ?? "Änderung fehlgeschlagen.");
      }
      router.refresh();
    });
  }

  return (
    <AdministrativeUnitColumnsView
      pathUnits={pathUnits}
      byParent={byParent}
      onSelect={(levelIndex, unitId) => setPath([...path.slice(0, levelIndex), unitId])}
      regionsByParentId={regionsByParentId}
      grantedUnitIds={grantedUnitIds}
      grantedRegionIds={grantedRegionIds}
      onToggleUnitGranted={handleToggleUnitGranted}
      onToggleRegionGranted={handleToggleRegionGranted}
    />
  );
}
