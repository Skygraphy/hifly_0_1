"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Truck, CheckCircle2, Printer, MapPin } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyableId } from "@/components/image-preview-popup";
import { cn } from "@/lib/utils";
import { markOrderLineItemFulfilled } from "./actions";
import { showAppAlert } from "@/lib/app-alert";
import type { OrderShippingAddress } from "@/db/schema";

interface FulfillmentLineItem {
  lineItemId: string;
  imageId: string;
  hash: string;
  thumbUrl: string;
  snapshotLabel: string;
  quantity: number;
  fulfillmentStatus: string;
  fulfilledAt: Date | null;
}

interface FulfillmentOrder {
  orderId: string;
  paidAt: Date | null;
  customerName: string | null;
  customerEmail: string;
  shippingAddress: OrderShippingAddress | null;
  lineItems: FulfillmentLineItem[];
}

const DATE_FORMATTER = new Intl.DateTimeFormat("de-AT", { dateStyle: "medium", timeStyle: "short" });

const TABS: { value: "open" | "shipped" | "all"; label: string }[] = [
  { value: "open", label: "Offen" },
  { value: "shipped", label: "Verschickt" },
  { value: "all", label: "Alle" },
];

/** snapshotLabel enthält "— Bild {hash}" (siehe createCheckoutSession in
 * src/app/checkout/actions.ts) — hier bereits als eigene ID-Badge daneben
 * sichtbar (siehe CopyableId unten), daher im Titeltext redundant. Gleiche
 * Kürzung wie displayLabel in OrdersListClient. */
function displayLabel(snapshotLabel: string): string {
  return snapshotLabel.replace(/ — Bild .*$/, "");
}

/** Einzeilig statt als Block — auf Wunsch des Users direkt an jeder
 * Druck-Position statt nur einmal oben in der Bestellungs-Karte, damit beim
 * Abarbeiten einzelner Positionen immer klar ist, wohin genau dieser Druck
 * geht, ohne zurück zum Karten-Header scrollen zu müssen. */
function formatAddressLine(address: OrderShippingAddress | null): string {
  if (!address) return "Keine Lieferadresse hinterlegt.";
  const namePart = address.name ? `${address.name} — ` : "";
  const line2Part = address.line2 ? `, ${address.line2}` : "";
  return `${namePart}${address.line1}${line2Part}, ${address.postalCode} ${address.city}, ${address.country}`;
}

function MarkFulfilledDialog({ lineItem, onClose, onFulfilled }: { lineItem: FulfillmentLineItem; onClose: () => void; onFulfilled: () => void }) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>„{lineItem.snapshotLabel}“ als verschickt markieren?</AlertDialogTitle>
          <AlertDialogDescription>
            Das kann nicht rückgängig gemacht werden — nur bestätigen, wenn der Druck tatsächlich bereits verpackt/
            übergeben wurde.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            data-testid={`order-fulfill-confirm-${lineItem.lineItemId}`}
            onClick={() => {
              startTransition(async () => {
                const result = await markOrderLineItemFulfilled(lineItem.lineItemId);
                if (!result.success) {
                  showAppAlert(result.error ?? "Aktion fehlgeschlagen.");
                  return;
                }
                onFulfilled();
              });
            }}
          >
            {isPending ? "Wird gespeichert…" : "Als verschickt markieren"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function OrderFulfillmentManager({ tab, orders }: { tab: "open" | "shipped" | "all"; orders: FulfillmentOrder[] }) {
  const router = useRouter();
  const [dialogLineItem, setDialogLineItem] = useState<FulfillmentLineItem | null>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1.5 border-b">
        {TABS.map((tabDef) => (
          <Link
            key={tabDef.value}
            href={`/admin/orders?tab=${tabDef.value}`}
            data-testid={`order-fulfillment-tab-${tabDef.value}`}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium",
              tab === tabDef.value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tabDef.label}
          </Link>
        ))}
      </div>

      {orders.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground" data-testid="order-fulfillment-empty">
          Keine Bestellungen in dieser Ansicht.
        </p>
      )}

      {orders.map((order) => (
        <Card key={order.orderId} data-testid={`order-fulfillment-row-${order.orderId}`}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span>{order.customerName ?? order.customerEmail}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {order.paidAt ? `Bezahlt am ${DATE_FORMATTER.format(order.paidAt)}` : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {order.lineItems.map((item) => (
              <div key={item.lineItemId} data-testid={`order-fulfillment-item-${item.lineItemId}`} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- fertige
                    Thumbnail-Datei aus S3, next/image bringt hier keine
                    Optimierung (Konvention wie in image-preview-popup.tsx). */}
                <img src={item.thumbUrl} alt="" className="size-16 shrink-0 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{displayLabel(item.snapshotLabel)}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1 shrink-0">
                      <Printer className="size-3" />
                      Druck
                    </Badge>
                    <CopyableId id={item.hash} size="xs" testId={`order-fulfillment-copy-id-${item.lineItemId}`} />
                    <span className="text-xs text-muted-foreground">{item.quantity}×</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground" data-testid={`order-fulfillment-address-${item.lineItemId}`}>
                    <MapPin className="size-3 shrink-0" />
                    {formatAddressLine(order.shippingAddress)}
                  </p>
                </div>
                {item.fulfillmentStatus === "fulfilled" ? (
                  <Badge variant="secondary" className="gap-1.5">
                    <CheckCircle2 className="size-3.5" />
                    {item.fulfilledAt ? `Verschickt am ${DATE_FORMATTER.format(item.fulfilledAt)}` : "Verschickt"}
                  </Badge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid={`order-fulfill-open-${item.lineItemId}`}
                    onClick={() => setDialogLineItem(item)}
                  >
                    <Truck className="size-4" />
                    Als verschickt markieren
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {dialogLineItem && (
        <MarkFulfilledDialog
          lineItem={dialogLineItem}
          onClose={() => setDialogLineItem(null)}
          onFulfilled={() => {
            setDialogLineItem(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
