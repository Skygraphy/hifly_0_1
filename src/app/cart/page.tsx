import { ShoppingCart } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { shopDiscountTiers } from "@/db/schema";
import { getGlobalSettings } from "@/lib/settings-service";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { CustomerNav } from "@/components/customer-nav";
import { Breadcrumb } from "@/components/breadcrumb";
import { CartPageClient } from "./cart-page-client";

// Öffentlich erreichbar (kein auth()-Redirect) — der Warenkorb selbst lebt
// nur im Browser (siehe src/lib/cart-store.ts), ansehen/bearbeiten darf
// jeder. Erst der "Zur Kasse"-Schritt verlangt ein Konto (siehe
// Konzept-Plan, Context, und CartPageClient).
export default async function CartPage() {
  const session = await auth();

  const [tiers, globalSettings] = await Promise.all([
    db
      .select({
        id: shopDiscountTiers.id,
        thresholdCents: shopDiscountTiers.thresholdCents,
        discountPercent: shopDiscountTiers.discountPercent,
        stripeCouponId: shopDiscountTiers.stripeCouponId,
        sortOrder: shopDiscountTiers.sortOrder,
      })
      .from(shopDiscountTiers),
    getGlobalSettings(),
  ]);
  const shippingCents = Number(globalSettings.shop_print_shipping_cents ?? 0);

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/images" label="Zurück zu den Bildern" />
      {session?.user && (
        <AccountMenuSlot>
          <div className="flex items-center gap-2">
            <DisplaySettingsMenu user={session.user} />
            <AccountMenu user={session.user} />
          </div>
        </AccountMenuSlot>
      )}
      <div className="mx-auto max-w-6xl">
        <div className="mt-6 flex flex-wrap items-center justify-between gap-y-2">
          <BrandMark />
          <CustomerNav active="cart" />
        </div>
        <Breadcrumb items={[{ label: "Start", href: "/" }, { label: "Warenkorb" }]} className="mt-4" />
        <h1 className="mb-6 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <ShoppingCart className="size-6 text-primary" />
          Warenkorb
        </h1>
        <CartPageClient isLoggedIn={Boolean(session?.user)} tiers={tiers} shippingCents={shippingCents} />
      </div>
    </main>
  );
}
