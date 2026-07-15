"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setGuestSetting } from "@/lib/guest-settings";
import { BrandMark } from "@/components/brand-mark";
import type { StandortRef } from "@/lib/standort";

const SETTING_KEY = "default_administrative_unit";

/**
 * Anonymes Gegenstück zum eingeloggten Zweig in [unitId]/page.tsx: der
 * Server kennt bei anonymen Besuchern kein Konto, in das geschrieben werden
 * könnte — die Übernahme des per Deep-Link (QR-Code, externer Link)
 * verlinkten Standorts (Verwaltungseinheit ODER Region) passiert daher
 * clientseitig ins localStorage (gleicher Mechanismus wie
 * AdministrativeLevelWidget.persist() im Gast-Zweig), danach sofortige
 * Weiterleitung auf "/", wo das bestehende Widget den neuen Standort
 * automatisch anzeigt.
 */
export function PersistGuestStandortAndRedirect({ standort }: { standort: StandortRef }) {
  const router = useRouter();

  useEffect(() => {
    setGuestSetting(SETTING_KEY, standort);
    router.replace("/");
  }, [standort, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
      <BrandMark />
      <p data-testid="persist-guest-standort-pending" className="text-sm text-muted-foreground">
        Standort wird übernommen…
      </p>
    </main>
  );
}
