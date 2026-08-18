import { notFound } from "next/navigation";
import Link from "next/link";
import { Printer, Star } from "lucide-react";
import { auth } from "@/auth";
import { getCatalogPrintFormatDetail } from "@/lib/shop-catalog";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function ShopPrintFormatDetailPage({
  params,
}: {
  params: Promise<{ formatId: string }>;
}) {
  const { formatId } = await params;
  const [session, detail] = await Promise.all([auth(), getCatalogPrintFormatDetail(formatId)]);
  if (!detail) notFound();

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
            { label: "Drucke" },
            { label: detail.name },
          ]}
          className="mt-4"
        />
        <h1 className="mb-2 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <Printer className="size-6 text-primary" />
          {detail.name}
          {detail.isFeatured && (
            <Badge variant="default" className="gap-1" data-testid="shop-print-detail-featured">
              <Star className="size-3" />
              Am beliebtesten
            </Badge>
          )}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {detail.widthCm} × {detail.heightCm} cm — {detail.minPriceCents !== null ? `Ab ${formatPriceCents(detail.minPriceCents)}` : "Preis auf Anfrage"}
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
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Preise nach Druckqualität</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.prices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Für dieses Format ist noch kein Preis hinterlegt.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Qualität</TableHead>
                    <TableHead className="text-right">Preis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.prices.map((price) => (
                    <TableRow key={price.printQualityId}>
                      <TableCell>{price.printQualityName}</TableCell>
                      <TableCell className="text-right">{formatPriceCents(price.priceCents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <p className="mb-4 text-sm text-muted-foreground">
          Der genaue Preis hängt vom gewählten Bild ab — wähle dein Bild aus, um zu sehen, welche Qualitäten dafür
          verfügbar sind.
        </p>
        <Link href="/images" data-testid="shop-print-browse-images" className={cn(buttonVariants({ variant: "default", size: "lg" }))}>
          Bilder durchstöbern
        </Link>
      </div>
    </main>
  );
}
