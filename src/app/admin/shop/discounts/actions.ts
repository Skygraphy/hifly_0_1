"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { shopDiscountTiers } from "@/db/schema";
import { canManageShop } from "@/lib/authorization";
import { getPostgresErrorCode } from "@/lib/db-errors";
import type { ShopActionResult } from "@/lib/shop";

const POSTGRES_UNIQUE_VIOLATION = "23505";
const DUPLICATE_THRESHOLD_ERROR = "Für diesen Bestellwert existiert bereits eine Stufe.";

async function requireShopAccess(): Promise<ShopActionResult | null> {
  const session = await auth();
  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageShop(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf den Shop verwalten." };
  }
  return null;
}

export interface ShopDiscountTierInput {
  thresholdCents: number;
  discountPercent: number;
  sortOrder: number;
}

function validateInput(input: ShopDiscountTierInput): string | null {
  if (!Number.isInteger(input.thresholdCents) || input.thresholdCents <= 0) {
    return "Bestellwert muss ein positiver Cent-Betrag sein.";
  }
  if (!Number.isInteger(input.discountPercent) || input.discountPercent <= 0 || input.discountPercent > 100) {
    return "Rabatt muss zwischen 1 und 100 % liegen.";
  }
  return null;
}

// stripeCouponId wird bewusst NICHT hier gesetzt — der passende, persistente
// Stripe-Coupon (percent_off) wird lazy beim ersten Einsatz dieser Stufe im
// Checkout angelegt (siehe src/app/checkout/actions.ts) und dort
// zurückgeschrieben, nicht bei der reinen Katalogpflege.
export async function createShopDiscountTier(input: ShopDiscountTierInput): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;
  const error = validateInput(input);
  if (error) return { success: false, error };

  try {
    const [row] = await db
      .insert(shopDiscountTiers)
      .values({
        thresholdCents: input.thresholdCents,
        discountPercent: input.discountPercent,
        sortOrder: input.sortOrder,
      })
      .returning({ id: shopDiscountTiers.id });

    revalidatePath("/admin/shop/discounts");
    return { success: true, id: row.id };
  } catch (err) {
    if (getPostgresErrorCode(err) === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_THRESHOLD_ERROR };
    }
    throw err;
  }
}

// Ändert sich der Prozentsatz einer bestehenden Stufe, wird ihr
// stripeCouponId zurückgesetzt (ein bestehender Stripe-Coupon ist an einen
// FESTEN Prozentsatz gebunden, kann also nicht einfach umbenannt werden) —
// beim nächsten Checkout, der diese Stufe trifft, wird lazy ein neuer
// Coupon angelegt (siehe src/app/checkout/actions.ts). Bleibt der
// Prozentsatz gleich (z.B. nur Schwelle/Reihenfolge geändert), bleibt der
// bestehende Coupon unverändert gültig.
export async function updateShopDiscountTier(id: string, input: ShopDiscountTierInput): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;
  const error = validateInput(input);
  if (error) return { success: false, error };

  try {
    const [existing] = await db
      .select({ discountPercent: shopDiscountTiers.discountPercent })
      .from(shopDiscountTiers)
      .where(eq(shopDiscountTiers.id, id))
      .limit(1);
    const percentChanged = existing?.discountPercent !== input.discountPercent;

    await db
      .update(shopDiscountTiers)
      .set({
        thresholdCents: input.thresholdCents,
        discountPercent: input.discountPercent,
        sortOrder: input.sortOrder,
        ...(percentChanged ? { stripeCouponId: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(shopDiscountTiers.id, id));

    revalidatePath("/admin/shop/discounts");
    return { success: true, id };
  } catch (err) {
    if (getPostgresErrorCode(err) === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_THRESHOLD_ERROR };
    }
    throw err;
  }
}

export async function deleteShopDiscountTier(id: string): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;

  await db.delete(shopDiscountTiers).where(eq(shopDiscountTiers.id, id));

  revalidatePath("/admin/shop/discounts");
  return { success: true };
}
