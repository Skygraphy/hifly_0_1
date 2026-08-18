"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { shopPackages, shopPackageCategories, shopPackagePrices } from "@/db/schema";
import { canManageShop } from "@/lib/authorization";
import { getPostgresErrorCode } from "@/lib/db-errors";
import { normalizeRichTextDescription, type ShopActionResult } from "@/lib/shop";

const POSTGRES_UNIQUE_VIOLATION = "23505";
const DUPLICATE_NAME_ERROR = "Dieser Name existiert bereits.";

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

export interface ShopPackageInput {
  name: string;
  /** HTML aus dem RichTextEditor — leerer/reiner-Whitespace-Inhalt wird zu
   * null normalisiert (kein leeres "<p></p>" in der DB). */
  description: string | null;
  includedFiles: string[];
  sortOrder: number;
}

export async function createShopPackage(input: ShopPackageInput): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;
  if (!input.name.trim()) {
    return { success: false, error: "Name ist ein Pflichtfeld." };
  }

  try {
    const [row] = await db
      .insert(shopPackages)
      .values({
        name: input.name.trim(),
        description: normalizeRichTextDescription(input.description),
        includedFiles: input.includedFiles,
        sortOrder: input.sortOrder,
      })
      .returning({ id: shopPackages.id });

    revalidatePath("/admin/shop/packages");
    return { success: true, id: row.id };
  } catch (err) {
    if (getPostgresErrorCode(err) === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_NAME_ERROR };
    }
    throw err;
  }
}

export async function updateShopPackage(id: string, input: ShopPackageInput): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;
  if (!input.name.trim()) {
    return { success: false, error: "Name ist ein Pflichtfeld." };
  }

  try {
    await db
      .update(shopPackages)
      .set({
        name: input.name.trim(),
        description: normalizeRichTextDescription(input.description),
        includedFiles: input.includedFiles,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(shopPackages.id, id));

    revalidatePath("/admin/shop/packages");
    return { success: true, id };
  } catch (err) {
    if (getPostgresErrorCode(err) === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_NAME_ERROR };
    }
    throw err;
  }
}

// FKs auf shop_package_prices/shop_location_package_assignments/
// shop_image_package_assignments haben alle ON DELETE CASCADE — löscht
// automatisch auch sämtliche Preise/Zuordnungen dieses Pakets mit (der
// Bestätigungsdialog am Aufrufort weist darauf hin).
export async function deleteShopPackage(id: string): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;

  await db.delete(shopPackages).where(eq(shopPackages.id, id));

  revalidatePath("/admin/shop/packages");
  return { success: true };
}

/** "Am beliebtesten"-Markierung — eine schnelle Ein/Aus-Aktion direkt in der
 * Paketzeile (siehe ShopCatalogManager), kein Feld im Anlegen/Bearbeiten-
 * Dialog. Exklusiv (auf Wunsch des Users): immer höchstens ein Paket
 * gleichzeitig markiert — beim Setzen werden alle anderen zuerst in
 * derselben Transaktion zurückgesetzt, statt eine DB-Constraint (partial
 * unique index) dafür einzuführen. */
export async function setShopPackageFeatured(id: string, isFeatured: boolean): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;

  await db.transaction(async (tx) => {
    if (isFeatured) {
      await tx.update(shopPackages).set({ isFeatured: false, updatedAt: new Date() }).where(eq(shopPackages.isFeatured, true));
    }
    await tx.update(shopPackages).set({ isFeatured, updatedAt: new Date() }).where(eq(shopPackages.id, id));
  });

  revalidatePath("/admin/shop/packages");
  return { success: true, id };
}

export interface ShopPackageCategoryInput {
  name: string;
  sortOrder: number;
}

export async function createShopPackageCategory(input: ShopPackageCategoryInput): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;
  if (!input.name.trim()) {
    return { success: false, error: "Name ist ein Pflichtfeld." };
  }

  try {
    const [row] = await db
      .insert(shopPackageCategories)
      .values({ name: input.name.trim(), sortOrder: input.sortOrder })
      .returning({ id: shopPackageCategories.id });

    revalidatePath("/admin/shop/packages");
    return { success: true, id: row.id };
  } catch (err) {
    if (getPostgresErrorCode(err) === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_NAME_ERROR };
    }
    throw err;
  }
}

export async function updateShopPackageCategory(id: string, input: ShopPackageCategoryInput): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;
  if (!input.name.trim()) {
    return { success: false, error: "Name ist ein Pflichtfeld." };
  }

  try {
    await db
      .update(shopPackageCategories)
      .set({ name: input.name.trim(), sortOrder: input.sortOrder, updatedAt: new Date() })
      .where(eq(shopPackageCategories.id, id));

    revalidatePath("/admin/shop/packages");
    return { success: true, id };
  } catch (err) {
    if (getPostgresErrorCode(err) === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_NAME_ERROR };
    }
    throw err;
  }
}

export async function deleteShopPackageCategory(id: string): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;

  await db.delete(shopPackageCategories).where(eq(shopPackageCategories.id, id));

  revalidatePath("/admin/shop/packages");
  return { success: true };
}

export async function setShopPackagePrice(
  packageId: string,
  categoryId: string,
  priceCents: number
): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return { success: false, error: "Preis muss eine positive ganze Zahl (Cent) sein." };
  }

  await db
    .insert(shopPackagePrices)
    .values({ packageId, categoryId, priceCents })
    .onConflictDoUpdate({
      target: [shopPackagePrices.packageId, shopPackagePrices.categoryId],
      set: { priceCents, updatedAt: new Date() },
    });

  revalidatePath("/admin/shop/packages");
  return { success: true };
}
