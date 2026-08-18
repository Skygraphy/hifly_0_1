"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Columns3, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ADMINISTRATIVE_LEVELS,
  getChildLevel,
  groupByParent,
  filterPublishedUnits,
  type AdministrativeLevel,
  type AdministrativeUnit,
} from "@/lib/administrative-units";
import { groupRegionsByHome, type Region, type RegionAdministrativeUnitLink } from "@/lib/regions";
import { AdministrativeUnitBreadcrumbView } from "@/components/administrative-unit-breadcrumb-view";
import { AdministrativeUnitColumnsView } from "@/components/administrative-unit-columns-view";
import { AdministrativeUnitFormDialog, DeleteUnitDialog } from "./unit-dialogs";
import { setAdministrativeUnitPublished } from "./actions";
import { RegionFormDialog, DeleteRegionDialog, CreateColumnRegionDialog } from "./region-dialogs";
import { setRegionPublished } from "./region-actions";
import type { FormState, ColumnRegionsTarget, EditRegionTarget } from "./types";
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

type ViewMode = "breadcrumb" | "columns";

export function AdministrativeUnitsManager({
  units,
  regions,
  regionLinks,
}: {
  units: AdministrativeUnit[];
  regions: Region[];
  regionLinks: RegionAdministrativeUnitLink[];
}) {
  const router = useRouter();
  const byParent = useMemo(() => groupByParent(units), [units]);
  const byId = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  // Admin-Ansicht: Regionen werden nach ihrer fest gespeicherten parentId
  // gruppiert (nicht wie öffentlich per LCA über tatsächliche
  // Verknüpfungen) — jede Region bleibt dadurch dauerhaft an genau einer
  // Stelle sichtbar.
  const regionsByHomeParentId = useMemo(() => groupRegionsByHome(regions), [regions]);
  // Für die Vorbelegung der Checkboxen in RegionFormDialog: pro Region
  // die Menge ihrer verknüpften Einheiten-IDs (unabhängig davon, wo sie im
  // Baum liegen — der Dialog schneidet das selbst auf seine
  // candidateUnits zu).
  const unitIdsByRegion = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of regionLinks) {
      const set = map.get(link.regionId) ?? new Set<string>();
      set.add(link.administrativeUnitId);
      map.set(link.regionId, set);
    }
    return map;
  }, [regionLinks]);
  // Für die gedämpfte Darstellung nicht (mehr) öffentlich erreichbarer
  // Zeilen: kaskadiert berechnet (filterPublishedUnits, dieselbe Logik wie
  // beim öffentlichen Picker) statt nur das eigene published-Flag zu prüfen
  // — eine Einheit mit gesetztem Häkchen, aber unveröffentlichtem Vorfahren,
  // gilt hier ebenfalls als nicht sichtbar. Eine Region gilt nur als
  // sichtbar, wenn sie selbst freigegeben ist UND mindestens eine ihrer
  // verknüpften Einheiten sichtbar ist (sonst würde sie öffentlich ohnehin
  // nirgends auftauchen, siehe groupRegionsByParent).
  const visibleUnitIds = useMemo(() => new Set(filterPublishedUnits(units).map((unit) => unit.id)), [units]);
  const visibleRegionIds = useMemo(() => {
    const set = new Set<string>();
    for (const region of regions) {
      if (!region.published) continue;
      const hasVisibleLink = regionLinks.some(
        (link) => link.regionId === region.id && visibleUnitIds.has(link.administrativeUnitId)
      );
      if (hasVisibleLink) set.add(region.id);
    }
    return set;
  }, [regions, regionLinks, visibleUnitIds]);

  const [viewMode, setViewMode] = useState<ViewMode>("columns");
  const [path, setPath] = useState<string[]>(() => {
    const roots = groupByParent(units).get(null) ?? [];
    return roots.length > 0 ? firstLeafPath(roots[0], groupByParent(units)) : [];
  });
  const [formState, setFormState] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdministrativeUnit | null>(null);
  const [editRegionTarget, setEditRegionTarget] = useState<EditRegionTarget | null>(null);
  const [deleteRegionTarget, setDeleteRegionTarget] = useState<Region | null>(null);
  const [columnRegionsTarget, setColumnRegionsTarget] = useState<ColumnRegionsTarget | null>(null);
  const [, startTogglePublished] = useTransition();

  const pathUnits = path.map((id) => byId.get(id)).filter((unit): unit is AdministrativeUnit => Boolean(unit));
  const deepest = pathUnits[pathUnits.length - 1];
  const nextChildLevel = deepest ? getChildLevel(deepest.level) : ADMINISTRATIVE_LEVELS[0];

  function handleBreadcrumbSelect(levelIndex: number, unitId: string) {
    // Alles ab dieser Ebene verwerfen (andere Geschwister haben andere
    // Kinder), dann den neuen Ast wieder bis zum ersten Blatt aufklappen —
    // sonst wäre ein frisch gewählter Zweig ohne weiteren Klick unsichtbar
    // kurz.
    const unit = byId.get(unitId);
    if (!unit) return;
    setPath([...path.slice(0, levelIndex), ...firstLeafPath(unit, byParent)]);
  }

  function handleColumnsSelect(levelIndex: number, unitId: string) {
    // Echtes Finder-Verhalten: nur die eine Ebene wählen, NICHT weiter
    // aufklappen — in der Spalten-Ansicht ist ohnehin alles sichtbar, ein
    // automatisches Aufklappen würde unerwartet weit vorgreifen.
    setPath([...path.slice(0, levelIndex), unitId]);
  }

  function openCreateForm(parentId: string | null, level: AdministrativeLevel, replaceIndex: number) {
    setFormState({ mode: "create", parentId, level, replaceIndex });
  }

  function handleToggleUnitPublished(unit: AdministrativeUnit, published: boolean) {
    startTogglePublished(async () => {
      const result = await setAdministrativeUnitPublished(unit.id, published);
      if (!result.success) {
        showAppAlert(result.error ?? "Änderung fehlgeschlagen.");
        return;
      }
      router.refresh();
    });
  }

  function handleToggleRegionPublished(region: Region, published: boolean) {
    startTogglePublished(async () => {
      const result = await setRegionPublished(region.id, published);
      if (!result.success) {
        showAppAlert(result.error ?? "Änderung fehlgeschlagen.");
        return;
      }
      router.refresh();
    });
  }

  function openColumnRegions(
    parentId: string | null,
    level: AdministrativeLevel,
    candidateUnits: AdministrativeUnit[]
  ) {
    setColumnRegionsTarget({ parentId, candidateUnits, level });
  }

  function countDescendants(unitId: string): number {
    const children = byParent.get(unitId) ?? [];
    return children.reduce((sum, child) => sum + 1 + countDescendants(child.id), 0);
  }

  function handleSaved(id: string) {
    router.refresh();
    if (formState?.mode === "create") {
      setPath((prev) => [...prev.slice(0, formState.replaceIndex), id]);
    }
    setFormState(null);
  }

  function handleDeleted(levelIndex: number) {
    router.refresh();
    // Der gelöschte Eintrag steht nicht zwingend im aktuellen Pfad (Spalten-
    // Ansicht erlaubt Löschen auch nicht ausgewählter Zeilen) — nur
    // abschneiden, wenn er tatsächlich Teil des Pfads war.
    if (levelIndex !== -1) {
      setPath((prev) => prev.slice(0, levelIndex));
    }
    setDeleteTarget(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant={viewMode === "columns" ? "secondary" : "ghost"}
          size="sm"
          data-testid="unit-view-toggle-columns"
          aria-pressed={viewMode === "columns"}
          onClick={() => setViewMode("columns")}
        >
          <Columns3 className="size-3.5" />
          Spalten
        </Button>
        <Button
          type="button"
          variant={viewMode === "breadcrumb" ? "secondary" : "ghost"}
          size="sm"
          data-testid="unit-view-toggle-breadcrumb"
          aria-pressed={viewMode === "breadcrumb"}
          onClick={() => setViewMode("breadcrumb")}
        >
          <Route className="size-3.5" />
          Breadcrumb
        </Button>
      </div>

      {viewMode === "breadcrumb" ? (
        <AdministrativeUnitBreadcrumbView
          pathUnits={pathUnits}
          byParent={byParent}
          nextChildLevel={nextChildLevel}
          deepest={deepest}
          onSelectSibling={handleBreadcrumbSelect}
          onCreateSibling={openCreateForm}
          onEdit={(unit) => setFormState({ mode: "edit", unit })}
          onDelete={(unit) => setDeleteTarget(unit)}
          onAddChild={openCreateForm}
          regionsByParentId={regionsByHomeParentId}
          onCreateRegion={openColumnRegions}
          visibleUnitIds={visibleUnitIds}
          visibleRegionIds={visibleRegionIds}
          onToggleUnitPublished={handleToggleUnitPublished}
          onToggleRegionPublished={handleToggleRegionPublished}
        />
      ) : (
        <AdministrativeUnitColumnsView
          pathUnits={pathUnits}
          byParent={byParent}
          onSelect={handleColumnsSelect}
          onCreateSibling={openCreateForm}
          onEdit={(unit) => setFormState({ mode: "edit", unit })}
          onDelete={(unit) => setDeleteTarget(unit)}
          regionsByParentId={regionsByHomeParentId}
          onEditRegion={(region, parentId, candidateUnits, level) =>
            setEditRegionTarget({ region, parentId, candidateUnits, level })
          }
          onDeleteRegion={(region) => setDeleteRegionTarget(region)}
          onCreateRegion={openColumnRegions}
          visibleUnitIds={visibleUnitIds}
          visibleRegionIds={visibleRegionIds}
          onToggleUnitPublished={handleToggleUnitPublished}
          onToggleRegionPublished={handleToggleRegionPublished}
        />
      )}

      {formState && (
        <AdministrativeUnitFormDialog
          formState={formState}
          onClose={() => setFormState(null)}
          onSaved={handleSaved}
        />
      )}

      {editRegionTarget && (
        <RegionFormDialog
          region={editRegionTarget.region}
          target={editRegionTarget}
          unitIdsByRegion={unitIdsByRegion}
          byId={byId}
          onClose={() => setEditRegionTarget(null)}
          onSaved={() => {
            router.refresh();
            setEditRegionTarget(null);
          }}
        />
      )}

      {deleteRegionTarget && (
        <DeleteRegionDialog
          region={deleteRegionTarget}
          onClose={() => setDeleteRegionTarget(null)}
          onDeleted={() => {
            router.refresh();
            setDeleteRegionTarget(null);
          }}
        />
      )}

      {columnRegionsTarget && (
        <CreateColumnRegionDialog
          target={columnRegionsTarget}
          onClose={() => setColumnRegionsTarget(null)}
          onSaved={() => {
            router.refresh();
            setColumnRegionsTarget(null);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteUnitDialog
          unit={deleteTarget}
          descendantCount={countDescendants(deleteTarget.id)}
          levelIndex={path.indexOf(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
