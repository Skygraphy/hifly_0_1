import { redirect } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, Package, Printer, Percent, ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { canManageShop } from "@/lib/authorization";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { Breadcrumb } from "@/components/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  {
    href: "/admin/shop/packages",
    icon: Package,
    title: "Pakete",
    description: "Digitale Download-Bundles (z.B. Web, Print Private, Business Premium), gestaffelt nach Kategorie.",
  },
  {
    href: "/admin/shop/prints",
    icon: Printer,
    title: "Drucke",
    description: "Physische Ausdrucke in festen Formaten (A2–A5), gestaffelt nach Druckqualität.",
  },
  {
    href: "/admin/shop/discounts",
    icon: Percent,
    title: "Rabattstufen",
    description: "Staffel-Rabatt auf den Warenwert einer gesamten Bestellung (Pakete UND Drucke zusammen).",
  },
] as const;

/**
 * Reiner Einstiegspunkt in den Shop — zeigt Pakete und Drucke als zwei
 * gleichwertige Produktlinien nebeneinander (auf Wunsch des Users: vorher
 * WAR diese Seite direkt der Paket-Katalog, wodurch "Shop verwalten" beim
 * Wechsel zu Drucke verschwand, statt als gemeinsames Dach sichtbar zu
 * bleiben). Jede Produktlinie hat ihre eigene, strukturgleiche Unterseite
 * mit Katalog + Standort-Zuordnung + Bild-Overrides (siehe
 * src/app/admin/shop/packages/page.tsx bzw. .../prints/page.tsx).
 */
export default async function ShopPage() {
  const session = await auth();

  // Unabhängig von der Middleware erneut geprüft (defense in depth).
  if (!session?.user) {
    redirect("/login");
  }
  if (!canManageShop(session.user.role)) {
    redirect("/?error=forbidden");
  }

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
        <Breadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "Shop verwalten" }]} className="mt-4" />
        <h1 className="mb-6 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <ShoppingBag className="size-6 text-primary" />
          Shop verwalten
        </h1>
        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <Link key={section.href} href={section.href} data-testid={`shop-section-${section.title.toLowerCase()}`}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-xl">
                    <span className="flex items-center gap-2">
                      <section.icon className="size-5 text-primary" />
                      {section.title}
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{section.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
