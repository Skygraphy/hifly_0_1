import { redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { auth } from "@/auth";
import { canManageShop } from "@/lib/authorization";
import { db } from "@/db";
import { shopPrintFormats, shopPrintQualities, shopPrintFormatPrices } from "@/db/schema";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { Breadcrumb } from "@/components/breadcrumb";
import { NavTabs } from "@/components/nav-tabs";
import { SHOP_LEVEL1_TABS, PRINTS_LEVEL2_TABS } from "../shop-nav-tabs";
import { PrintCatalogManager } from "./print-catalog-manager";

export default async function ShopPrintsPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user) {
    redirect("/login");
  }
  if (!canManageShop(session.user.role)) {
    redirect("/?error=forbidden");
  }

  const [formats, qualities, prices] = await Promise.all([
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
        printFormatId: shopPrintFormatPrices.printFormatId,
        printQualityId: shopPrintFormatPrices.printQualityId,
        priceCents: shopPrintFormatPrices.priceCents,
      })
      .from(shopPrintFormatPrices),
  ]);

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/admin/shop" label="Zurück zum Shop" />
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
          items={[{ label: "Admin", href: "/admin" }, { label: "Shop verwalten", href: "/admin/shop" }, { label: "Drucke" }]}
          className="mt-4"
        />
        <h1 className="mb-2 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <Printer className="size-6 text-primary" />
          Drucke verwalten
        </h1>
        <NavTabs items={SHOP_LEVEL1_TABS} active="prints" className="mb-2" />
        <NavTabs items={PRINTS_LEVEL2_TABS} active="overview" className="mb-6" />
        <PrintCatalogManager formats={formats} qualities={qualities} prices={prices} />
      </div>
    </main>
  );
}
