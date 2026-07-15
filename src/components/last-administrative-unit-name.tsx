"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getGuestSettings } from "@/lib/guest-settings";
import { parseStandortValue, type StandortRef } from "@/lib/standort";
import type { AdministrativeUnit } from "@/lib/administrative-units";
import type { Region } from "@/lib/regions";

const SETTING_KEY = "default_administrative_unit";

/**
 * Zeigt den Namen des zuletzt gewählten Standorts (Verwaltungseinheit ODER
 * Region) groß an. Gleiche Recovery-Regel wie im AdministrativeLevelWidget
 * auf "/": der Server kennt bei anonymen Besuchern den localStorage-Wert
 * nicht, daher hier nach dem Mount nachgeholt.
 *
 * Guard: eingeloggte User ohne gültige Auswahl werden bereits serverseitig
 * (siehe images/page.tsx) umgeleitet, bevor diese Komponente überhaupt
 * gerendert wird. Für anonyme Besucher kann das nur clientseitig geprüft
 * werden — steht nach dem Nachholen aus localStorage immer noch keine
 * gültige Einheit/Region fest, wird ebenfalls auf "/" umgeleitet.
 */
export function LastAdministrativeUnitName({
  units,
  regions,
  initialStandort,
}: {
  units: AdministrativeUnit[];
  regions: Region[];
  initialStandort: StandortRef | null;
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions]);

  const [standort, setStandort] = useState<StandortRef | null>(initialStandort);
  const [guestStorageChecked, setGuestStorageChecked] = useState(Boolean(initialStandort));

  useEffect(() => {
    if (standort) return;
    const stored = parseStandortValue(getGuestSettings()[SETTING_KEY]);
    if (
      stored &&
      ((stored.type === "unit" && byId.has(stored.id)) || (stored.type === "region" && regionById.has(stored.id)))
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStandort(stored);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuestStorageChecked(true);
    // path bewusst nicht in den deps: soll nur einmal nach dem Mount prüfen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byId, regionById]);

  const name =
    standort?.type === "unit"
      ? byId.get(standort.id)?.name
      : standort?.type === "region"
        ? regionById.get(standort.id)?.name
        : undefined;

  useEffect(() => {
    // Auf name (nicht standort) geprüft: ein Standort, der auf keine
    // (mehr) existierende Einheit/Region zeigt (z.B. zwischenzeitlich
    // gelöscht), ist ebenfalls keine gültige Auswahl und muss umleiten.
    if (!guestStorageChecked || name) return;
    router.replace("/");
  }, [guestStorageChecked, name, router]);

  if (!name) return null;

  return (
    <h1
      data-testid="last-administrative-unit-name"
      className="text-center text-6xl font-semibold tracking-tight text-foreground sm:text-7xl md:text-8xl"
    >
      {name}
    </h1>
  );
}
