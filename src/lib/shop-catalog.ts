// Öffentlicher Katalog-Lesezugriff (kein Bild-Bezug, kein Standort-
// Resolving) — Grundlage für die Storefront-Seiten (/shop, siehe
// src/app/shop/page.tsx und die Detail-Seiten darunter). Bewusst eigene
// Datei statt Erweiterung von src/lib/shop.ts (das ist DB-frei/typ-only
// und wird auch von Client-Komponenten importiert) oder
// src/app/shop/actions.ts (dessen getPurchasableProductsForImage ist
// pro-Bild aufgelöst, falsche Form für eine reine Katalog-Liste) — analog
// zu src/lib/shop-resolution.ts, nur für "Katalog durchsuchen" statt
// "für Bild X auflösen".

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  shopPackages,
  shopPackageCategories,
  shopPackagePrices,
  shopPrintFormats,
  shopPrintQualities,
  shopPrintFormatPrices,
} from "@/db/schema";

export interface CatalogPackage {
  id: string;
  name: string;
  description: string | null;
  minPriceCents: number | null;
  sortOrder: number;
  /** "Am beliebtesten"-Markierung, vom super_admin gesetzt (siehe
   * shopPackages.isFeatured in src/db/schema.ts) — steuert die Hervorhebung
   * auf den öffentlichen Shop-Seiten. */
  isFeatured: boolean;
}

export interface CatalogPrintFormat {
  id: string;
  name: string;
  description: string | null;
  widthCm: number;
  heightCm: number;
  minPriceCents: number | null;
  sortOrder: number;
  /** "Am beliebtesten"-Markierung, vom super_admin gesetzt (siehe
   * shopPrintFormats.isFeatured in src/db/schema.ts) — steuert die
   * Hervorhebung auf den öffentlichen Shop-Seiten. */
  isFeatured: boolean;
}

export interface CatalogPackageDetail extends CatalogPackage {
  includedFiles: string[];
  prices: { categoryId: string; categoryName: string; priceCents: number }[];
}

export interface CatalogPrintFormatDetail extends CatalogPrintFormat {
  prices: { printQualityId: string; printQualityName: string; priceCents: number }[];
}

/** Tags entfernen + auf maxLength kürzen (mit Ellipse) — für die reine
 * Kartenansicht auf /shop, wo NIE formatiertes HTML gerendert wird (eine
 * lange Liste würde eine Kachel mit fester Höhe sprengen). Anders als
 * normalizeRichTextDescription (src/lib/shop.ts, das nur "leer erkennen"
 * will) liefert diese Funktion einen tatsächlich anzeigbaren Kurztext. */
export function stripHtmlSnippet(html: string, maxLength: number): string {
  const stripped = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= maxLength) return stripped;
  return `${stripped.slice(0, maxLength).trimEnd()}…`;
}

/** Preis-Minimum wird bewusst in JS berechnet (nicht per SQL MIN()/GROUP
 * BY) — sonst würde ein Paket/Format ganz ohne Preiszeile (frisch
 * angelegt, noch nicht bepreist) stillschweigend aus dem Ergebnis fallen
 * statt sichtbar "Preis auf Anfrage" (null) zu liefern. */
function minPriceOrNull(prices: number[]): number | null {
  return prices.length === 0 ? null : Math.min(...prices);
}

export interface PriceRangeSummary {
  minCents: number;
  maxCents: number;
  avgCents: number;
}

/** Für die Detail-Seiten (/shop/packages/[id], /shop/prints/[id]) — der
 * tatsächliche Preis wird erst pro Bild aufgelöst (siehe
 * resolveEffectivePackagesForImage/resolveEffectivePrintFormatsForImage,
 * src/lib/shop-resolution.ts) und je nach Kategorie/Qualität gestaffelt.
 * Statt einer Preistabelle nach Kategorie/Qualität (verrät Details, die auf
 * Bildebene ohnehin nicht wählbar sind) zeigen die Detail-Seiten nur noch
 * Spanne + Mittelwert über alle gepflegten Preise. null bei keiner
 * Preiszeile (noch nicht bepreist). */
export function summarizePriceRange(prices: number[]): PriceRangeSummary | null {
  if (prices.length === 0) return null;
  const sum = prices.reduce((total, price) => total + price, 0);
  return {
    minCents: Math.min(...prices),
    maxCents: Math.max(...prices),
    avgCents: Math.round(sum / prices.length),
  };
}

export async function listCatalogPackages(): Promise<CatalogPackage[]> {
  const [packages, prices] = await Promise.all([
    db
      .select({
        id: shopPackages.id,
        name: shopPackages.name,
        description: shopPackages.description,
        sortOrder: shopPackages.sortOrder,
        isFeatured: shopPackages.isFeatured,
      })
      .from(shopPackages)
      .orderBy(shopPackages.sortOrder),
    db.select({ packageId: shopPackagePrices.packageId, priceCents: shopPackagePrices.priceCents }).from(shopPackagePrices),
  ]);

  const pricesByPackageId = new Map<string, number[]>();
  for (const row of prices) {
    const list = pricesByPackageId.get(row.packageId) ?? [];
    list.push(row.priceCents);
    pricesByPackageId.set(row.packageId, list);
  }

  return packages.map((pkg) => ({
    ...pkg,
    minPriceCents: minPriceOrNull(pricesByPackageId.get(pkg.id) ?? []),
  }));
}

export async function listCatalogPrintFormats(): Promise<CatalogPrintFormat[]> {
  const [formats, prices] = await Promise.all([
    db
      .select({
        id: shopPrintFormats.id,
        name: shopPrintFormats.name,
        description: shopPrintFormats.description,
        widthCm: shopPrintFormats.widthCm,
        heightCm: shopPrintFormats.heightCm,
        sortOrder: shopPrintFormats.sortOrder,
        isFeatured: shopPrintFormats.isFeatured,
      })
      .from(shopPrintFormats)
      .orderBy(shopPrintFormats.sortOrder),
    db.select({ printFormatId: shopPrintFormatPrices.printFormatId, priceCents: shopPrintFormatPrices.priceCents }).from(shopPrintFormatPrices),
  ]);

  const pricesByFormatId = new Map<string, number[]>();
  for (const row of prices) {
    const list = pricesByFormatId.get(row.printFormatId) ?? [];
    list.push(row.priceCents);
    pricesByFormatId.set(row.printFormatId, list);
  }

  return formats.map((format) => ({
    ...format,
    minPriceCents: minPriceOrNull(pricesByFormatId.get(format.id) ?? []),
  }));
}

export async function getCatalogPackageDetail(packageId: string): Promise<CatalogPackageDetail | null> {
  const [packageRow] = await db
    .select({
      id: shopPackages.id,
      name: shopPackages.name,
      description: shopPackages.description,
      includedFiles: shopPackages.includedFiles,
      sortOrder: shopPackages.sortOrder,
      isFeatured: shopPackages.isFeatured,
    })
    .from(shopPackages)
    .where(eq(shopPackages.id, packageId))
    .limit(1);
  if (!packageRow) return null;

  const priceRows = await db
    .select({ categoryId: shopPackagePrices.categoryId, priceCents: shopPackagePrices.priceCents })
    .from(shopPackagePrices)
    .where(eq(shopPackagePrices.packageId, packageId));

  const categoryIds = priceRows.map((row) => row.categoryId);
  const categoryRows =
    categoryIds.length > 0
      ? await db
          .select({ id: shopPackageCategories.id, name: shopPackageCategories.name, sortOrder: shopPackageCategories.sortOrder })
          .from(shopPackageCategories)
          .where(inArray(shopPackageCategories.id, categoryIds))
      : [];
  const categoryById = new Map(categoryRows.map((row) => [row.id, row]));

  const prices = priceRows
    .map((row) => ({
      categoryId: row.categoryId,
      categoryName: categoryById.get(row.categoryId)?.name ?? row.categoryId,
      priceCents: row.priceCents,
      sortOrder: categoryById.get(row.categoryId)?.sortOrder ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ categoryId, categoryName, priceCents }) => ({ categoryId, categoryName, priceCents }));

  return {
    id: packageRow.id,
    name: packageRow.name,
    description: packageRow.description,
    includedFiles: packageRow.includedFiles,
    sortOrder: packageRow.sortOrder,
    isFeatured: packageRow.isFeatured,
    minPriceCents: minPriceOrNull(priceRows.map((row) => row.priceCents)),
    prices,
  };
}

export async function getCatalogPrintFormatDetail(formatId: string): Promise<CatalogPrintFormatDetail | null> {
  const [formatRow] = await db
    .select({
      id: shopPrintFormats.id,
      name: shopPrintFormats.name,
      description: shopPrintFormats.description,
      widthCm: shopPrintFormats.widthCm,
      heightCm: shopPrintFormats.heightCm,
      sortOrder: shopPrintFormats.sortOrder,
      isFeatured: shopPrintFormats.isFeatured,
    })
    .from(shopPrintFormats)
    .where(eq(shopPrintFormats.id, formatId))
    .limit(1);
  if (!formatRow) return null;

  const priceRows = await db
    .select({ printQualityId: shopPrintFormatPrices.printQualityId, priceCents: shopPrintFormatPrices.priceCents })
    .from(shopPrintFormatPrices)
    .where(eq(shopPrintFormatPrices.printFormatId, formatId));

  const qualityIds = priceRows.map((row) => row.printQualityId);
  const qualityRows =
    qualityIds.length > 0
      ? await db
          .select({ id: shopPrintQualities.id, name: shopPrintQualities.name, sortOrder: shopPrintQualities.sortOrder })
          .from(shopPrintQualities)
          .where(inArray(shopPrintQualities.id, qualityIds))
      : [];
  const qualityById = new Map(qualityRows.map((row) => [row.id, row]));

  const prices = priceRows
    .map((row) => ({
      printQualityId: row.printQualityId,
      printQualityName: qualityById.get(row.printQualityId)?.name ?? row.printQualityId,
      priceCents: row.priceCents,
      sortOrder: qualityById.get(row.printQualityId)?.sortOrder ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ printQualityId, printQualityName, priceCents }) => ({ printQualityId, printQualityName, priceCents }));

  return {
    id: formatRow.id,
    name: formatRow.name,
    description: formatRow.description,
    widthCm: formatRow.widthCm,
    heightCm: formatRow.heightCm,
    sortOrder: formatRow.sortOrder,
    isFeatured: formatRow.isFeatured,
    minPriceCents: minPriceOrNull(priceRows.map((row) => row.priceCents)),
    prices,
  };
}
