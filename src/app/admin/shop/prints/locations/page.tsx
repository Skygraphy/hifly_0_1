import { redirect } from "next/navigation";
import { MapPinned } from "lucide-react";
import { auth } from "@/auth";
import { canManageShop } from "@/lib/authorization";
import { db } from "@/db";
import {
  administrativeUnits,
  regions,
  shopPrintFormats,
  shopPrintQualities,
  shopLocationPrintFormatAssignments,
} from "@/db/schema";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { Breadcrumb } from "@/components/breadcrumb";
import { NavTabs } from "@/components/nav-tabs";
import { SHOP_LEVEL1_TABS, PRINTS_LEVEL2_TABS } from "../../shop-nav-tabs";
import { PrintLocationAssignmentManager } from "./print-location-assignment-manager";

export default async function ShopPrintLocationsPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user) {
    redirect("/login");
  }
  if (!canManageShop(session.user.role)) {
    redirect("/?error=forbidden");
  }

  const [units, regionRows, formats, qualities, assignmentRows] = await Promise.all([
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
        id: regions.id,
        name: regions.name,
        description: regions.description,
        color: regions.color,
        parentId: regions.parentId,
        homeLevel: regions.homeLevel,
        published: regions.published,
      })
      .from(regions)
      .orderBy(regions.name),
    db
      .select({
        id: shopPrintFormats.id,
        name: shopPrintFormats.name,
        description: shopPrintFormats.description,
        widthCm: shopPrintFormats.widthCm,
        heightCm: shopPrintFormats.heightCm,
        sortOrder: shopPrintFormats.sortOrder,
        isFeatured: shopPrintFormats.isFeatured,
      })
      .from(shopPrintFormats)
      .orderBy(shopPrintFormats.sortOrder),
    db
      .select({ id: shopPrintQualities.id, name: shopPrintQualities.name, description: shopPrintQualities.description, sortOrder: shopPrintQualities.sortOrder })
      .from(shopPrintQualities)
      .orderBy(shopPrintQualities.sortOrder),
    db
      .select({
        administrativeUnitId: shopLocationPrintFormatAssignments.administrativeUnitId,
        regionId: shopLocationPrintFormatAssignments.regionId,
        printFormatId: shopLocationPrintFormatAssignments.printFormatId,
        printQualityId: shopLocationPrintFormatAssignments.printQualityId,
      })
      .from(shopLocationPrintFormatAssignments),
  ]);

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/admin/shop/prints" label="Zurück zu Drucke" />
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
        <Breadcrumb
          items={[
            { label: "Admin", href: "/admin" },
            { label: "Shop verwalten", href: "/admin/shop" },
            { label: "Drucke", href: "/admin/shop/prints" },
            { label: "Standort-Zuordnung" },
          ]}
          className="mt-4"
        />
        <h1 className="mb-2 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <MapPinned className="size-6 text-primary" />
          Drucke — Standort-Zuordnung
        </h1>
        <NavTabs items={SHOP_LEVEL1_TABS} active="prints" className="mb-2" />
        <NavTabs items={PRINTS_LEVEL2_TABS} active="locations" className="mb-6" />
        <PrintLocationAssignmentManager
          units={units}
          regions={regionRows}
          formats={formats}
          qualities={qualities}
          assignments={assignmentRows}
        />
      </div>
    </main>
  );
}
