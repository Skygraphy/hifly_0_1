"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ADMINISTRATIVE_LEVELS,
  getChildLevel,
  groupByParent,
  pathToRoot,
  type AdministrativeUnit,
} from "@/lib/administrative-units";
import { AdministrativeUnitBreadcrumbView } from "@/components/administrative-unit-breadcrumb-view";
import { getGuestSettings, setGuestSetting } from "@/lib/guest-settings";
import { setPersonalSetting } from "@/app/settings/actions";
import { parseStandortValue, type StandortRef } from "@/lib/standort";
import { groupRegionsByParent, type Region, type RegionAdministrativeUnitLink } from "@/lib/regions";
import type { AccountMenuUser } from "@/components/account-menu";
import { showAppAlert } from "@/lib/app-alert";

const SETTING_KEY = "default_administrative_unit";

/**
 * Standort/Regionen-Filter oben auf /images: gegenüber
 * AdministrativeLevelWidget (Startseite, "Auswahl übernehmen" + Link) hier
 * bewusst eine eigene Komponente — Auswahl löst sofort onStandortChange
 * (Live-Filterung der Bilder darunter) statt Navigation aus. Nur die
 * Breadcrumb-Ansicht (keine Listen-/Spalten-Ansicht als zweite Option, auf
 * Wunsch des Users bewusst weggelassen). Persistiert die Auswahl trotzdem
 * genau wie die Startseite (derselbe SETTING_KEY), damit "/", "/images" und
 * Deep-Links denselben Standard-Standort teilen.
 */
export function StandortFilter({
  units,
  regions,
  regionLinks,
  initialStandort,
  user,
  onStandortChange,
}: {
  units: AdministrativeUnit[];
  regions: Region[];
  regionLinks: RegionAdministrativeUnitLink[];
  initialStandort: StandortRef | null;
  user: AccountMenuUser | null;
  onStandortChange: (standort: StandortRef | null) => void;
}) {
  const byId = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const byParent = useMemo(() => groupByParent(units), [units]);
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);
  const regionsByParentId = useMemo(
    () => groupRegionsByParent(units, regions, regionLinks),
    [units, regions, regionLinks]
  );

  const [standort, setStandort] = useState<StandortRef | null>(initialStandort);
  const initialPath = useMemo(
    () => (initialStandort?.type === "unit" ? pathToRoot(initialStandort.id, byId) : []),
    [initialStandort, byId]
  );
  const [path, setPath] = useState<string[]>(initialPath);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Wie AdministrativeLevelWidget: wenn der serverseitig übergebene Wert
    // leer ist UND lokal noch nichts gewählt wurde, im localStorage
    // nachsehen (anonyme Besucher, deren Standort der Server nicht kennt).
    if (standort) return;
    const stored = parseStandortValue(getGuestSettings()[SETTING_KEY]);
    if (!stored) return;
    if (stored.type === "unit") {
      const recovered = pathToRoot(stored.id, byId);
      if (recovered.length === 0) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPath(recovered);
      setStandort(stored);
      onStandortChange(stored);
    } else if (regionById.has(stored.id)) {
      setStandort(stored);
      onStandortChange(stored);
    }
    // path/onStandortChange bewusst nicht in den deps: soll nur einmal nach
    // dem Mount prüfen, nicht erneut nach jeder eigenen Änderung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byId, regionById]);

  function persist(next: StandortRef) {
    if (user) {
      startTransition(async () => {
        const result = await setPersonalSetting(SETTING_KEY, next);
        if (!result.success) showAppAlert(result.error ?? "Änderung fehlgeschlagen.");
      });
    } else {
      setGuestSetting(SETTING_KEY, next);
    }
  }

  const selectedRegion = standort?.type === "region" ? regionById.get(standort.id) : undefined;

  // Niedrigster gemeinsamer Vorfahre der aktuell gewählten Region (siehe
  // groupRegionsByParent) — Grundlage für ihre Vorfahrenkette, genau wie in
  // AdministrativeLevelWidget.
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

  const unitPathUnits = path.map((id) => byId.get(id)).filter((unit): unit is AdministrativeUnit => Boolean(unit));
  // Bei einer gewählten Region zeigen beide Ansichten deren Vorfahrenkette
  // statt des (dann veralteten) reinen Einheiten-Pfads — dieselbe Ebene
  // erscheint so in Breadcrumb UND Spalten-Ansicht konsistent.
  const displayPathUnits = selectedRegion ? regionAncestorUnits : unitPathUnits;
  const deepest = displayPathUnits[displayPathUnits.length - 1];
  const nextChildLevel = deepest ? getChildLevel(deepest.level) : ADMINISTRATIVE_LEVELS[0];
  const isOrphanRegion = Boolean(selectedRegion) && selectedRegionKey === undefined;

  function selectUnit(levelIndex: number, unitId: string) {
    const prefix = selectedRegion ? regionAncestorUnits.map((unit) => unit.id) : path;
    const next = [...prefix.slice(0, levelIndex), unitId];
    setPath(next);
    const ref: StandortRef = { type: "unit", id: unitId };
    setStandort(ref);
    persist(ref);
    onStandortChange(ref);
  }

  function selectRegion(regionId: string) {
    const ref: StandortRef = { type: "region", id: regionId };
    setStandort(ref);
    persist(ref);
    onStandortChange(ref);
  }

  return (
    <div className="flex flex-col items-start gap-3" data-testid="standort-filter" aria-busy={isPending}>
      {isOrphanRegion ? (
        // Seltener Randfall: die gewählte Region hat keine (mehr) verknüpften
        // Einheiten, hat also keine Baum-Position für einen Breadcrumb —
        // Auswahl zurücksetzen statt einer leeren Ansicht.
        <button
          type="button"
          data-testid="standort-filter-change-region"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setStandort(null);
            onStandortChange(null);
          }}
        >
          Standort ändern
        </button>
      ) : (
        <AdministrativeUnitBreadcrumbView
          pathUnits={displayPathUnits}
          byParent={byParent}
          nextChildLevel={nextChildLevel}
          deepest={deepest}
          onSelectSibling={selectUnit}
          onSelectChild={(unitId) => selectUnit(displayPathUnits.length, unitId)}
          regionsByParentId={regionsByParentId}
          onSelectRegion={selectRegion}
          selectedRegion={selectedRegion}
        />
      )}
    </div>
  );
}
