import { cookies } from "next/headers";
import { auth } from "@/auth";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { BrandMark } from "@/components/brand-mark";
import { AnonViewLimitGate } from "@/components/anon-view-limit-gate";
import { CustomerNav } from "@/components/customer-nav";
import { Breadcrumb } from "@/components/breadcrumb";
import { getStandortPickerData } from "@/lib/standort-picker-data";
import { groupByParent, collectDescendantIds } from "@/lib/administrative-units";
import { getGlobalSettings } from "@/lib/settings-service";
import { ANON_VIEW_COOKIE_NAME, isOverLimit, readAnonViewState } from "@/lib/anon-view-tracking";
import { searchImages, countImageLocations } from "./actions";
import { ImagesPageClient } from "./images-page-client";

export default async function ImagesPage() {
  const [session, globalSettings] = await Promise.all([auth(), getGlobalSettings()]);

  // Anonyme Registrierungs-Sperre (siehe anon-view-tracking.ts,
  // recordAnonymousImageView in actions.ts) — VOR jeder weiteren, teureren
  // Datenladung geprüft: betroffene Besucher bekommen gar nicht erst
  // units/regions/searchImages geladen, nur die Sperr-Karte. Betrifft nie
  // eingeloggte Sessions, unabhängig von der Rolle.
  if (!session?.user) {
    const cookieStore = await cookies();
    const anonViewLimit = Number(globalSettings.anon_image_view_limit) || 25;
    const anonViewWindowMinutes = Number(globalSettings.anon_image_view_window_minutes) || 30;
    const anonViewState = readAnonViewState(cookieStore.get(ANON_VIEW_COOKIE_NAME)?.value);
    // Server Component (läuft einmal pro Request, kein Re-Render/
    // Memoization wie bei Client-Komponenten) — die react-compiler-
    // Purity-Regel greift hier zu Unrecht, Date.now() ist in diesem
    // Kontext unproblematisch.
    // eslint-disable-next-line react-hooks/purity
    if (isOverLimit(anonViewState, anonViewLimit, anonViewWindowMinutes, Date.now())) {
      return <AnonViewLimitGate />;
    }
  }

  const { units, regions, regionLinks, initialStandort } = await getStandortPickerData(
    session?.user?.id,
    session?.user?.role
  );

  // Standort-Picker sitzt jetzt direkt auf der Seite (Live-Filter) — anders
  // als früher wird ohne vorherige Auswahl nicht mehr zu "/" umgeleitet, der
  // Besucher wählt hier. Nachfahren-Erweiterung wie im Client (siehe
  // images-page-client.tsx), damit der erste Server-Render bereits genau
  // dieselben Treffer zeigt wie eine spätere Neu-Filterung.
  const byParent = groupByParent(units);
  const initialLocationFilter = {
    administrativeUnitIds:
      initialStandort?.type === "unit" ? collectDescendantIds(initialStandort.id, byParent) : undefined,
    regionId: initialStandort?.type === "region" ? initialStandort.id : undefined,
    locationQuery: "",
    tagsQuery: "",
    offset: 0,
  };
  // Marker-Warn-/Sperrgrenze für den "Karte"-Umschalter (siehe
  // map_marker_warning_threshold/map_marker_hard_limit in
  // settings-registry.ts) — initiale Trefferzahl direkt mit dem ersten
  // Server-Render laden, dasselbe Muster wie initialRows/initialTotal
  // unten, damit der Button von Anfang an korrekt (nicht erst nach einem
  // Client-Roundtrip) gesperrt/gewarnt ist.
  const [initialResult, initialMapMarkerCount] = await Promise.all([
    searchImages({
      ...initialLocationFilter,
      // Muss mit dem Default-State in ImagesPageClient (sortBy)
      // übereinstimmen, sonst weicht die erste Server-gerenderte
      // Reihenfolge vom Client ab.
      sortBy: "address-asc",
    }),
    countImageLocations(initialLocationFilter),
  ]);
  const mapMarkerWarningThreshold = Number(globalSettings.map_marker_warning_threshold) || 1500;
  const mapMarkerHardLimit = Number(globalSettings.map_marker_hard_limit) || 2000;

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/" label="Zurück zur Startseite" />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session?.user ?? null} />
          <AccountMenu user={session?.user ?? null} />
        </div>
      </AccountMenuSlot>
      <div className="mx-auto max-w-6xl">
        {/* mt-6 statt pl-12: der Back-Button (absolut, oben links, size-8)
            überlappt sonst das Logo, wenn beide auf derselben Höhe stehen —
            dieselbe Begründung/Lösung wie auf der Upload-Seite. */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-y-2">
          <BrandMark />
          <CustomerNav active="images" />
        </div>
        <Breadcrumb items={[{ label: "Start", href: "/" }, { label: "Bilder" }]} className="mt-4" />
        <ImagesPageClient
          units={units}
          regions={regions}
          regionLinks={regionLinks}
          initialStandort={initialStandort}
          initialRows={initialResult.rows}
          initialHasMore={initialResult.hasMore}
          initialTotal={initialResult.total}
          user={session?.user ?? null}
          mapMarkerWarningThreshold={mapMarkerWarningThreshold}
          mapMarkerHardLimit={mapMarkerHardLimit}
          initialMapMarkerCount={initialMapMarkerCount}
        />
      </div>
    </main>
  );
}
