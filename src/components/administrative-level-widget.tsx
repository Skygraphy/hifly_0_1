"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ADMINISTRATIVE_LEVELS,
  getChildLevel,
  groupByParent,
  pathToRoot,
  type AdministrativeUnit,
} from "@/lib/administrative-units";
import { AdministrativeUnitColumnsView } from "@/components/administrative-unit-columns-view";
import { AdministrativeUnitBreadcrumbView } from "@/components/administrative-unit-breadcrumb-view";
import { getGuestSettings, setGuestSetting } from "@/lib/guest-settings";
import { setPersonalSetting } from "@/app/settings/actions";
import { parseStandortValue, type StandortRef } from "@/lib/standort";
import { groupRegionsByParent, type Region, type RegionAdministrativeUnitLink } from "@/lib/regions";
import type { AccountMenuUser } from "@/components/account-menu";

const SETTING_KEY = "default_administrative_unit";

/**
 * Öffentliches Gegenstück zum Admin-Manager: keine CRUD-Aktionen, nur
 * Auswahl. Erster Besuch (kein gespeicherter Standort) zeigt die
 * Spalten-Ansicht der Verwaltungsgliederung — Regionen erscheinen darin
 * (und in der Breadcrumb-Ansicht) als zusätzlicher, durch eine dünne Linie
 * abgetrennter "Gegend"-Auswahlpunkt, jeweils genau einmal an der
 * niedrigsten Ebene, die alle ihre verknüpften Einheiten gemeinsam abdeckt
 * (siehe groupRegionsByParent). Danach die Breadcrumb-Ansicht (Unit) bzw.
 * den Regionsnamen samt "Standort ändern"-Link.
 */
export function AdministrativeLevelWidget({
  units,
  regions,
  regionLinks,
  initialStandort,
  user,
}: {
  units: AdministrativeUnit[];
  regions: Region[];
  regionLinks: RegionAdministrativeUnitLink[];
  initialStandort: StandortRef | null;
  user: AccountMenuUser | null;
}) {
  const byId = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const byParent = useMemo(() => groupByParent(units), [units]);
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);
  const regionsByParentId = useMemo(
    () => groupRegionsByParent(units, regions, regionLinks),
    [units, regions, regionLinks]
  );

  const [standort, setStandort] = useState<StandortRef | null>(initialStandort);

  // --- Unit-only Teilzustand: unverändert gegenüber vorher (lazy init,
  // mode nicht von path.length abgeleitet, etc). ---
  const initialPath = useMemo(
    () => (initialStandort?.type === "unit" ? pathToRoot(initialStandort.id, byId) : []),
    [initialStandort, byId]
  );
  const [path, setPath] = useState<string[]>(initialPath);
  // "picker" = Spalten-Ansicht (erster Besuch, noch nichts gespeichert),
  // "breadcrumb" = bereits ein gespeicherter Wert vorhanden (nächster
  // Besuch). Bewusst NICHT von path.length abgeleitet: sonst würde ein
  // einzelner Klick in der Spalten-Ansicht sofort auf die Breadcrumb-
  // Darstellung umschalten und weiteres Durchklicken durch tiefere Spalten
  // unmöglich machen — der Modus wird nur beim Laden/bei der Recovery
  // festgelegt, nicht bei jeder Auswahl.
  const [mode, setMode] = useState<"picker" | "breadcrumb">(initialPath.length > 0 ? "breadcrumb" : "picker");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Vereinheitlichte Recovery-Regel, unabhängig vom Login-Status: wenn der
    // serverseitig übergebene Wert leer ist UND lokal noch nichts gewählt
    // wurde, im localStorage nachsehen. Deckt drei Fälle mit einer Regel ab:
    // frisch-anonym (bleibt leer -> Picker), wiederkehrend-anonym (Server
    // kennt localStorage nicht -> hier nachgeholt), frisch-eingeloggt-vom-
    // Gast (DB-Zeile evtl. noch nicht migriert -> hier trotzdem sofort
    // sichtbar statt kurz auf den Picker zu flackern).
    if (standort) return;
    const stored = parseStandortValue(getGuestSettings()[SETTING_KEY]);
    if (!stored) return;
    if (stored.type === "unit") {
      const recovered = pathToRoot(stored.id, byId);
      if (recovered.length === 0) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPath(recovered);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("breadcrumb");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStandort(stored);
    } else if (regionById.has(stored.id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStandort(stored);
    }
    // path bewusst nicht in den deps: soll nur einmal nach dem Mount prüfen,
    // nicht erneut nach jeder eigenen setPath-Änderung durch handleSelect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byId, regionById]);

  function persist(next: StandortRef) {
    if (user) {
      startTransition(async () => {
        const result = await setPersonalSetting(SETTING_KEY, next);
        if (!result.success) alert(result.error ?? "Änderung fehlgeschlagen.");
      });
    } else {
      setGuestSetting(SETTING_KEY, next);
    }
  }

  function handleSelectUnit(levelIndex: number, unitId: string) {
    // Truncate + append, wie handleColumnsSelect im Admin-Manager — bewusst
    // KEIN Auto-Drill zum ersten Blatt (anders als handleBreadcrumbSelect):
    // ein gespeicherter Standardwert darf nicht unbemerkt auf ein nie
    // angeklicktes Blatt springen.
    const next = [...path.slice(0, levelIndex), unitId];
    setPath(next);
    const ref: StandortRef = { type: "unit", id: unitId };
    setStandort(ref);
    persist(ref);
  }

  function handleSelectRegion(regionId: string) {
    // Region-Auswahl ist ein einzelner atomarer Schritt — anders als bei
    // Verwaltungseinheiten gibt es keinen Mehr-Ebenen-Pfad, den man beim
    // Klicken "offen halten" müsste. Die Auswahl gilt sofort als
    // abgeschlossen, unabhängig davon, an welcher Stelle (Spalte/Segment)
    // sie angeklickt wurde. path/mode bleiben unberührt — die
    // Breadcrumb-Darstellung einer Region wird unten separat aus
    // regionsByParentId hergeleitet (regionAncestorUnits), nicht aus path.
    const ref: StandortRef = { type: "region", id: regionId };
    setStandort(ref);
    persist(ref);
  }

  function selectUnitInRegionContext(levelIndex: number, unitId: string) {
    // Wechsel von einer Region zurück zu einer Einheit, ausgelöst aus dem
    // Region-Breadcrumb heraus (Vorfahren-Segment oder das Region-Segment
    // selbst). Nutzt bewusst regionAncestorUnits als Präfix statt des
    // generischen path-State — der ist während einer Region-Auswahl nicht
    // zwangsläufig mit deren Vorfahrenkette synchron (z.B. nach einem Reload
    // mit initialStandort vom Typ "region", wo path leer bleibt).
    const next = [...regionAncestorUnits.slice(0, levelIndex).map((unit) => unit.id), unitId];
    setPath(next);
    setMode("breadcrumb");
    const ref: StandortRef = { type: "unit", id: unitId };
    setStandort(ref);
    persist(ref);
  }

  const pathUnits = path.map((id) => byId.get(id)).filter((unit): unit is AdministrativeUnit => Boolean(unit));
  const deepest = pathUnits[pathUnits.length - 1];
  const nextChildLevel = deepest ? getChildLevel(deepest.level) : ADMINISTRATIVE_LEVELS[0];
  const selectedRegion = standort?.type === "region" ? regionById.get(standort.id) : undefined;

  // Seit groupRegionsByParent Regionen an genau EINEM Schlüssel platziert
  // (niedrigster gemeinsamer Vorfahre ihrer verknüpften Einheiten, siehe
  // src/lib/regions.ts), hat jede platzierte Region auch einen eindeutigen
  // Breadcrumb-Pfad: die Vorfahrenkette bis zu diesem Schlüssel, plus die
  // Region selbst als letztes Segment. undefined bedeutet: die Region hat
  // (mehr) keine verknüpften Einheiten — dann bleibt nur der Fallback ohne
  // Baum-Position (siehe "region-orphan" unten).
  const selectedRegionKey = useMemo(() => {
    if (!selectedRegion) return undefined;
    for (const [key, list] of regionsByParentId) {
      if (list.some((region) => region.id === selectedRegion.id)) return key;
    }
    return undefined;
  }, [regionsByParentId, selectedRegion]);

  const regionAncestorUnits = useMemo(() => {
    if (selectedRegionKey === undefined || selectedRegionKey === null) return [];
    return pathToRoot(selectedRegionKey, byId)
      .map((id) => byId.get(id))
      .filter((unit): unit is AdministrativeUnit => Boolean(unit));
  }, [selectedRegionKey, byId]);
  const regionDeepest = regionAncestorUnits[regionAncestorUnits.length - 1];
  const regionNextChildLevel = regionDeepest ? getChildLevel(regionDeepest.level) : ADMINISTRATIVE_LEVELS[0];

  // Auf selectedRegion (nicht standort?.type) geprüft: ein standort, der
  // auf keine (mehr) existierende Region zeigt (z.B. zwischenzeitlich
  // gelöscht), ist ebenfalls keine gültige Auswahl und muss auf den Picker
  // zurückfallen, statt eine leere Ansicht zu zeigen.
  const view: "unit-picker" | "unit-breadcrumb" | "region-breadcrumb" | "region-orphan" = selectedRegion
    ? selectedRegionKey === undefined
      ? "region-orphan"
      : "region-breadcrumb"
    : mode === "breadcrumb"
      ? "unit-breadcrumb"
      : "unit-picker";

  // Derselbe Slot für alle Modi: vor einer Auswahl die Aufforderung, danach
  // der Name des gewählten Standorts. "Standort" statt "Verwaltungsebene"
  // im User-facing Text — Letzteres ist nur die interne Domain-Bezeichnung.
  const label =
    view === "unit-picker"
      ? "Wähle deinen Standort"
      : view === "unit-breadcrumb"
        ? (deepest?.name ?? "")
        : (selectedRegion?.name ?? "");

  return (
    <div
      className="flex flex-col items-center gap-6"
      data-testid="administrative-level-widget"
      aria-busy={isPending}
    >
      <p
        data-testid="administrative-level-label"
        className="text-6xl font-semibold tracking-tight text-foreground sm:text-7xl md:text-8xl"
      >
        {label}
      </p>
      <div className="mt-16 flex flex-col items-center gap-4">
        {view === "unit-breadcrumb" && (
          <AdministrativeUnitBreadcrumbView
            pathUnits={pathUnits}
            byParent={byParent}
            nextChildLevel={nextChildLevel}
            deepest={deepest}
            onSelectSibling={handleSelectUnit}
            onSelectChild={(unitId) => handleSelectUnit(pathUnits.length, unitId)}
            regionsByParentId={regionsByParentId}
            onSelectRegion={handleSelectRegion}
          />
        )}

        {view === "region-breadcrumb" && selectedRegion && (
          <AdministrativeUnitBreadcrumbView
            pathUnits={regionAncestorUnits}
            byParent={byParent}
            nextChildLevel={regionNextChildLevel}
            deepest={regionDeepest}
            onSelectSibling={selectUnitInRegionContext}
            onSelectChild={(unitId) => selectUnitInRegionContext(regionAncestorUnits.length, unitId)}
            regionsByParentId={regionsByParentId}
            onSelectRegion={handleSelectRegion}
            selectedRegion={selectedRegion}
          />
        )}

        {view === "region-orphan" && (
          // Fallback für eine Region ohne (mehr) verknüpfte Einheiten — hat
          // strukturell keine Baum-Position, kann also keinen Breadcrumb
          // haben. Sehr seltener Randfall (alle Verknüpfungen einer Region
          // gelöscht, während sie noch als Standort gespeichert ist).
          <button
            type="button"
            data-testid="standort-change-region"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setStandort(null)}
          >
            Standort ändern
          </button>
        )}

        {view === "unit-picker" && (
          <AdministrativeUnitColumnsView
            pathUnits={pathUnits}
            byParent={byParent}
            onSelect={handleSelectUnit}
            regionsByParentId={regionsByParentId}
            onSelectRegion={handleSelectRegion}
          />
        )}
      </div>
    </div>
  );
}
