"use server";

// Öffentliche (nicht admin-gegatete) Produkt-Abfrage für ein einzelnes Bild —
// Grundlage für den Warenkorb-Button auf /images. Bewusst kein
// canManageShop-Gate: Stöbern/Sehen, was für ein Bild bestellbar ist, ist für
// jeden Besucher (auch anonym) erlaubt, nur der eigentliche Kaufabschluss
// verlangt ein Konto (siehe src/app/checkout/actions.ts). Reichert
// resolveEffectivePackagesForImage/resolveEffectivePrintFormatsForImage
// (src/lib/shop-resolution.ts) um Namen UND Preise an — die reine Auflösung
// kennt nur Ids.

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  shopPackages,
  shopPackageCategories,
  shopPackagePrices,
  shopPrintFormats,
  shopPrintQualities,
  shopPrintFormatPrices,
} from "@/db/schema";
import { resolveEffectivePackagesForImage, resolveEffectivePrintFormatsForImage } from "@/lib/shop-resolution";

export interface PurchasablePackage {
  packageId: string;
  packageName: string;
  packageDescription: string | null;
  categoryId: string;
  categoryName: string;
  priceCents: number;
  isFeatured: boolean;
}

export interface PurchasablePrintOption {
  printFormatId: string;
  printFormatName: string;
  printFormatDescription: string | null;
  widthCm: number;
  heightCm: number;
  printQualityId: string;
  printQualityName: string;
  priceCents: number;
  isFeatured: boolean;
}

export interface PurchasableProducts {
  packages: PurchasablePackage[];
  prints: PurchasablePrintOption[];
}

export async function getPurchasableProductsForImage(imageId: string): Promise<PurchasableProducts> {
  const [effectivePackages, effectivePrintFormats] = await Promise.all([
    resolveEffectivePackagesForImage(imageId),
    resolveEffectivePrintFormatsForImage(imageId),
  ]);

  const packages = await resolvePackages(effectivePackages);
  const prints = await resolvePrints(effectivePrintFormats);
  return { packages, prints };
}

async function resolvePackages(
  effective: Awaited<ReturnType<typeof resolveEffectivePackagesForImage>>
): Promise<PurchasablePackage[]> {
  if (effective.length === 0) return [];

  const packageIds = effective.map((row) => row.packageId);
  const categoryIds = effective.map((row) => row.categoryId);
  const [packageRows, categoryRows, priceRows] = await Promise.all([
    db
      .select({ id: shopPackages.id, name: shopPackages.name, description: shopPackages.description, isFeatured: shopPackages.isFeatured })
      .from(shopPackages)
      .where(inArray(shopPackages.id, packageIds)),
    db
      .select({ id: shopPackageCategories.id, name: shopPackageCategories.name })
      .from(shopPackageCategories)
      .where(inArray(shopPackageCategories.id, categoryIds)),
    db
      .select({ packageId: shopPackagePrices.packageId, categoryId: shopPackagePrices.categoryId, priceCents: shopPackagePrices.priceCents })
      .from(shopPackagePrices)
      .where(inArray(shopPackagePrices.packageId, packageIds)),
  ]);

  const packageById = new Map(packageRows.map((row) => [row.id, row]));
  const categoryNameById = new Map(categoryRows.map((row) => [row.id, row.name]));
  const priceByKey = new Map(priceRows.map((row) => [`${row.packageId}:${row.categoryId}`, row.priceCents]));

  // Ein Paket ohne gepflegten Preis für die aufgelöste Kategorie ist (noch)
  // nicht bestellbar — bewusst weggelassen statt mit 0 € anzuzeigen.
  return effective
    .map((row) => {
      const priceCents = priceByKey.get(`${row.packageId}:${row.categoryId}`);
      if (priceCents === undefined) return null;
      return {
        packageId: row.packageId,
        packageName: packageById.get(row.packageId)?.name ?? row.packageId,
        packageDescription: packageById.get(row.packageId)?.description ?? null,
        categoryId: row.categoryId,
        categoryName: categoryNameById.get(row.categoryId) ?? row.categoryId,
        priceCents,
        isFeatured: packageById.get(row.packageId)?.isFeatured ?? false,
      };
    })
    .filter((row): row is PurchasablePackage => row !== null);
}

async function resolvePrints(
  effective: Awaited<ReturnType<typeof resolveEffectivePrintFormatsForImage>>
): Promise<PurchasablePrintOption[]> {
  if (effective.length === 0) return [];

  const printFormatIds = effective.map((row) => row.printFormatId);
  const printQualityIds = effective.flatMap((row) => row.printQualityIds);
  const [formatRows, qualityRows, priceRows] = await Promise.all([
    db
      .select({
        id: shopPrintFormats.id,
        name: shopPrintFormats.name,
        description: shopPrintFormats.description,
        widthCm: shopPrintFormats.widthCm,
        heightCm: shopPrintFormats.heightCm,
        isFeatured: shopPrintFormats.isFeatured,
      })
      .from(shopPrintFormats)
      .where(inArray(shopPrintFormats.id, printFormatIds)),
    db
      .select({ id: shopPrintQualities.id, name: shopPrintQualities.name })
      .from(shopPrintQualities)
      .where(inArray(shopPrintQualities.id, printQualityIds)),
    db
      .select({
        printFormatId: shopPrintFormatPrices.printFormatId,
        printQualityId: shopPrintFormatPrices.printQualityId,
        priceCents: shopPrintFormatPrices.priceCents,
      })
      .from(shopPrintFormatPrices)
      .where(inArray(shopPrintFormatPrices.printFormatId, printFormatIds)),
  ]);

  const formatById = new Map(formatRows.map((row) => [row.id, row]));
  const qualityNameById = new Map(qualityRows.map((row) => [row.id, row.name]));
  const priceByKey = new Map(priceRows.map((row) => [`${row.printFormatId}:${row.printQualityId}`, row.priceCents]));

  const result: PurchasablePrintOption[] = [];
  for (const row of effective) {
    const format = formatById.get(row.printFormatId);
    for (const printQualityId of row.printQualityIds) {
      const priceCents = priceByKey.get(`${row.printFormatId}:${printQualityId}`);
      if (priceCents === undefined) continue;
      result.push({
        printFormatId: row.printFormatId,
        printFormatName: format?.name ?? row.printFormatId,
        printFormatDescription: format?.description ?? null,
        widthCm: format?.widthCm ?? 0,
        heightCm: format?.heightCm ?? 0,
        printQualityId,
        printQualityName: qualityNameById.get(printQualityId) ?? printQualityId,
        priceCents,
        isFeatured: format?.isFeatured ?? false,
      });
    }
  }
  return result;
}
