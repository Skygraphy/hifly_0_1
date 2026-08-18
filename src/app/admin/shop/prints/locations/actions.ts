"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { shopLocationPrintFormatAssignments } from "@/db/schema";
import { canManageShop } from "@/lib/authorization";
import type { StandortRef } from "@/lib/standort";
import type { ShopActionResult } from "@/lib/shop";

/**
 * Schaltet GENAU EIN (Standort, Format, Qualität)-Tripel an/aus — anders
 * als bei den Paketen (setShopLocationPackageAssignment, genau eine
 * Kategorie pro Paket) können hier mehrere Qualitäten gleichzeitig für
 * dasselbe Format an einem Standort verfügbar sein (auf Wunsch des Users,
 * z.B. "A5 sowohl in Fotopapier als auch Premium-Fotopapier"). Reiner
 * Toggle statt Löschen+Neuanlegen wie zuvor: onConflictDoNothing greift
 * über den (jetzt dreispaltigen) partiellen Unique-Index, ein erneutes
 * Aktivieren derselben Kombination ist damit ein no-op statt eines Fehlers.
 */
export async function setShopLocationPrintFormatAssignment(
  standort: StandortRef,
  printFormatId: string,
  printQualityId: string,
  available: boolean
): Promise<ShopActionResult> {
  const session = await auth();

  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageShop(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf den Shop verwalten." };
  }

  const standortCondition =
    standort.type === "unit"
      ? eq(shopLocationPrintFormatAssignments.administrativeUnitId, standort.id)
      : eq(shopLocationPrintFormatAssignments.regionId, standort.id);

  if (available) {
    await db
      .insert(shopLocationPrintFormatAssignments)
      .values({
        administrativeUnitId: standort.type === "unit" ? standort.id : null,
        regionId: standort.type === "region" ? standort.id : null,
        printFormatId,
        printQualityId,
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(shopLocationPrintFormatAssignments)
      .where(
        and(
          eq(shopLocationPrintFormatAssignments.printFormatId, printFormatId),
          eq(shopLocationPrintFormatAssignments.printQualityId, printQualityId),
          standortCondition
        )
      );
  }

  revalidatePath("/admin/shop/prints/locations");
  return { success: true };
}
