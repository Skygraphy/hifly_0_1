"use client";

import { useTransition } from "react";
import Link from "next/link";
import { PackageOpen, Download, Printer, Truck, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableId } from "@/components/image-preview-popup";
import { formatPriceCents } from "@/lib/shop";
import { ORDER_STATUS_LABELS, type OrderStatus, type OrderLineItemFulfillmentStatus, type OrderLineItemKind } from "@/lib/orders";
import { requestDownloadUrls } from "./actions";
import { showAppAlert } from "@/lib/app-alert";
import { cn } from "@/lib/utils";

interface OrderLineItemRow {
  id: string;
  orderId: string;
  imageId: string;
  hash: string;
  kind: OrderLineItemKind;
  priceCents: number;
  quantity: number;
  snapshotLabel: string;
  fulfillmentStatus: OrderLineItemFulfillmentStatus;
  fulfilledAt: Date | null;
  thumbUrl: string;
}

interface OrderRow {
  id: string;
  status: OrderStatus;
  subtotalCents: number;
  discountPercent: number | null;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  createdAt: Date;
  lineItems: OrderLineItemRow[];
}

const DATE_FORMATTER = new Intl.DateTimeFormat("de-AT", { dateStyle: "medium" });

function DownloadButton({ lineItemId }: { lineItemId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await requestDownloadUrls(lineItemId);
      if (!result.success || !result.files) {
        showAppAlert(result.error ?? "Download fehlgeschlagen.");
        return;
      }
      // Presigned URLs sind kurzlebig (siehe requestDownloadUrls) — direkt
      // in neuen Tabs öffnen statt sie irgendwo zwischenzuspeichern.
      for (const file of result.files) {
        window.open(file.url, "_blank", "noopener,noreferrer");
      }
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleClick} data-testid={`order-download-${lineItemId}`}>
      <Download className="size-4" />
      {isPending ? "Lädt…" : "Download"}
    </Button>
  );
}

/**
 * Setzt eine bei Stripe abgebrochene/nicht abgeschlossene Zahlung fort —
 * /checkout/[orderId] holt sich das Stripe-client_secret für dieselbe
 * (bereits bestehende) Bestellung selbst über getCheckoutClientSecret
 * (siehe src/app/checkout/actions.ts), kein eigener Server-Call mehr hier
 * nötig.
 */
function PayNowButton({ orderId }: { orderId: string }) {
  return (
    <Link href={`/checkout/${orderId}?from=orders`} className={cn(buttonVariants({ size: "sm" }))} data-testid={`order-pay-now-${orderId}`}>
      <CreditCard className="size-4" />
      Jetzt bezahlen
    </Link>
  );
}

/**
 * snapshotLabel (siehe createCheckoutSession in src/app/checkout/actions.ts)
 * ist bewusst ausführlich — u.a. der Produktname auf der Stripe-Checkout-
 * Seite selbst, wo der Bild-Bezug ("— Bild XY123Z") hilfreich ist, weil dort
 * kein Thumbnail/ID-Badge daneben steht. Hier auf der Bestellübersicht steht
 * beides bereits separat (Thumb + CopyableId, siehe LineItemRow), daher nur
 * der reine Produktname — dieselbe Kürze wie im Warenkorb (CartPageClient:
 * item.label wird dort ohne Bild-Suffix/Kategorie gesetzt).
 */
function displayLabel(item: OrderLineItemRow): string {
  const withoutImageSuffix = item.snapshotLabel.replace(/ — Bild .*$/, "");
  if (item.kind !== "digital_package") return withoutImageSuffix;
  const match = withoutImageSuffix.match(/^Paket „(.+)“ \(Kategorie .+\)$/);
  return match ? match[1] : withoutImageSuffix;
}

function LineItemRow({ item, orderStatus }: { item: OrderLineItemRow; orderStatus: OrderStatus }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2" data-testid={`order-line-item-${item.id}`}>
      {/* Hover-Feedback als Hintergrund statt Text-Unterstrich — dieselbe
          Konvention wie bei anderen klickbaren Bild-Zeilen (siehe
          shop-image-override-manager.tsx/print-image-override-manager.tsx:
          hover:bg-muted, ebenso CartPageClient). */}
      <Link
        href={`/shop/image/${item.imageId}?from=orders`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-colors hover:bg-muted"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- fertige
            Thumbnail-Datei aus S3, next/image bringt hier keine Optimierung
            (Konvention wie in image-preview-popup.tsx). */}
        <img src={item.thumbUrl} alt="" className="size-16 shrink-0 rounded object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayLabel(item)}</p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 shrink-0">
              {item.kind === "digital_package" ? <Download className="size-3" /> : <Printer className="size-3" />}
              {item.kind === "digital_package" ? "Digital" : "Druck"}
            </Badge>
            <CopyableId id={item.hash} size="xs" testId={`order-line-item-copy-id-${item.id}`} />
            <span className="text-xs text-muted-foreground">
              {formatPriceCents(item.priceCents)}
              {item.quantity > 1 ? ` × ${item.quantity}` : ""}
            </span>
          </div>
        </div>
      </Link>
      {item.kind === "digital_package" && orderStatus === "paid" && <DownloadButton lineItemId={item.id} />}
      {item.kind === "print" && orderStatus === "paid" && (
        <Badge variant="secondary" className="gap-1.5 shrink-0" data-testid={`order-fulfillment-${item.id}`}>
          <Truck className="size-3.5" />
          {item.fulfillmentStatus === "fulfilled"
            ? `Versendet${item.fulfilledAt ? ` am ${DATE_FORMATTER.format(item.fulfilledAt)}` : ""}`
            : "Wird versendet"}
        </Badge>
      )}
    </div>
  );
}

export function OrdersListClient({ orders }: { orders: OrderRow[] }) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center" data-testid="orders-empty">
        <PackageOpen className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Noch keine Bestellungen.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {orders.map((order) => (
        <Card key={order.id} data-testid={`order-row-${order.id}`}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>{DATE_FORMATTER.format(order.createdAt)}</span>
              <span className="flex items-center gap-2">
                <Badge variant={order.status === "paid" ? "default" : "secondary"} data-testid={`order-status-${order.id}`}>
                  {ORDER_STATUS_LABELS[order.status]}
                </Badge>
                {order.status === "pending_payment" && <PayNowButton orderId={order.id} />}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {order.lineItems.map((item) => (
                <LineItemRow key={item.id} item={item} orderStatus={order.status} />
              ))}
            </div>

            {/* Gleiche Aufschlüsselung wie im Warenkorb (CartPageClient) —
                auf Wunsch des Users, damit der Versandanteil auch hier als
                eigene, nachvollziehbare Position sichtbar ist statt nur im
                Gesamtbetrag im Card-Header aufzugehen. */}
            <div className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Zwischensumme</span>
                <span>{formatPriceCents(order.subtotalCents)}</span>
              </div>
              {order.discountCents > 0 && (
                <div className="flex justify-between text-primary" data-testid={`order-discount-${order.id}`}>
                  <span>Rabatt{order.discountPercent !== null ? ` (${order.discountPercent} %)` : ""}</span>
                  <span>−{formatPriceCents(order.discountCents)}</span>
                </div>
              )}
              {order.shippingCents > 0 && (
                <div className="flex justify-between" data-testid={`order-shipping-${order.id}`}>
                  <span className="text-muted-foreground">Versand</span>
                  <span>{formatPriceCents(order.shippingCents)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Gesamt</span>
                <span>{formatPriceCents(order.totalCents)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
