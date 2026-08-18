// Auflösungslogik "welches Paket/Druckformat ist für ein konkretes Bild
// effektiv verfügbar" — mit dem User abgestimmte Regel (siehe Memory
// project_shop_assignment_resolution_logic):
//
// 1. Ein Bild-Override (shop_image_*_assignments) hat IMMER Vorrang. Eine
//    gesetzte Kategorie/Qualität gilt; NULL (explizit deaktiviert) sperrt
//    das Produkt für dieses Bild komplett, unabhängig vom Standort.
// 2. Ohne Override: von der eigenen Verwaltungseinheit des Bildes die
//    parentId-Kette nach oben laufen (eigene Einheit zuerst, dann Eltern-
//    Ebene, ... bis zur Wurzel) — die NÄCHSTGELEGENE Ebene mit irgendeiner
//    Zuordnung für genau dieses Paket/Format gewinnt vollständig (bei
//    Paketen die eine dort gesetzte Kategorie, bei Drucken ALLE dort
//    zugeordneten Qualitäten). Kein Treffer in der gesamten Kette → Produkt
//    für dieses Bild nicht verfügbar (kein impliziter Default).
// 3. Regionen sind NICHT hierarchisch — nur die Zuordnung der Region selbst
//    zählt, keine Vererbung von/zu den verknüpften Verwaltungseinheiten.
//
// Enthält bewusst sowohl den reinen Algorithmus als auch den DB-Zugriff in
// einer Datei (gleiches Muster wie src/lib/settings-service.ts) — diese
// Funktionen werden später auch von der öffentlichen Shopseite aufgerufen,
// nicht nur von Admin-Actions, daher kein Admin-spezifisches actions.ts als
// alleiniger Aufrufer.

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  images,
  administrativeUnits,
  regions,
  shopPackages,
  shopLocationPackageAssignments,
  shopImagePackageAssignments,
  shopPrintFormats,
  shopLocationPrintFormatAssignments,
  shopImagePrintFormatAssignments,
} from "@/db/schema";
import type { StandortRef } from "@/lib/standort";

export interface EffectivePackageAssignment {
  packageId: string;
  categoryId: string;
  source: { type: "override" } | { type: "location"; standort: StandortRef; label: string };
}

export interface EffectivePrintFormatAssignment {
  printFormatId: string;
  printQualityIds: string[];
  source: { type: "override" } | { type: "location"; standort: StandortRef; label: string };
}

/**
 * Kette der Verwaltungseinheiten-Ids von unitId aus NACH OBEN (eigene
 * Einheit zuerst, dann Eltern, ... bis zur Wurzel). Bewusst lokal statt
 * pathToRoot aus src/lib/administrative-units.ts wiederzuverwenden: dort
 * ist der Typ auf das volle AdministrativeUnit (inkl. level/code/
 * shortName/color/published) festgelegt und die Rückgabe Wurzel-zuerst —
 * hier reicht id/parentId, und die hier gebrauchte Reihenfolge ist ohnehin
 * genau umgekehrt (nächstgelegen zuerst, für den Abbruch beim ersten
 * Treffer).
 */
function nearestFirstChain(unitId: string, byId: Map<string, { parentId: string | null }>): string[] {
  const chain: string[] = [];
  let currentId: string | undefined = unitId;
  while (currentId) {
    const current = byId.get(currentId);
    if (!current) break;
    chain.push(currentId);
    currentId = current.parentId ?? undefined;
  }
  return chain;
}

export async function resolveEffectivePackagesForImage(imageId: string): Promise<EffectivePackageAssignment[]> {
  const [imageRow] = await db
    .select({ administrativeUnitId: images.administrativeUnitId, regionId: images.regionId })
    .from(images)
    .where(eq(images.id, imageId))
    .limit(1);
  if (!imageRow) return [];

  const packages = await db.select({ id: shopPackages.id }).from(shopPackages).orderBy(shopPackages.sortOrder);

  const locationByPackageId = new Map<string, { categoryId: string; standort: StandortRef; label: string }>();

  if (imageRow.regionId) {
    const [regionRow] = await db.select({ name: regions.name }).from(regions).where(eq(regions.id, imageRow.regionId)).limit(1);
    const rows = await db
      .select({ packageId: shopLocationPackageAssignments.packageId, categoryId: shopLocationPackageAssignments.categoryId })
      .from(shopLocationPackageAssignments)
      .where(eq(shopLocationPackageAssignments.regionId, imageRow.regionId));
    for (const row of rows) {
      locationByPackageId.set(row.packageId, {
        categoryId: row.categoryId,
        standort: { type: "region", id: imageRow.regionId },
        label: regionRow?.name ?? "",
      });
    }
  } else if (imageRow.administrativeUnitId) {
    const units = await db
      .select({ id: administrativeUnits.id, parentId: administrativeUnits.parentId, name: administrativeUnits.name })
      .from(administrativeUnits);
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const chain = nearestFirstChain(imageRow.administrativeUnitId, byId);

    const rows = await db
      .select({
        administrativeUnitId: shopLocationPackageAssignments.administrativeUnitId,
        packageId: shopLocationPackageAssignments.packageId,
        categoryId: shopLocationPackageAssignments.categoryId,
      })
      .from(shopLocationPackageAssignments)
      .where(inArray(shopLocationPackageAssignments.administrativeUnitId, chain));

    // packageId -> unitId -> categoryId, damit pro Paket unabhängig die
    // nächstgelegene Ebene mit Treffer ermittelt werden kann.
    const byPackageThenUnit = new Map<string, Map<string, string>>();
    for (const row of rows) {
      if (!row.administrativeUnitId) continue;
      const byUnit = byPackageThenUnit.get(row.packageId) ?? new Map<string, string>();
      byUnit.set(row.administrativeUnitId, row.categoryId);
      byPackageThenUnit.set(row.packageId, byUnit);
    }

    for (const [packageId, byUnit] of byPackageThenUnit) {
      for (const unitId of chain) {
        const categoryId = byUnit.get(unitId);
        if (categoryId) {
          locationByPackageId.set(packageId, { categoryId, standort: { type: "unit", id: unitId }, label: byId.get(unitId)?.name ?? "" });
          break;
        }
      }
    }
  }

  const overrideRows = await db
    .select({ packageId: shopImagePackageAssignments.packageId, categoryId: shopImagePackageAssignments.categoryId })
    .from(shopImagePackageAssignments)
    .where(eq(shopImagePackageAssignments.imageId, imageId));
  const overrideByPackageId = new Map(overrideRows.map((row) => [row.packageId, row.categoryId]));

  const result: EffectivePackageAssignment[] = [];
  for (const pkg of packages) {
    if (overrideByPackageId.has(pkg.id)) {
      const categoryId = overrideByPackageId.get(pkg.id);
      if (categoryId) {
        result.push({ packageId: pkg.id, categoryId, source: { type: "override" } });
      }
      // categoryId null => für dieses Bild explizit deaktiviert, komplett auslassen.
      continue;
    }
    const location = locationByPackageId.get(pkg.id);
    if (location) {
      result.push({
        packageId: pkg.id,
        categoryId: location.categoryId,
        source: { type: "location", standort: location.standort, label: location.label },
      });
    }
  }
  return result;
}

export async function resolveEffectivePrintFormatsForImage(imageId: string): Promise<EffectivePrintFormatAssignment[]> {
  const [imageRow] = await db
    .select({ administrativeUnitId: images.administrativeUnitId, regionId: images.regionId })
    .from(images)
    .where(eq(images.id, imageId))
    .limit(1);
  if (!imageRow) return [];

  const formats = await db.select({ id: shopPrintFormats.id }).from(shopPrintFormats).orderBy(shopPrintFormats.sortOrder);

  const locationByFormatId = new Map<string, { qualityIds: string[]; standort: StandortRef; label: string }>();

  if (imageRow.regionId) {
    const [regionRow] = await db.select({ name: regions.name }).from(regions).where(eq(regions.id, imageRow.regionId)).limit(1);
    const rows = await db
      .select({
        printFormatId: shopLocationPrintFormatAssignments.printFormatId,
        printQualityId: shopLocationPrintFormatAssignments.printQualityId,
      })
      .from(shopLocationPrintFormatAssignments)
      .where(eq(shopLocationPrintFormatAssignments.regionId, imageRow.regionId));
    for (const row of rows) {
      const entry = locationByFormatId.get(row.printFormatId) ?? {
        qualityIds: [],
        standort: { type: "region", id: imageRow.regionId } as StandortRef,
        label: regionRow?.name ?? "",
      };
      entry.qualityIds.push(row.printQualityId);
      locationByFormatId.set(row.printFormatId, entry);
    }
  } else if (imageRow.administrativeUnitId) {
    const units = await db
      .select({ id: administrativeUnits.id, parentId: administrativeUnits.parentId, name: administrativeUnits.name })
      .from(administrativeUnits);
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const chain = nearestFirstChain(imageRow.administrativeUnitId, byId);

    const rows = await db
      .select({
        administrativeUnitId: shopLocationPrintFormatAssignments.administrativeUnitId,
        printFormatId: shopLocationPrintFormatAssignments.printFormatId,
        printQualityId: shopLocationPrintFormatAssignments.printQualityId,
      })
      .from(shopLocationPrintFormatAssignments)
      .where(inArray(shopLocationPrintFormatAssignments.administrativeUnitId, chain));

    // formatId -> unitId -> qualityIds[], damit pro Format unabhängig die
    // nächstgelegene Ebene mit Treffer ermittelt werden kann — an dieser
    // Ebene zählen dann ALLE dort zugeordneten Qualitäten (Drucke erlauben
    // mehrere Qualitäten pro Format+Standort, siehe schema.ts).
    const byFormatThenUnit = new Map<string, Map<string, string[]>>();
    for (const row of rows) {
      if (!row.administrativeUnitId) continue;
      const byUnit = byFormatThenUnit.get(row.printFormatId) ?? new Map<string, string[]>();
      const qualityIds = byUnit.get(row.administrativeUnitId) ?? [];
      qualityIds.push(row.printQualityId);
      byUnit.set(row.administrativeUnitId, qualityIds);
      byFormatThenUnit.set(row.printFormatId, byUnit);
    }

    for (const [printFormatId, byUnit] of byFormatThenUnit) {
      for (const unitId of chain) {
        const qualityIds = byUnit.get(unitId);
        if (qualityIds && qualityIds.length > 0) {
          locationByFormatId.set(printFormatId, { qualityIds, standort: { type: "unit", id: unitId }, label: byId.get(unitId)?.name ?? "" });
          break;
        }
      }
    }
  }

  const overrideRows = await db
    .select({
      printFormatId: shopImagePrintFormatAssignments.printFormatId,
      printQualityId: shopImagePrintFormatAssignments.printQualityId,
    })
    .from(shopImagePrintFormatAssignments)
    .where(eq(shopImagePrintFormatAssignments.imageId, imageId));
  const overrideByFormatId = new Map(overrideRows.map((row) => [row.printFormatId, row.printQualityId]));

  const result: EffectivePrintFormatAssignment[] = [];
  for (const format of formats) {
    if (overrideByFormatId.has(format.id)) {
      const qualityId = overrideByFormatId.get(format.id);
      if (qualityId) {
        result.push({ printFormatId: format.id, printQualityIds: [qualityId], source: { type: "override" } });
      }
      // qualityId null => für dieses Bild explizit deaktiviert, komplett auslassen.
      continue;
    }
    const location = locationByFormatId.get(format.id);
    if (location) {
      result.push({
        printFormatId: format.id,
        printQualityIds: location.qualityIds,
        source: { type: "location", standort: location.standort, label: location.label },
      });
    }
  }
  return result;
}
