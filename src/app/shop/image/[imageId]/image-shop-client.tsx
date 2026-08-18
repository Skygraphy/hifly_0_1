"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package as PackageIcon, Printer, ShoppingCart, Star, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NumberInput } from "@/components/ui/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCartStore } from "@/lib/cart-store";
import { formatPriceCents } from "@/lib/shop";
import { createCheckoutSession, type CheckoutCartItemInput } from "@/app/checkout/actions";
import { showAppAlert } from "@/lib/app-alert";
import { cn } from "@/lib/utils";

export interface ImageShopPackage {
  packageId: string;
  packageName: string;
  priceCents: number;
  isFeatured: boolean;
  descriptionNode: ReactNode;
}

export interface ImageShopPrintQuality {
  printQualityId: string;
  printQualityName: string;
  priceCents: number;
}

export interface ImageShopPrintFormat {
  printFormatId: string;
  printFormatName: string;
  widthCm: number;
  heightCm: number;
  isFeatured: boolean;
  descriptionNode: ReactNode;
  qualities: ImageShopPrintQuality[];
}

/** Vorausgewählte Druckqualität — "Premium-Fotopapier" als sinnvoller
 * Mittelweg-Vorschlag statt der günstigsten Qualität (bisher schlicht
 * qualities[0]). Bewusst NUR die Vorauswahl, keine eigene Markierung auf
 * der Qualitätsstufe (auf Wunsch des Users: reine Empfehlung, jederzeit
 * änderbar, kein "Am beliebtesten" auf dieser Ebene). */
const PREFERRED_QUALITY_NAME = "Premium-Fotopapier";

function defaultQualityId(qualities: ImageShopPrintQuality[]): string {
  const preferred = qualities.find((quality) => quality.printQualityName === PREFERRED_QUALITY_NAME);
  return (preferred ?? qualities[0])?.printQualityId ?? "";
}

/**
 * Strukturierte Produktseite für EIN Bild (siehe AddToCartButton) — Pakete
 * haben nie eine Mengenauswahl (der Warenkorb erzwingt ohnehin Menge 1,
 * siehe cart-store.ts), Drucke schon, weil davon mehrere Stück bestellbar
 * sind. "Sofort kaufen" nutzt denselben Login-Hinweis-Popover wie "Zur
 * Kasse" auf /cart (createCheckoutSession validiert serverseitig ohnehin
 * neu — der Store hier ist reine Anzeige/Übergabe der Auswahl).
 */
export function ImageShopClient({
  imageId,
  hash,
  thumbUrl,
  previewUrl,
  isLoggedIn,
  packages,
  prints,
}: {
  imageId: string;
  hash: string;
  thumbUrl: string;
  previewUrl: string;
  isLoggedIn: boolean;
  packages: ImageShopPackage[];
  prints: ImageShopPrintFormat[];
}) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const [isPending, startTransition] = useTransition();

  function buyNow(item: CheckoutCartItemInput) {
    startTransition(async () => {
      const result = await createCheckoutSession([item]);
      // Bei Erfolg legt createCheckoutSession nur die Bestellung an (kein
      // Stripe-API-Call/Redirect mehr, siehe checkout/actions.ts) — das
      // Zahlungsformular lebt auf /checkout/[orderId] (gleiches Muster wie
      // CartPageClient).
      if (result.success && result.id) {
        router.push(`/checkout/${result.id}?from=shop`);
      } else {
        showAppAlert(result.error ?? "Sofortkauf fehlgeschlagen.");
      }
    });
  }

  if (packages.length === 0 && prints.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center gap-4 py-16 text-center" data-testid="shop-image-empty">
        <ShoppingCart className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Für dieses Bild ist aktuell nichts bestellbar.</p>
        <Link href="/images" className={cn(buttonVariants({ variant: "outline" }))}>
          Zurück zu den Bildern
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- fertige Vorschau-Datei aus S3, next/image bringt hier keine Optimierung (Konvention wie image-preview-popup.tsx) */}
      <img
        src={previewUrl}
        alt=""
        className="h-fit w-full rounded-lg border object-cover"
        data-testid="shop-image-preview"
      />

      <div className="flex flex-col gap-8">
        {packages.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <PackageIcon className="size-5 text-primary" />
              Digitale Pakete
            </h2>
            <div className="flex flex-col gap-3">
              {packages.map((pkg) => (
                <PackageCard
                  key={pkg.packageId}
                  pkg={pkg}
                  isLoggedIn={isLoggedIn}
                  isPending={isPending}
                  onAddToCart={() =>
                    addItem({
                      imageId,
                      hash,
                      kind: "digital_package",
                      packageId: pkg.packageId,
                      categoryId: null,
                      printFormatId: null,
                      printQualityId: null,
                      label: pkg.packageName,
                      priceCents: pkg.priceCents,
                      thumbUrl,
                    })
                  }
                  onBuyNow={() => buyNow({ imageId, kind: "digital_package", packageId: pkg.packageId, quantity: 1 })}
                />
              ))}
            </div>
          </section>
        )}

        {prints.length > 0 && (
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Printer className="size-5 text-primary" />
              Drucke
            </h2>
            <div className="flex flex-col gap-3">
              {prints.map((format) => (
                <PrintFormatCard
                  key={format.printFormatId}
                  format={format}
                  isLoggedIn={isLoggedIn}
                  isPending={isPending}
                  onAddToCart={(quality, quantity) => {
                    // addItem kennt keine Menge (siehe cart-store.ts:
                    // erneutes Hinzufügen erhöht Drucke um 1) — mehrfacher
                    // Aufruf addiert die gewählte Menge zu einer eventuell
                    // bereits im Warenkorb liegenden Position hinzu, statt
                    // sie zu überschreiben.
                    for (let i = 0; i < quantity; i++) {
                      addItem({
                        imageId,
                        hash,
                        kind: "print",
                        packageId: null,
                        categoryId: null,
                        printFormatId: format.printFormatId,
                        printQualityId: quality.printQualityId,
                        label: `Druck ${format.printFormatName}, ${quality.printQualityName}`,
                        priceCents: quality.priceCents,
                        thumbUrl,
                      });
                    }
                  }}
                  onBuyNow={(quality, quantity) =>
                    buyNow({
                      imageId,
                      kind: "print",
                      printFormatId: format.printFormatId,
                      printQualityId: quality.printQualityId,
                      quantity,
                    })
                  }
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function BuyNowButton({
  isLoggedIn,
  isPending,
  onBuyNow,
  testId,
  loginTestId,
}: {
  isLoggedIn: boolean;
  isPending: boolean;
  onBuyNow: () => void;
  testId: string;
  loginTestId: string;
}) {
  if (isLoggedIn) {
    return (
      <Button size="sm" disabled={isPending} onClick={onBuyNow} data-testid={testId}>
        <Zap className="size-3.5" />
        Sofort kaufen
      </Button>
    );
  }
  return (
    <Popover>
      <PopoverTrigger type="button" data-testid={testId} className={cn(buttonVariants({ size: "sm" }))}>
        <Zap className="size-3.5" />
        Sofort kaufen
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64 p-3 text-sm">
        <p className="text-muted-foreground">Melde dich an, um sofort zu kaufen.</p>
        <Link href="/login" data-testid={loginTestId} className="mt-2 inline-block font-medium text-primary hover:underline">
          Jetzt anmelden
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function PackageCard({
  pkg,
  isLoggedIn,
  isPending,
  onAddToCart,
  onBuyNow,
}: {
  pkg: ImageShopPackage;
  isLoggedIn: boolean;
  isPending: boolean;
  onAddToCart: () => void;
  onBuyNow: () => void;
}) {
  return (
    <Card
      className={cn(pkg.isFeatured && "ring-2 ring-primary/40")}
      data-testid={`shop-image-package-${pkg.packageId}`}
    >
      <CardContent className="flex flex-col pt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-medium">
            {pkg.packageName}
            {pkg.isFeatured && (
              <Badge variant="default" className="gap-1" data-testid={`shop-image-package-featured-${pkg.packageId}`}>
                <Star className="size-3" />
                Am beliebtesten
              </Badge>
            )}
          </h3>
          <span className="shrink-0 text-base font-semibold">{formatPriceCents(pkg.priceCents)}</span>
        </div>
        <div className="mt-3">{pkg.descriptionNode}</div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddToCart}
            data-testid={`shop-image-package-add-${pkg.packageId}`}
          >
            <ShoppingCart className="size-3.5" />
            In den Warenkorb
          </Button>
          <BuyNowButton
            isLoggedIn={isLoggedIn}
            isPending={isPending}
            onBuyNow={onBuyNow}
            testId={`shop-image-package-buy-now-${pkg.packageId}`}
            loginTestId={`shop-image-package-login-link-${pkg.packageId}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PrintFormatCard({
  format,
  isLoggedIn,
  isPending,
  onAddToCart,
  onBuyNow,
}: {
  format: ImageShopPrintFormat;
  isLoggedIn: boolean;
  isPending: boolean;
  onAddToCart: (quality: ImageShopPrintQuality, quantity: number) => void;
  onBuyNow: (quality: ImageShopPrintQuality, quantity: number) => void;
}) {
  const [qualityId, setQualityId] = useState(defaultQualityId(format.qualities));
  const [quantity, setQuantity] = useState(1);
  const selectedQuality = format.qualities.find((quality) => quality.printQualityId === qualityId) ?? format.qualities[0];

  return (
    <Card
      className={cn(format.isFeatured && "ring-2 ring-primary/40")}
      data-testid={`shop-image-print-${format.printFormatId}`}
    >
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-lg font-medium">
            {format.printFormatName}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({format.widthCm} × {format.heightCm} cm)
            </span>
            {format.isFeatured && (
              <Badge variant="default" className="gap-1" data-testid={`shop-image-print-featured-${format.printFormatId}`}>
                <Star className="size-3" />
                Am beliebtesten
              </Badge>
            )}
          </h3>
          {selectedQuality && (
            <span className="shrink-0 text-base font-semibold" data-testid={`shop-image-print-total-${format.printFormatId}`}>
              {formatPriceCents(selectedQuality.priceCents * quantity)}
            </span>
          )}
        </div>
        {format.descriptionNode}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Select value={qualityId} onValueChange={(next) => next && setQualityId(next)}>
            <SelectTrigger data-testid={`shop-image-print-quality-${format.printFormatId}`} className="w-64">
              <SelectValue>
                {selectedQuality ? `${selectedQuality.printQualityName} — ${formatPriceCents(selectedQuality.priceCents)}` : ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {format.qualities.map((quality) => (
                <SelectItem key={quality.printQualityId} value={quality.printQualityId}>
                  {quality.printQualityName} — {formatPriceCents(quality.priceCents)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <NumberInput
            min={1}
            max={50}
            value={quantity}
            onChange={(event) => setQuantity(Math.min(50, Math.max(1, Number(event.target.value) || 1)))}
            className="w-20"
            data-testid={`shop-image-print-quantity-${format.printFormatId}`}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!selectedQuality}
            onClick={() => selectedQuality && onAddToCart(selectedQuality, quantity)}
            data-testid={`shop-image-print-add-${format.printFormatId}`}
          >
            <ShoppingCart className="size-3.5" />
            In den Warenkorb
          </Button>
          <BuyNowButton
            isLoggedIn={isLoggedIn}
            isPending={isPending}
            onBuyNow={() => selectedQuality && onBuyNow(selectedQuality, quantity)}
            testId={`shop-image-print-buy-now-${format.printFormatId}`}
            loginTestId={`shop-image-print-login-link-${format.printFormatId}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
