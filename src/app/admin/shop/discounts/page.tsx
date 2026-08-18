import { redirect } from "next/navigation";
import { Percent } from "lucide-react";
import { auth } from "@/auth";
import { canManageShop } from "@/lib/authorization";
import { db } from "@/db";
import { shopDiscountTiers } from "@/db/schema";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { Breadcrumb } from "@/components/breadcrumb";
import { NavTabs } from "@/components/nav-tabs";
import { SHOP_LEVEL1_TABS } from "../shop-nav-tabs";
import { DiscountTiersManager } from "./discount-tiers-manager";

export default async function ShopDiscountsPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user) {
    redirect("/login");
  }
  if (!canManageShop(session.user.role)) {
    redirect("/?error=forbidden");
  }

  const tiers = await db
    .select({
      id: shopDiscountTiers.id,
      thresholdCents: shopDiscountTiers.thresholdCents,
      discountPercent: shopDiscountTiers.discountPercent,
      stripeCouponId: shopDiscountTiers.stripeCouponId,
      sortOrder: shopDiscountTiers.sortOrder,
    })
    .from(shopDiscountTiers)
    .orderBy(shopDiscountTiers.thresholdCents);

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
          items={[{ label: "Admin", href: "/admin" }, { label: "Shop verwalten", href: "/admin/shop" }, { label: "Rabattstufen" }]}
          className="mt-4"
        />
        <h1 className="mb-2 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <Percent className="size-6 text-primary" />
          Rabattstufen
        </h1>
        <NavTabs items={SHOP_LEVEL1_TABS} active="discounts" className="mb-6" />
        <DiscountTiersManager tiers={tiers} />
      </div>
    </main>
  );
}
