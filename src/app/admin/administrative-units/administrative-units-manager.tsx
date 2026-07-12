"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Columns3, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMINISTRATIVE_LEVELS, getChildLevel, type AdministrativeLevel } from "@/lib/administrative-units";
import { BreadcrumbView } from "./breadcrumb-view";
import { ColumnsView } from "./columns-view";
import { AdministrativeUnitFormDialog, DeleteUnitDialog } from "./unit-dialogs";
import type { AdministrativeUnit, FormState } from "./types";

function groupByParent(units: AdministrativeUnit[]): Map<string | null, AdministrativeUnit[]> {
  const map = new Map<string | null, AdministrativeUnit[]>();
  for (const unit of units) {
    const siblings = map.get(unit.parentId) ?? [];
    siblings.push(unit);
    map.set(unit.parentId, siblings);
  }
  return map;
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

type ViewMode = "breadcrumb" | "columns";

export function AdministrativeUnitsManager({ units }: { units: AdministrativeUnit[] }) {
  const router = useRouter();
  const byParent = useMemo(() => groupByParent(units), [units]);
  const byId = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);

  const [viewMode, setViewMode] = useState<ViewMode>("breadcrumb");
  const [path, setPath] = useState<string[]>(() => {
    const roots = groupByParent(units).get(null) ?? [];
    return roots.length > 0 ? firstLeafPath(roots[0], groupByParent(units)) : [];
  });
  const [formState, setFormState] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdministrativeUnit | null>(null);

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
          variant={viewMode === "breadcrumb" ? "secondary" : "ghost"}
          size="sm"
          data-testid="unit-view-toggle-breadcrumb"
          aria-pressed={viewMode === "breadcrumb"}
          onClick={() => setViewMode("breadcrumb")}
        >
          <Route className="size-3.5" />
          Breadcrumb
        </Button>
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
      </div>

      {viewMode === "breadcrumb" ? (
        <BreadcrumbView
          pathUnits={pathUnits}
          byParent={byParent}
          nextChildLevel={nextChildLevel}
          deepest={deepest}
          onSelectSibling={handleBreadcrumbSelect}
          onCreateSibling={openCreateForm}
          onEdit={(unit) => setFormState({ mode: "edit", unit })}
          onDelete={(unit) => setDeleteTarget(unit)}
          onAddChild={openCreateForm}
        />
      ) : (
        <ColumnsView
          pathUnits={pathUnits}
          byParent={byParent}
          onSelect={handleColumnsSelect}
          onCreateSibling={openCreateForm}
          onEdit={(unit) => setFormState({ mode: "edit", unit })}
          onDelete={(unit) => setDeleteTarget(unit)}
        />
      )}

      {formState && (
        <AdministrativeUnitFormDialog
          formState={formState}
          onClose={() => setFormState(null)}
          onSaved={handleSaved}
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
