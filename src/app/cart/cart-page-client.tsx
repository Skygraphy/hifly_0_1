"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, ShoppingCart, Download, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NumberInput } from "@/components/ui/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CopyableId } from "@/components/image-preview-popup";
import { useCartStore, type CartItem } from "@/lib/cart-store";
import { formatPriceCents } from "@/lib/shop";
import { resolveDiscountTier, calculateDiscountCents, type ShopDiscountTier } from "@/lib/orders";
import { createCheckoutSession } from "@/app/checkout/actions";
import { showAppAlert } from "@/lib/app-alert";
import { cn } from "@/lib/utils";

function cartItemKey(item: CartItem): string {
  return `${item.kind}:${item.imageId}:${item.packageId ?? ""}:${item.printFormatId ?? ""}:${item.printQualityId ?? ""}`;
}

/**
 * Reine UX-Ansicht des Warenkorb-Stores (src/lib/cart-store.ts) —
 * Zwischensumme/Rabatt/Versand hier sind eine clientseitige VORSCHAU aus
 * den beim Hinzufügen gespeicherten Preis-Snapshots, keine Autorität. Beim
 * tatsächlichen "Zur Kasse" validiert createCheckoutSession
 * (src/app/checkout/actions.ts) jede Position serverseitig neu (Konzept-
 * Plan Abschnitt 3) — weicht die Vorschau hier vom serverseitigen Ergebnis
 * ab (z.B. weil sich in der Zwischenzeit ein Preis geändert hat), gewinnt
 * IMMER der Server, nie diese Anzeige.
 */
export function CartPageClient({
  isLoggedIn,
  tiers,
  shippingCents,
}: {
  isLoggedIn: boolean;
  tiers: ShopDiscountTier[];
  shippingCents: number;
}) {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const [isPending, startTransition] = useTransition();

  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const tier = resolveDiscountTier(subtotalCents, tiers);
  const discountCents = calculateDiscountCents(subtotalCents, tier);
  const hasPrintItem = items.some((item) => item.kind === "print");
  const hasDigitalItem = items.some((item) => item.kind === "digital_package");
  const effectiveShippingCents = hasPrintItem ? shippingCents : 0;
  const totalCents = subtotalCents - discountCents + effectiveShippingCents;

  function handleCheckout() {
    startTransition(async () => {
      const result = await createCheckoutSession(
        items.map((item) => ({
          imageId: item.imageId,
          kind: item.kind,
          packageId: item.packageId ?? undefined,
          printFormatId: item.printFormatId ?? undefined,
          printQualityId: item.printQualityId ?? undefined,
          quantity: item.quantity,
        }))
      );
      // Bei Erfolg legt createCheckoutSession nur die Bestellung an (kein
      // Stripe-API-Call mehr hier, siehe checkout/actions.ts) — das
      // eigentliche Zahlungsformular lebt auf /checkout/[orderId].
      if (result.success && result.id) {
        router.push(`/checkout/${result.id}?from=cart`);
      } else {
        showAppAlert(result.error ?? "Zur Kasse gehen fehlgeschlagen.");
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center" data-testid="cart-empty">
        <ShoppingCart className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Dein Warenkorb ist leer.</p>
        <Link href="/images" className={cn(buttonVariants({ variant: "outline" }))}>
          Zu den Bildern
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const key = cartItemKey(item);
          return (
            <div key={key} data-testid={`cart-item-${key}`} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <Link
                href={`/shop/image/${item.imageId}`}
                // Hover-Feedback als Hintergrund statt Text-Unterstrich —
                // dieselbe Konvention wie bei anderen klickbaren
                // Bild-Zeilen (siehe shop-image-override-manager.tsx/
                // print-image-override-manager.tsx: hover:bg-muted), statt
                // eines aus dem Rahmen fallenden Unterstrichs nur auf dem
                // Titeltext.
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-colors hover:bg-muted"
                data-testid={`cart-item-link-${key}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- fertige
                    Thumbnail-Datei aus S3, next/image bringt hier keine
                    Optimierung (Konvention wie in image-preview-popup.tsx). */}
                <img src={item.thumbUrl} alt="" className="size-16 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.label}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1 shrink-0">
                      {item.kind === "digital_package" ? <Download className="size-3" /> : <Printer className="size-3" />}
                      {item.kind === "digital_package" ? "Digital" : "Druck"}
                    </Badge>
                    {/* item.hash fehlt bei Positionen, die vor Einführung
                        dieses Felds zum Warenkorb hinzugefügt und seither
                        aus dem localStorage-Snapshot geladen wurden — Badge
                        dann weglassen statt eine leere "ID" anzuzeigen. */}
                    {item.hash && <CopyableId id={item.hash} size="xs" testId={`cart-item-copy-id-${key}`} />}
                    <span className="text-xs text-muted-foreground">
                      {formatPriceCents(item.priceCents)}
                      {item.kind === "print" ? " / Stück" : ""}
                    </span>
                  </div>
                </div>
              </Link>
              {item.kind === "print" && (
                <NumberInput
                  min={1}
                  max={50}
                  value={item.quantity}
                  onChange={(event) => setQuantity(item, Number(event.target.value))}
                  className="w-20"
                  data-testid={`cart-item-quantity-${key}`}
                />
              )}
              <p className="w-20 shrink-0 text-right text-sm font-medium">{formatPriceCents(item.priceCents * item.quantity)}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Entfernen"
                data-testid={`cart-item-remove-${key}`}
                onClick={() => removeItem(item)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>

      {hasDigitalItem && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="cart-download-hint">
          <Download className="size-3.5 shrink-0" />
          Digitale Pakete stehen nach erfolgreicher Zahlung unter{" "}
          <Link href="/orders" className="font-bold hover:underline">
            Meine Bestellungen
          </Link>{" "}
          zum Download bereit.
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Zwischensumme</span>
            <span>{formatPriceCents(subtotalCents)}</span>
          </div>
          {tier && (
            <div className="flex justify-between text-sm text-primary" data-testid="cart-discount-row">
              <span>Rabatt ({tier.discountPercent} %)</span>
              <span>−{formatPriceCents(discountCents)}</span>
            </div>
          )}
          {hasPrintItem && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Versand</span>
              <span>{formatPriceCents(effectiveShippingCents)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <span>Gesamt</span>
            <span data-testid="cart-total">{formatPriceCents(totalCents)}</span>
          </div>
        </CardContent>
      </Card>

      {isLoggedIn ? (
        <Button size="lg" disabled={isPending} onClick={handleCheckout} data-testid="cart-checkout-button">
          {isPending ? "Wird vorbereitet…" : "Zur Kasse"}
        </Button>
      ) : (
        <Popover>
          <PopoverTrigger
            type="button"
            data-testid="cart-checkout-button"
            className={cn(buttonVariants({ size: "lg" }), "w-full")}
          >
            Zur Kasse
          </PopoverTrigger>
          <PopoverContent align="center" className="w-64 p-3 text-sm">
            <p className="text-muted-foreground">Melde dich an, um deine Bestellung abzuschließen.</p>
            <Link href="/login" data-testid="cart-login-link" className="mt-2 inline-block font-medium text-primary hover:underline">
              Jetzt anmelden
            </Link>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
