import { redirect } from "next/navigation";
import { MapPinned } from "lucide-react";
import { auth } from "@/auth";
import { canManageAdministrativeUnits, canManageRegions } from "@/lib/authorization";
import { db } from "@/db";
import { administrativeUnits, regions, regionAdministrativeUnits } from "@/db/schema";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { AdministrativeUnitsManager } from "./administrative-units-manager";

export default async function AdministrativeUnitsPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user) {
    redirect("/login");
  }
  // Diese Seite pflegt sowohl die Verwaltungsgliederung als auch (seit dem
  // Umbau von /admin/regions) Regionen — wer eine der beiden Berechtigungen
  // hat, darf die Seite öffnen; jede Server Action prüft ihre eigene
  // Berechtigung unabhängig davon erneut (defense in depth, siehe
  // actions.ts/region-actions.ts).
  if (!canManageAdministrativeUnits(session.user.role) && !canManageRegions(session.user.role)) {
    redirect("/?error=forbidden");
  }

  const [units, regionRows, links] = await Promise.all([
    db
      .select({
        id: administrativeUnits.id,
        parentId: administrativeUnits.parentId,
        level: administrativeUnits.level,
        code: administrativeUnits.code,
        name: administrativeUnits.name,
        shortName: administrativeUnits.shortName,
        color: administrativeUnits.color,
      })
      .from(administrativeUnits)
      .orderBy(administrativeUnits.name),
    db
      .select({
        id: regions.id,
        name: regions.name,
        description: regions.description,
        color: regions.color,
        homeParentId: regions.homeParentId,
        homeLevel: regions.homeLevel,
      })
      .from(regions)
      .orderBy(regions.name),
    db
      .select({
        regionId: regionAdministrativeUnits.regionId,
        administrativeUnitId: regionAdministrativeUnits.administrativeUnitId,
      })
      .from(regionAdministrativeUnits),
  ]);

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/admin" label="Zurück zum Admin-Bereich" />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session.user} />
          <AccountMenu user={session.user} />
        </div>
      </AccountMenuSlot>
      <div className="mx-auto max-w-6xl">
        {/* mt-6 statt pl-12: der Back-Button (absolut, oben links, size-8)
            überlappt sonst das Logo, wenn beide auf derselben Höhe stehen. */}
        <div className="mt-6">
          <BrandMark />
        </div>
        <h1 className="mb-6 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <MapPinned className="size-6 text-primary" />
          Standorte &amp; Regionen
        </h1>
        <AdministrativeUnitsManager units={units} regions={regionRows} regionLinks={links} />
      </div>
    </main>
  );
}
