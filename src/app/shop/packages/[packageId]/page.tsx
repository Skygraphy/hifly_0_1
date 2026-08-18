import { notFound } from "next/navigation";
import Link from "next/link";
import { Package, Star } from "lucide-react";
import { auth } from "@/auth";
import { getCatalogPackageDetail, summarizePriceRange } from "@/lib/shop-catalog";
import { formatPriceCents } from "@/lib/shop";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { CustomerNav } from "@/components/customer-nav";
import { Breadcrumb } from "@/components/breadcrumb";
import { SanitizedHtml } from "@/components/sanitized-html";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function ShopPackageDetailPage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  const { packageId } = await params;
  const [session, detail] = await Promise.all([auth(), getCatalogPackageDetail(packageId)]);
  if (!detail) notFound();
  const priceRange = summarizePriceRange(detail.prices.map((price) => price.priceCents));

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/shop" label="Zurück zum Shop" />
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
        <Breadcrumb
          items={[
            { label: "Start", href: "/" },
            { label: "Shop", href: "/shop" },
            { label: "Digitale Pakete" },
            { label: detail.name },
          ]}
          className="mt-4"
        />
        <h1 className="mb-2 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <Package className="size-6 text-primary" />
          {detail.name}
          {detail.isFeatured && (
            <Badge variant="default" className="gap-1" data-testid="shop-package-detail-featured">
              <Star className="size-3" />
              Am beliebtesten
            </Badge>
          )}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {detail.minPriceCents !== null ? `Ab ${formatPriceCents(detail.minPriceCents)}` : "Preis auf Anfrage"}
        </p>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Beschreibung</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.description ? (
              <SanitizedHtml
                html={detail.description}
                className="text-sm text-muted-foreground [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:italic [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
              />
            ) : (
              <p className="text-sm text-muted-foreground italic">Keine Beschreibung</p>
            )}
            {detail.includedFiles.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {detail.includedFiles.map((file) => (
                  <Badge key={file} variant="secondary" className="text-xs">
                    {file}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Preis</CardTitle>
            {priceRange && (
              <CardAction data-testid="shop-package-price-summary">
                {priceRange.minCents === priceRange.maxCents ? (
                  <span className="text-base font-semibold">{formatPriceCents(priceRange.minCents)}</span>
                ) : (
                  <>
                    <span className="text-base font-semibold">
                      {formatPriceCents(priceRange.minCents)} – {formatPriceCents(priceRange.maxCents)}
                    </span>
                    <span className="text-sm text-muted-foreground"> · Ø {formatPriceCents(priceRange.avgCents)}</span>
                  </>
                )}
              </CardAction>
            )}
          </CardHeader>
          {(!priceRange || priceRange.minCents !== priceRange.maxCents) && (
            <CardContent>
              {!priceRange ? (
                <p className="text-sm text-muted-foreground">Für dieses Paket ist noch kein Preis hinterlegt.</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Der Preis wird je nach Standort, Motiv, Inhalt und weiteren Faktoren des jeweiligen Bildes gestaffelt.
                </p>
              )}
            </CardContent>
          )}
        </Card>

        <Link href="/images" data-testid="shop-package-browse-images" className={cn(buttonVariants({ variant: "default", size: "lg" }))}>
          Bilder durchstöbern
        </Link>
      </div>
    </main>
  );
}
