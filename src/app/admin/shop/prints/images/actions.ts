"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { shopImagePrintFormatAssignments, shopPrintFormats, shopPrintQualities } from "@/db/schema";
import { canManageShop } from "@/lib/authorization";
import type { ShopActionResult } from "@/lib/shop";
import { resolveEffectivePrintFormatsForImage } from "@/lib/shop-resolution";

// Die Freitextsuche (ID/Hash ODER Hauptort) ist domänenunabhängig — keine
// eigene Kopie hier, der Aufrufer (print-image-override-manager.tsx)
// importiert searchImagesForShopOverride direkt aus
// src/app/admin/shop/packages/images/actions.ts. Kein Re-Export hier: "use server"-
// Dateien dürfen ausschließlich async function-Werte exportieren, ein
// Re-Export würde diese Regel unnötig strapazieren.

export interface PrintImageOverrideRow {
  printFormatId: string;
  printQualityId: string | null;
}

export async function getPrintImageOverrides(imageId: string): Promise<PrintImageOverrideRow[]> {
  const session = await auth();
  if (!session?.user || !canManageShop(session.user.role)) {
    return [];
  }

  return db
    .select({
      printFormatId: shopImagePrintFormatAssignments.printFormatId,
      printQualityId: shopImagePrintFormatAssignments.printQualityId,
    })
    .from(shopImagePrintFormatAssignments)
    .where(eq(shopImagePrintFormatAssignments.imageId, imageId));
}

export interface EffectivePrintFormatDisplayRow {
  printFormatId: string;
  printFormatName: string;
  printQualityNames: string[];
  source: { type: "override" } | { type: "location"; label: string };
}

/**
 * Reine Anzeige-Aufbereitung von resolveEffectivePrintFormatsForImage
 * (src/lib/shop-resolution.ts) für den "Effektiv verfügbar"-Block im
 * Bild-Override-Editor — reichert die reine Auflösung um Format-/
 * Qualitäts-NAMEN an (die Auflösung selbst kennt nur Ids).
 */
export async function getEffectivePrintFormatsForImage(imageId: string): Promise<EffectivePrintFormatDisplayRow[]> {
  const session = await auth();
  if (!session?.user || !canManageShop(session.user.role)) {
    return [];
  }

  const effective = await resolveEffectivePrintFormatsForImage(imageId);
  if (effective.length === 0) return [];

  const printFormatIds = effective.map((row) => row.printFormatId);
  const printQualityIds = effective.flatMap((row) => row.printQualityIds);
  const [formatRows, qualityRows] = await Promise.all([
    db.select({ id: shopPrintFormats.id, name: shopPrintFormats.name }).from(shopPrintFormats).where(inArray(shopPrintFormats.id, printFormatIds)),
    db.select({ id: shopPrintQualities.id, name: shopPrintQualities.name }).from(shopPrintQualities).where(inArray(shopPrintQualities.id, printQualityIds)),
  ]);
  const formatNameById = new Map(formatRows.map((row) => [row.id, row.name]));
  const qualityNameById = new Map(qualityRows.map((row) => [row.id, row.name]));

  return effective.map((row) => ({
    printFormatId: row.printFormatId,
    printFormatName: formatNameById.get(row.printFormatId) ?? row.printFormatId,
    printQualityNames: row.printQualityIds.map((id) => qualityNameById.get(id) ?? id),
    source: row.source.type === "override" ? { type: "override" as const } : { type: "location" as const, label: row.source.label },
  }));
}

export type PrintImageOverrideMode =
  | { type: "inherit" } // Override-Zeile löschen — Bild erbt die Standort-Zuordnung.
  | { type: "quality"; printQualityId: string } // Zeile upsert mit abweichender Druckqualität.
  | { type: "disabled" }; // Zeile upsert, printQualityId = null ("für dieses Bild deaktiviert").

export async function setShopImagePrintFormatOverride(
  imageId: string,
  printFormatId: string,
  mode: PrintImageOverrideMode
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

  if (mode.type === "inherit") {
    await db
      .delete(shopImagePrintFormatAssignments)
      .where(
        and(
          eq(shopImagePrintFormatAssignments.imageId, imageId),
          eq(shopImagePrintFormatAssignments.printFormatId, printFormatId)
        )
      );
  } else {
    const printQualityId = mode.type === "quality" ? mode.printQualityId : null;
    await db
      .insert(shopImagePrintFormatAssignments)
      .values({ imageId, printFormatId, printQualityId })
      .onConflictDoUpdate({
        target: [shopImagePrintFormatAssignments.imageId, shopImagePrintFormatAssignments.printFormatId],
        set: { printQualityId, updatedAt: new Date() },
      });
  }

  revalidatePath("/admin/shop/prints/images");
  return { success: true };
}
