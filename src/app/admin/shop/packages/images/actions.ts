"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { images, shopImagePackageAssignments, shopPackages, shopPackageCategories } from "@/db/schema";
import { canManageShop } from "@/lib/authorization";
import { thumbUrlFor } from "@/lib/image-folder";
import type { ShopActionResult } from "@/lib/shop";
import { resolveEffectivePackagesForImage } from "@/lib/shop-resolution";

const SEARCH_RESULT_LIMIT = 20;

export interface ShopImageSearchResult {
  id: string;
  hash: string;
  thumbUrl: string;
  mainLocation: string | null;
}

/**
 * Schlanke Freitextsuche eigens für dieses Tool (ID/Hash ODER Hauptort) —
 * bewusst NICHT über buildImageConditions in src/app/images/actions.ts
 * (dort UNDet ein gemeinsames Suchfeld über mehrere Facetten, hier reicht
 * ein einzelnes ODER über zwei Spalten). super_admin sieht dabei
 * grundsätzlich alle Bilder, auch nicht öffentlich sichtbare — die
 * Zuordnung von Paketen ist unabhängig von web_visible.
 */
export async function searchImagesForShopOverride(query: string): Promise<ShopImageSearchResult[]> {
  const session = await auth();
  if (!session?.user || !canManageShop(session.user.role)) {
    return [];
  }

  const trimmed = query.trim();
  if (!trimmed) return [];

  const pattern = `%${trimmed}%`;
  const rows = await db
    .select({ id: images.id, hash: images.hash, mainLocation: images.mainLocation })
    .from(images)
    .where(sql`(${images.hash} ILIKE ${pattern} OR ${images.mainLocation} ILIKE ${pattern})`)
    .limit(SEARCH_RESULT_LIMIT);

  return rows.map((row) => ({ ...row, thumbUrl: thumbUrlFor(row.id) }));
}

export interface ShopImageOverrideRow {
  packageId: string;
  categoryId: string | null;
}

export async function getShopImageOverrides(imageId: string): Promise<ShopImageOverrideRow[]> {
  const session = await auth();
  if (!session?.user || !canManageShop(session.user.role)) {
    return [];
  }

  return db
    .select({ packageId: shopImagePackageAssignments.packageId, categoryId: shopImagePackageAssignments.categoryId })
    .from(shopImagePackageAssignments)
    .where(eq(shopImagePackageAssignments.imageId, imageId));
}

export interface EffectivePackageDisplayRow {
  packageId: string;
  packageName: string;
  categoryId: string;
  categoryName: string;
  source: { type: "override" } | { type: "location"; label: string };
}

/**
 * Reine Anzeige-Aufbereitung von resolveEffectivePackagesForImage
 * (src/lib/shop-resolution.ts) für den "Effektiv verfügbar"-Block im
 * Bild-Override-Editor — reichert die reine Auflösung um Paket-/
 * Kategorie-NAMEN an (die Auflösung selbst kennt nur Ids).
 */
export async function getEffectivePackagesForImage(imageId: string): Promise<EffectivePackageDisplayRow[]> {
  const session = await auth();
  if (!session?.user || !canManageShop(session.user.role)) {
    return [];
  }

  const effective = await resolveEffectivePackagesForImage(imageId);
  if (effective.length === 0) return [];

  const packageIds = effective.map((row) => row.packageId);
  const categoryIds = effective.map((row) => row.categoryId);
  const [packageRows, categoryRows] = await Promise.all([
    db.select({ id: shopPackages.id, name: shopPackages.name }).from(shopPackages).where(inArray(shopPackages.id, packageIds)),
    db.select({ id: shopPackageCategories.id, name: shopPackageCategories.name }).from(shopPackageCategories).where(inArray(shopPackageCategories.id, categoryIds)),
  ]);
  const packageNameById = new Map(packageRows.map((row) => [row.id, row.name]));
  const categoryNameById = new Map(categoryRows.map((row) => [row.id, row.name]));

  return effective.map((row) => ({
    packageId: row.packageId,
    packageName: packageNameById.get(row.packageId) ?? row.packageId,
    categoryId: row.categoryId,
    categoryName: categoryNameById.get(row.categoryId) ?? row.categoryId,
    source: row.source.type === "override" ? { type: "override" as const } : { type: "location" as const, label: row.source.label },
  }));
}

export type ShopImageOverrideMode =
  | { type: "inherit" } // Override-Zeile löschen — Bild erbt die Standort-Zuordnung.
  | { type: "category"; categoryId: string } // Zeile upsert mit abweichender Kategorie.
  | { type: "disabled" }; // Zeile upsert, categoryId = null ("für dieses Bild deaktiviert").

export async function setShopImagePackageOverride(
  imageId: string,
  packageId: string,
  mode: ShopImageOverrideMode
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
      .delete(shopImagePackageAssignments)
      .where(and(eq(shopImagePackageAssignments.imageId, imageId), eq(shopImagePackageAssignments.packageId, packageId)));
  } else {
    const categoryId = mode.type === "category" ? mode.categoryId : null;
    await db
      .insert(shopImagePackageAssignments)
      .values({ imageId, packageId, categoryId })
      .onConflictDoUpdate({
        target: [shopImagePackageAssignments.imageId, shopImagePackageAssignments.packageId],
        set: { categoryId, updatedAt: new Date() },
      });
  }

  revalidatePath("/admin/shop/packages/images");
  return { success: true };
}
