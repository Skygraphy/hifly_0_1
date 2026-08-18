"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { shopLocationPackageAssignments } from "@/db/schema";
import { canManageShop } from "@/lib/authorization";
import type { StandortRef } from "@/lib/standort";
import type { ShopActionResult } from "@/lib/shop";

/**
 * Setzt/löscht die Paket-Zuordnung eines Standorts (Verwaltungseinheit ODER
 * Region, siehe StandortRef) — genau eine Kategorie pro (Standort, Paket).
 * categoryId null bedeutet "nicht verfügbar" (Zeile löschen). Kein
 * onConflictDoUpdate, weil die Zieltabelle über ZWEI partielle Unique-
 * Indizes verfügt (siehe schema.ts) statt eines einzelnen, den Drizzle als
 * Konflikt-Ziel adressieren könnte — Löschen+Neuanlegen in einer
 * Transaktion ist hier einfacher und genauso sicher.
 */
export async function setShopLocationPackageAssignment(
  standort: StandortRef,
  packageId: string,
  categoryId: string | null
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

  await db.transaction(async (tx) => {
    await tx
      .delete(shopLocationPackageAssignments)
      .where(
        and(
          eq(shopLocationPackageAssignments.packageId, packageId),
          standort.type === "unit"
            ? eq(shopLocationPackageAssignments.administrativeUnitId, standort.id)
            : eq(shopLocationPackageAssignments.regionId, standort.id)
        )
      );

    if (categoryId) {
      await tx.insert(shopLocationPackageAssignments).values({
        administrativeUnitId: standort.type === "unit" ? standort.id : null,
        regionId: standort.type === "region" ? standort.id : null,
        packageId,
        categoryId,
      });
    }
  });

  revalidatePath("/admin/shop/packages/locations");
  return { success: true };
}
