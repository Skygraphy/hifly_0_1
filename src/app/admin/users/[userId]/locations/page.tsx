import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { MapPinned, ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { canManageLocationGrants } from "@/lib/authorization";
import { db } from "@/db";
import { users, administrativeUnits, regions as regionsTable, adminLocationGrants } from "@/db/schema";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { buttonVariants } from "@/components/ui/button";
import { LocationGrantsManager } from "./location-grants-manager";

export default async function UserLocationGrantsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user) {
    redirect("/login");
  }
  if (!canManageLocationGrants(session.user.role)) {
    redirect("/?error=forbidden");
  }

  const [[targetUser], units, regionRows, grantRows] = await Promise.all([
    db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        id: administrativeUnits.id,
        parentId: administrativeUnits.parentId,
        level: administrativeUnits.level,
        code: administrativeUnits.code,
        name: administrativeUnits.name,
        shortName: administrativeUnits.shortName,
        color: administrativeUnits.color,
        published: administrativeUnits.published,
      })
      .from(administrativeUnits)
      .orderBy(administrativeUnits.name),
    db
      .select({
        id: regionsTable.id,
        name: regionsTable.name,
        description: regionsTable.description,
        color: regionsTable.color,
        parentId: regionsTable.parentId,
        homeLevel: regionsTable.homeLevel,
        published: regionsTable.published,
      })
      .from(regionsTable)
      .orderBy(regionsTable.name),
    db
      .select({
        administrativeUnitId: adminLocationGrants.administrativeUnitId,
        regionId: adminLocationGrants.regionId,
      })
      .from(adminLocationGrants)
      .where(eq(adminLocationGrants.adminUserId, userId)),
  ]);

  // Freigaben ergeben nur für die Rolle admin Sinn (super_admin braucht sie
  // nicht, user darf ohnehin nicht hochladen) — ein direkt aufgerufener Link
  // für eine andere Rolle landet daher auf einer nicht existierenden Seite.
  if (!targetUser || targetUser.role !== "admin") {
    notFound();
  }

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/admin/users" label="Zurück zur User-Verwaltung" />
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
          Standorte freigeben — {targetUser.name ?? targetUser.email}
        </h1>
        <LocationGrantsManager
          adminUserId={targetUser.id}
          units={units}
          regions={regionRows}
          initialGrantedUnitIds={grantRows.map((grant) => grant.administrativeUnitId).filter((id): id is string => id !== null)}
          initialGrantedRegionIds={grantRows.map((grant) => grant.regionId).filter((id): id is string => id !== null)}
        />
        <Link href="/admin/users" className={buttonVariants({ variant: "default", className: "mt-6" })}>
          <ArrowLeft className="size-4" />
          Zurück
        </Link>
      </div>
    </main>
  );
}
