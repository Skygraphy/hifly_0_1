"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { orderLineItems } from "@/db/schema";
import { canManageOrders } from "@/lib/authorization";
import type { ShopActionResult } from "@/lib/shop";

/**
 * Markiert eine einzelne Druck-Position als verschickt (siehe Konzept-Plan
 * Abschnitt 11) — bewusst KEIN Toggle wie die Freigabe-Checkboxen im
 * restlichen Admin-Bereich: Versand ist ein realer, nicht rückgängig zu
 * machender Vorgang, der Aufrufer (order-fulfillment-manager.tsx) sichert
 * das per Bestätigungsdialog ab, nicht per direktem Klick.
 */
export async function markOrderLineItemFulfilled(lineItemId: string): Promise<ShopActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageOrders(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf Bestellungen verwalten." };
  }

  await db
    .update(orderLineItems)
    .set({ fulfillmentStatus: "fulfilled", fulfilledAt: new Date(), fulfilledBy: session.user.id })
    .where(eq(orderLineItems.id, lineItemId));

  revalidatePath("/admin/orders");
  return { success: true };
}
