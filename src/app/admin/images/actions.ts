"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { images, adminLocationGrants, administrativeUnits } from "@/db/schema";
import { canAssignImageLocation, canUploadImages } from "@/lib/authorization";
import type { AdministrativeUnit } from "@/lib/administrative-units";
import type { StandortRef } from "@/lib/standort";
import type { ParsedImageFolder } from "@/lib/image-folder";
import type { MatchFileEntry } from "@/lib/parse-match-file";

export interface CreateImageRecordInput extends ParsedImageFolder {
  /** Vollständiger Ordnername — Primärschlüssel von images, siehe schema.ts. */
  id: string;
  standort: StandortRef;
}

export interface CreateImageRecordResult {
  success: boolean;
  error?: string;
}

/**
 * Insert/Upsert (onConflictDoUpdate über id) — wird vom Upload-Client
 * aufgerufen, NACHDEM alle lokalen Dateien eines Ordners bestätigt
 * hochgeladen/unverändert sind und der Sync-Schritt gelaufen ist. Der Upsert
 * macht erneute Läufe über denselben Ordner (Resume) unkompliziert: einfach
 * erneut aufrufen, kein separater Update-Pfad nötig.
 */
export async function createImageRecord(input: CreateImageRecordInput): Promise<CreateImageRecordResult> {
  const session = await auth();

  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canUploadImages(session.user.role)) {
    return { success: false, error: "Nur admin oder super_admin dürfen Bilder hochladen." };
  }

  // Freigaben live aus der DB nachgeladen statt dem Client-seitigen Picker
  // zu vertrauen — derselbe Grund wie bei jeder anderen Server Action in
  // diesem Projekt (defense in depth).
  let grantedUnitIds = new Set<string>();
  let grantedRegionIds = new Set<string>();
  if (session.user.role !== "super_admin") {
    const grants = await db
      .select({
        administrativeUnitId: adminLocationGrants.administrativeUnitId,
        regionId: adminLocationGrants.regionId,
      })
      .from(adminLocationGrants)
      .where(eq(adminLocationGrants.adminUserId, session.user.id));
    grantedUnitIds = new Set(
      grants.map((grant) => grant.administrativeUnitId).filter((id): id is string => id !== null)
    );
    grantedRegionIds = new Set(grants.map((grant) => grant.regionId).filter((id): id is string => id !== null));
  }

  const check = canAssignImageLocation({
    actingRole: session.user.role,
    standort: input.standort,
    grantedUnitIds,
    grantedRegionIds,
  });
  if (!check.allowed) {
    return { success: false, error: check.reason };
  }

  const values = {
    address: input.address,
    captureDate: input.captureDate,
    sequenceNumber: input.sequenceNumber,
    hash: input.hash,
    uuid: input.uuid,
    administrativeUnitId: input.standort.type === "unit" ? input.standort.id : null,
    regionId: input.standort.type === "region" ? input.standort.id : null,
  };

  await db
    .insert(images)
    .values({ id: input.id, uploadedBy: session.user.id, ...values })
    .onConflictDoUpdate({
      target: images.id,
      set: { ...values, updatedAt: new Date() },
    });

  revalidatePath("/admin/images/upload");
  return { success: true };
}

export interface RunImageMatchWarning {
  id: string;
  message: string;
}

export interface RunImageMatchResult {
  success: boolean;
  error?: string;
  updatedCount?: number;
  /** Datei-Zeilen ohne passende images-Zeile (Bild noch nicht hochgeladen)
   * — bewusst nur als Zahl, keine Einzelauflistung (siehe Abgleich-Plan). */
  skippedCount?: number;
  warnings?: RunImageMatchWarning[];
  /** ids aller tatsächlich synchronisierten Zeilen — Grundlage dafür, dass
   * der Client eine aktualisierte Datei mit do_match: false für genau diese
   * Zeilen anbieten kann (verhindert, dass ein erneuter Lauf mit derselben
   * Datei später in der DB gemachte Änderungen überschreibt). */
  updatedIds?: string[];
}

/**
 * "Abgleich durchführen" auf der Upload-Seite: die Datei-Zeile ist für JEDES
 * Feld die Wahrheit (auch ein leerer Wert überschreibt einen vorhandenen
 * DB-Wert) — aber NUR für bereits vorhandene images-Zeilen. Legt NIE eine
 * neue Zeile an, löscht NIE eine Zeile. area verfeinert den Standort: passt
 * area auf den code eines DIREKTEN Kindes der aktuell zugewiesenen
 * administrativeUnitId UND hat der admin dafür eine Freigabe, wird
 * administrativeUnitId auf dieses Kind umgestellt — sonst bleibt der
 * Standort unverändert und es gibt eine Warnung. regionId wird nie
 * verändert (Regionen folgen später).
 */
export async function runImageMatch(entries: MatchFileEntry[]): Promise<RunImageMatchResult> {
  const session = await auth();

  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canUploadImages(session.user.role)) {
    return { success: false, error: "Nur admin oder super_admin dürfen den Abgleich durchführen." };
  }

  const relevant = entries.filter((entry) => entry.do_match === true);
  if (relevant.length === 0) {
    return { success: true, updatedCount: 0, skippedCount: 0, warnings: [], updatedIds: [] };
  }

  const existingRows = await db
    .select({
      id: images.id,
      administrativeUnitId: images.administrativeUnitId,
      regionId: images.regionId,
    })
    .from(images)
    .where(
      inArray(
        images.id,
        relevant.map((entry) => entry.id)
      )
    );
  const existingById = new Map(existingRows.map((row) => [row.id, row]));

  // Datei-Zeilen ohne DB-Treffer (Bild noch nicht hochgeladen) werden
  // stillschweigend verworfen — abgestimmt mit dem User, sonst wäre bei
  // z.B. 1060 Datei-Zeilen gegenüber 100 hochgeladenen Ordnern die Meldung
  // pro fehlendem Bild nur Rauschen.
  const matched = relevant.filter((entry) => existingById.has(entry.id));
  const skippedCount = relevant.length - matched.length;
  if (matched.length === 0) {
    return { success: true, updatedCount: 0, skippedCount, warnings: [], updatedIds: [] };
  }

  // Freigaben live aus der DB nachgeladen (wie in createImageRecord) —
  // Grundlage für die Berechtigungsprüfung bei einer area-basierten
  // Standort-Neuzuweisung.
  let grantedUnitIds = new Set<string>();
  let grantedRegionIds = new Set<string>();
  if (session.user.role !== "super_admin") {
    const grants = await db
      .select({
        administrativeUnitId: adminLocationGrants.administrativeUnitId,
        regionId: adminLocationGrants.regionId,
      })
      .from(adminLocationGrants)
      .where(eq(adminLocationGrants.adminUserId, session.user.id));
    grantedUnitIds = new Set(
      grants.map((grant) => grant.administrativeUnitId).filter((id): id is string => id !== null)
    );
    grantedRegionIds = new Set(grants.map((grant) => grant.regionId).filter((id): id is string => id !== null));
  }

  // Kleine Tabelle, komplett geladen (wie in getImageUploadLocationData) —
  // Index für "direktes Kind mit gegebenem Parent+Code" (code ist nur pro
  // Elternknoten eindeutig, siehe administrative_units_parent_code_idx).
  const units = await db
    .select({
      id: administrativeUnits.id,
      parentId: administrativeUnits.parentId,
      code: administrativeUnits.code,
      name: administrativeUnits.name,
    })
    .from(administrativeUnits);
  const childByParentAndCode = new Map<string, Pick<AdministrativeUnit, "id" | "name">>();
  for (const unit of units) {
    if (unit.parentId) childByParentAndCode.set(`${unit.parentId}::${unit.code}`, unit);
  }
  const unitById = new Map<string, Pick<AdministrativeUnit, "id" | "code" | "name">>(
    units.map((unit) => [unit.id, unit])
  );

  const warnings: RunImageMatchWarning[] = [];

  await db.transaction(async (tx) => {
    for (const entry of matched) {
      const existing = existingById.get(entry.id)!;
      let newAdministrativeUnitId: string | null = null;

      if (existing.regionId) {
        warnings.push({
          id: entry.id,
          message: "Zugewiesener Standort ist eine Region — area-Zuordnung wird aktuell nicht unterstützt.",
        });
      } else if (!existing.administrativeUnitId) {
        warnings.push({ id: entry.id, message: "Zeile hat noch keinen zugewiesenen Standort." });
      } else if (!entry.area) {
        warnings.push({ id: entry.id, message: "area fehlt in der Datei." });
      } else if (unitById.get(existing.administrativeUnitId)?.code !== entry.area) {
        // Nur suchen/warnen, wenn die aktuell zugewiesene Einheit nicht
        // bereits selbst zu area passt — sonst hat ein früherer Abgleich
        // das schon erledigt und ein erneuter Lauf (z.B. nur wegen anderer
        // geänderter Felder) soll das nicht fälschlich als Fehler zeigen.
        const child = childByParentAndCode.get(`${existing.administrativeUnitId}::${entry.area}`);
        if (!child) {
          warnings.push({
            id: entry.id,
            message: `area "${entry.area}" existiert nicht als Unterebene des zugewiesenen Standorts.`,
          });
        } else {
          const check = canAssignImageLocation({
            actingRole: session.user.role,
            standort: { type: "unit", id: child.id },
            grantedUnitIds,
            grantedRegionIds,
          });
          if (!check.allowed) {
            warnings.push({
              id: entry.id,
              message: `Keine Berechtigung für area "${entry.area}" (${child.name}).`,
            });
          } else {
            newAdministrativeUnitId = child.id;
          }
        }
      }

      await tx
        .update(images)
        .set({
          hash: entry.hash,
          lat: entry.lat_lng?.[0] ?? null,
          lng: entry.lat_lng?.[1] ?? null,
          mainLocation: entry.main_location,
          secondaryLocations: entry.secondary_locations,
          tags: entry.tags,
          userTags: entry.user_tags,
          webVisible: entry.web_visible,
          webRanking: entry.web_ranking,
          printVisible: entry.print_visible,
          printRanking: entry.print_ranking,
          updatedAt: new Date(),
          ...(newAdministrativeUnitId ? { administrativeUnitId: newAdministrativeUnitId } : {}),
        })
        .where(eq(images.id, entry.id));
    }
  });

  revalidatePath("/admin/images/upload");
  return {
    success: true,
    updatedCount: matched.length,
    skippedCount,
    warnings,
    updatedIds: matched.map((entry) => entry.id),
  };
}
