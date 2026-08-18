// Gemeinsame Bestell-/Rabatt-Typen für Checkout, Bestellhistorie und
// Admin-Fulfillment — analog zu src/lib/shop.ts für den Produktkatalog.
// ShopActionResult (dort definiert) wird für Bestell-Server-Actions
// mitverwendet statt eines eigenen, identisch geformten Typs.

import type { OrderShippingAddress } from "@/db/schema";

export type OrderStatus = "pending_payment" | "paid" | "expired" | "canceled" | "refunded";
export type OrderLineItemKind = "digital_package" | "print";
export type OrderLineItemFulfillmentStatus = "pending" | "fulfilled" | "canceled";

export interface ShopDiscountTier {
  id: string;
  thresholdCents: number;
  discountPercent: number;
  stripeCouponId: string | null;
  sortOrder: number;
}

export interface Order {
  id: string;
  userId: string;
  status: OrderStatus;
  subtotalCents: number;
  discountPercent: number | null;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  shippingAddress: OrderShippingAddress | null;
  createdAt: Date;
  paidAt: Date | null;
}

export interface OrderLineItem {
  id: string;
  orderId: string;
  imageId: string;
  kind: OrderLineItemKind;
  packageId: string | null;
  categoryId: string | null;
  printFormatId: string | null;
  printQualityId: string | null;
  priceCents: number;
  quantity: number;
  snapshotLabel: string;
  fulfillmentStatus: OrderLineItemFulfillmentStatus;
  fulfilledAt: Date | null;
}

/**
 * Höchste Rabattstufe, deren thresholdCents <= subtotalCents ist (siehe
 * Konzept-Plan Abschnitt 7: bei z.B. 250 € greift die 20%-Stufe, nicht
 * 10+10 kumuliert). `tiers` muss nicht vorsortiert sein. `null`, wenn keine
 * Stufe erreicht ist.
 */
export function resolveDiscountTier(subtotalCents: number, tiers: ShopDiscountTier[]): ShopDiscountTier | null {
  let best: ShopDiscountTier | null = null;
  for (const tier of tiers) {
    if (tier.thresholdCents > subtotalCents) continue;
    if (!best || tier.thresholdCents > best.thresholdCents) best = tier;
  }
  return best;
}

/** Rabattbetrag in Cent für eine Zwischensumme unter der übergebenen Stufe. */
export function calculateDiscountCents(subtotalCents: number, tier: ShopDiscountTier | null): number {
  if (!tier) return 0;
  return Math.round((subtotalCents * tier.discountPercent) / 100);
}

/** Deutsche Anzeige-Labels — gemeinsam für Bestellhistorie (/orders) und
 * Admin-Fulfillment-Ansicht (/admin/orders), damit beide Seiten nie
 * auseinanderlaufen. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Zahlung ausstehend",
  paid: "Bezahlt",
  expired: "Abgelaufen",
  canceled: "Storniert",
  refunded: "Erstattet",
};
