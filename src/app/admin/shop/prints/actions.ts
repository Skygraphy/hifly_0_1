"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { shopPrintFormats, shopPrintQualities, shopPrintFormatPrices } from "@/db/schema";
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

export interface ShopPrintFormatInput {
  name: string;
  /** HTML aus dem RichTextEditor — leerer/reiner-Whitespace-Inhalt wird zu
   * null normalisiert (kein leeres "<p></p>" in der DB). */
  description: string | null;
  widthCm: number;
  heightCm: number;
  sortOrder: number;
}

export async function createShopPrintFormat(input: ShopPrintFormatInput): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;
  if (!input.name.trim()) {
    return { success: false, error: "Name ist ein Pflichtfeld." };
  }
  if (!Number.isFinite(input.widthCm) || input.widthCm <= 0 || !Number.isFinite(input.heightCm) || input.heightCm <= 0) {
    return { success: false, error: "Breite und Höhe müssen positive Zahlen sein." };
  }

  try {
    const [row] = await db
      .insert(shopPrintFormats)
      .values({
        name: input.name.trim(),
        description: normalizeRichTextDescription(input.description),
        widthCm: input.widthCm,
        heightCm: input.heightCm,
        sortOrder: input.sortOrder,
      })
      .returning({ id: shopPrintFormats.id });

    revalidatePath("/admin/shop/prints");
    return { success: true, id: row.id };
  } catch (err) {
    if (getPostgresErrorCode(err) === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_NAME_ERROR };
    }
    throw err;
  }
}

export async function updateShopPrintFormat(id: string, input: ShopPrintFormatInput): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;
  if (!input.name.trim()) {
    return { success: false, error: "Name ist ein Pflichtfeld." };
  }
  if (!Number.isFinite(input.widthCm) || input.widthCm <= 0 || !Number.isFinite(input.heightCm) || input.heightCm <= 0) {
    return { success: false, error: "Breite und Höhe müssen positive Zahlen sein." };
  }

  try {
    await db
      .update(shopPrintFormats)
      .set({
        name: input.name.trim(),
        description: normalizeRichTextDescription(input.description),
        widthCm: input.widthCm,
        heightCm: input.heightCm,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(shopPrintFormats.id, id));

    revalidatePath("/admin/shop/prints");
    return { success: true, id };
  } catch (err) {
    if (getPostgresErrorCode(err) === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_NAME_ERROR };
    }
    throw err;
  }
}

// FKs auf shop_print_format_prices/shop_location_print_format_assignments/
// shop_image_print_format_assignments haben alle ON DELETE CASCADE — löscht
// automatisch auch sämtliche Preise/Zuordnungen dieses Formats mit (der
// Bestätigungsdialog am Aufrufort weist darauf hin).
export async function deleteShopPrintFormat(id: string): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;

  await db.delete(shopPrintFormats).where(eq(shopPrintFormats.id, id));

  revalidatePath("/admin/shop/prints");
  return { success: true };
}

/** "Am beliebtesten"-Markierung — eine schnelle Ein/Aus-Aktion direkt in der
 * Formatzeile (siehe PrintCatalogManager), kein Feld im Anlegen/Bearbeiten-
 * Dialog. Exklusiv (analog zu setShopPackageFeatured in
 * src/app/admin/shop/packages/actions.ts): immer höchstens ein Druckformat
 * gleichzeitig markiert — beim Setzen werden alle anderen zuerst in
 * derselben Transaktion zurückgesetzt. */
export async function setShopPrintFormatFeatured(id: string, isFeatured: boolean): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;

  await db.transaction(async (tx) => {
    if (isFeatured) {
      await tx.update(shopPrintFormats).set({ isFeatured: false, updatedAt: new Date() }).where(eq(shopPrintFormats.isFeatured, true));
    }
    await tx.update(shopPrintFormats).set({ isFeatured, updatedAt: new Date() }).where(eq(shopPrintFormats.id, id));
  });

  revalidatePath("/admin/shop/prints");
  return { success: true, id };
}

export interface ShopPrintQualityInput {
  name: string;
  /** HTML aus dem RichTextEditor — leerer/reiner-Whitespace-Inhalt wird zu
   * null normalisiert (kein leeres "<p></p>" in der DB). */
  description: string | null;
  sortOrder: number;
}

export async function createShopPrintQuality(input: ShopPrintQualityInput): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;
  if (!input.name.trim()) {
    return { success: false, error: "Name ist ein Pflichtfeld." };
  }

  try {
    const [row] = await db
      .insert(shopPrintQualities)
      .values({
        name: input.name.trim(),
        description: normalizeRichTextDescription(input.description),
        sortOrder: input.sortOrder,
      })
      .returning({ id: shopPrintQualities.id });

    revalidatePath("/admin/shop/prints");
    return { success: true, id: row.id };
  } catch (err) {
    if (getPostgresErrorCode(err) === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_NAME_ERROR };
    }
    throw err;
  }
}

export async function updateShopPrintQuality(id: string, input: ShopPrintQualityInput): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;
  if (!input.name.trim()) {
    return { success: false, error: "Name ist ein Pflichtfeld." };
  }

  try {
    await db
      .update(shopPrintQualities)
      .set({
        name: input.name.trim(),
        description: normalizeRichTextDescription(input.description),
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(shopPrintQualities.id, id));

    revalidatePath("/admin/shop/prints");
    return { success: true, id };
  } catch (err) {
    if (getPostgresErrorCode(err) === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_NAME_ERROR };
    }
    throw err;
  }
}

export async function deleteShopPrintQuality(id: string): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;

  await db.delete(shopPrintQualities).where(eq(shopPrintQualities.id, id));

  revalidatePath("/admin/shop/prints");
  return { success: true };
}

export async function setShopPrintFormatPrice(
  printFormatId: string,
  printQualityId: string,
  priceCents: number
): Promise<ShopActionResult> {
  const denied = await requireShopAccess();
  if (denied) return denied;
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    return { success: false, error: "Preis muss eine positive ganze Zahl (Cent) sein." };
  }

  await db
    .insert(shopPrintFormatPrices)
    .values({ printFormatId, printQualityId, priceCents })
    .onConflictDoUpdate({
      target: [shopPrintFormatPrices.printFormatId, shopPrintFormatPrices.printQualityId],
      set: { priceCents, updatedAt: new Date() },
    });

  revalidatePath("/admin/shop/prints");
  return { success: true };
}
