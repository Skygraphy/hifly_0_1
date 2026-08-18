import Link from "next/link";
import { ShoppingBag, Package, Printer, ArrowRight, Star } from "lucide-react";
import { auth } from "@/auth";
import { listCatalogPackages, listCatalogPrintFormats, stripHtmlSnippet } from "@/lib/shop-catalog";
import { formatPriceCents } from "@/lib/shop";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { CustomerNav } from "@/components/customer-nav";
import { Breadcrumb } from "@/components/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SNIPPET_LENGTH = 120;

/**
 * Storefront-Startseite — öffentlich, kein auth()-Redirect (wie /cart).
 * Zeigt Pakete/Druckformate als reine Informations-/Preisübersicht ("ab
 * X €", Minimum über alle konfigurierten Kategorien/Qualitäten) — der
 * tatsächliche Preis entsteht erst in Kombination mit einem konkreten
 * Bild (siehe src/lib/shop-resolution.ts), daher kein Warenkorb-Button
 * hier, nur ein CTA zu /images.
 */
export default async function ShopPage() {
  const [session, packages, printFormats] = await Promise.all([
    auth(),
    listCatalogPackages(),
    listCatalogPrintFormats(),
  ]);

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/images" label="Zurück zu den Bildern" />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session?.user ?? null} />
          <AccountMenu user={session?.user ?? null} />
        </div>
      </AccountMenuSlot>
      <div className="mx-auto max-w-6xl">
        <div className="mt-6 flex flex-wrap items-center justify-between gap-y-2">
          <BrandMark />
          <CustomerNav active="shop" />
        </div>
        <Breadcrumb items={[{ label: "Start", href: "/" }, { label: "Shop" }]} className="mt-4" />
        <h1 className="mb-2 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <ShoppingBag className="size-6 text-primary" />
          Shop
        </h1>
        <p className="mb-6 max-w-xl text-sm text-muted-foreground">
          Deine Fotos als digitaler Download oder als physischer Druck. Wähle zuerst ein Bild aus — Pakete und
          Drucke werden dort direkt für genau dieses Bild angeboten.
        </p>
        <Link
          href="/images"
          data-testid="shop-browse-images"
          className={cn(buttonVariants({ variant: "default", size: "lg" }), "mb-10")}
        >
          Bilder durchstöbern
        </Link>

        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Package className="size-5 text-primary" />
            Digitale Pakete
          </h2>
          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Pakete verfügbar.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((pkg) => (
                <Link key={pkg.id} href={`/shop/packages/${pkg.id}`} data-testid={`shop-package-card-${pkg.id}`}>
                  <Card
                    className={cn(
                      "h-full transition-colors hover:bg-muted/50",
                      pkg.isFeatured && "ring-2 ring-primary/40"
                    )}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2 text-base">
                        {pkg.name}
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">
                        {pkg.description ? stripHtmlSnippet(pkg.description, SNIPPET_LENGTH) : "Keine Beschreibung"}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="w-fit">
                          {pkg.minPriceCents !== null ? `Ab ${formatPriceCents(pkg.minPriceCents)}` : "Preis auf Anfrage"}
                        </Badge>
                        {pkg.isFeatured && (
                          <Badge variant="default" className="w-fit gap-1" data-testid={`shop-package-featured-${pkg.id}`}>
                            <Star className="size-3" />
                            Am beliebtesten
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Printer className="size-5 text-primary" />
            Drucke
          </h2>
          {printFormats.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Druckformate verfügbar.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {printFormats.map((format) => (
                <Link key={format.id} href={`/shop/prints/${format.id}`} data-testid={`shop-print-card-${format.id}`}>
                  <Card
                    className={cn(
                      "h-full transition-colors hover:bg-muted/50",
                      format.isFeatured && "ring-2 ring-primary/40"
                    )}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2 text-base">
                        {format.name}
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <p className="text-sm text-muted-foreground">
                        {format.widthCm} × {format.heightCm} cm
                        {format.description ? ` — ${stripHtmlSnippet(format.description, SNIPPET_LENGTH)}` : ""}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="w-fit">
                          {format.minPriceCents !== null ? `Ab ${formatPriceCents(format.minPriceCents)}` : "Preis auf Anfrage"}
                        </Badge>
                        {format.isFeatured && (
                          <Badge variant="default" className="w-fit gap-1" data-testid={`shop-print-featured-${format.id}`}>
                            <Star className="size-3" />
                            Am beliebtesten
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
