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

/**
 * Serverseitig für eine Datei-Zeile entschiedenes Ergebnis: welche
 * Feldwerte geschrieben werden sollen (1:1 aus der Datei) und ob/wohin
 * administrativeUnitId neu zugewiesen wird. Reist unverändert zurück zum
 * Client und von dort — Zeile für Zeile — an applyImageMatchEntry, damit
 * die teure Vorbereitung (Freigaben/Verwaltungseinheiten laden) nur EINMAL
 * passiert, aber jede Zeile einzeln geschrieben wird (Grundlage für den
 * Live-Fortschritt im Upload-Manager).
 */
export interface PreparedMatchEntry {
  id: string;
  hash: string;
  lat: number | null;
  lng: number | null;
  mainLocation: string | null;
  secondaryLocations: string[];
  tags: string[];
  // user_tags wird bewusst NICHT aus der Datei übernommen — bei diesem Feld
  // ist die images-Tabelle die Wahrheit, nicht die Match-Datei (im Gegensatz
  // zu allen anderen Feldern hier). Pro-Tag-Eigentümerschaft (siehe
  // UserTagEntry) lässt sich aus einer reinen Text-Liste in der Datei
  // ohnehin nicht ableiten. Verwaltung läuft über addUserTag/removeUserTag
  // in src/app/images/actions.ts.
  webVisible: boolean | null;
  webRanking: number | null;
  printVisible: boolean | null;
  printRanking: number | null;
  newAdministrativeUnitId: string | null;
  warning: string | null;
}

export interface PrepareImageMatchResult {
  success: boolean;
  error?: string;
  /** Datei-Zeilen ohne passende images-Zeile (Bild noch nicht hochgeladen)
   * — bewusst nur als Zahl, keine Einzelauflistung (siehe Abgleich-Plan). */
  skippedCount?: number;
  plan?: PreparedMatchEntry[];
}

/**
 * Erster Schritt von "Abgleich durchführen": Auth-Check, do_match-Filter,
 * lädt die betroffenen images-Zeilen sowie (einmalig) Freigaben und
 * Verwaltungseinheiten und entscheidet PRO ZEILE, welche Werte geschrieben
 * werden sollen — schreibt selbst aber noch NICHTS in die DB (siehe
 * applyImageMatchEntry für den zweiten Schritt). area verfeinert den
 * Standort: passt area auf den code eines DIREKTEN Kindes der aktuell
 * zugewiesenen administrativeUnitId UND hat der admin dafür eine Freigabe,
 * wird administrativeUnitId auf dieses Kind umgestellt — sonst bleibt der
 * Standort unverändert und es gibt eine Warnung. regionId wird nie
 * verändert (Regionen folgen später).
 */
export async function prepareImageMatch(entries: MatchFileEntry[]): Promise<PrepareImageMatchResult> {
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
    return { success: true, skippedCount: 0, plan: [] };
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
    return { success: true, skippedCount, plan: [] };
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

  const plan: PreparedMatchEntry[] = matched.map((entry) => {
    const existing = existingById.get(entry.id)!;
    let newAdministrativeUnitId: string | null = null;
    let warning: string | null = null;

    if (existing.regionId) {
      warning = "Zugewiesener Standort ist eine Region — area-Zuordnung wird aktuell nicht unterstützt.";
    } else if (!existing.administrativeUnitId) {
      warning = "Zeile hat noch keinen zugewiesenen Standort.";
    } else if (!entry.area) {
      warning = "area fehlt in der Datei.";
    } else if (unitById.get(existing.administrativeUnitId)?.code !== entry.area) {
      // Nur suchen/warnen, wenn die aktuell zugewiesene Einheit nicht
      // bereits selbst zu area passt — sonst hat ein früherer Abgleich
      // das schon erledigt und ein erneuter Lauf (z.B. nur wegen anderer
      // geänderter Felder) soll das nicht fälschlich als Fehler zeigen.
      const child = childByParentAndCode.get(`${existing.administrativeUnitId}::${entry.area}`);
      if (!child) {
        warning = `area "${entry.area}" existiert nicht als Unterebene des zugewiesenen Standorts.`;
      } else {
        const check = canAssignImageLocation({
          actingRole: session.user.role,
          standort: { type: "unit", id: child.id },
          grantedUnitIds,
          grantedRegionIds,
        });
        if (!check.allowed) {
          warning = `Keine Berechtigung für area "${entry.area}" (${child.name}).`;
        } else {
          newAdministrativeUnitId = child.id;
        }
      }
    }

    return {
      id: entry.id,
      hash: entry.hash,
      lat: entry.lat_lng?.[0] ?? null,
      lng: entry.lat_lng?.[1] ?? null,
      mainLocation: entry.main_location,
      secondaryLocations: entry.secondary_locations,
      tags: entry.tags,
      webVisible: entry.web_visible,
      webRanking: entry.web_ranking,
      printVisible: entry.print_visible,
      printRanking: entry.print_ranking,
      newAdministrativeUnitId,
      warning,
    };
  });

  return { success: true, skippedCount, plan };
}

export interface ApplyImageMatchEntryResult {
  success: boolean;
  error?: string;
}

/**
 * Zweiter Schritt von "Abgleich durchführen": schreibt GENAU EINE, von
 * prepareImageMatch bereits entschiedene Zeile. Wird vom Client einzeln
 * pro Ordner aufgerufen (nicht als eine große Transaktion über alle Zeilen)
 * — dadurch kann die UI zwischen den Aufrufen den Fortschritt live anzeigen.
 * Legt NIE eine neue Zeile an, löscht NIE eine Zeile. user_tags wird NIE
 * geschrieben (siehe Kommentar an PreparedMatchEntry). print_visible/
 * print_ranking dürfen nur vom super_admin geschrieben werden — bei jedem
 * anderen (zulässigen, siehe canUploadImages) Aufrufer bleiben die
 * vorhandenen DB-Werte für diese zwei Felder unangetastet.
 */
export async function applyImageMatchEntry(entry: PreparedMatchEntry): Promise<ApplyImageMatchEntryResult> {
  const session = await auth();

  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canUploadImages(session.user.role)) {
    return { success: false, error: "Nur admin oder super_admin dürfen den Abgleich durchführen." };
  }

  const [existing] = await db
    .select({ printVisible: images.printVisible, printRanking: images.printRanking })
    .from(images)
    .where(eq(images.id, entry.id))
    .limit(1);
  if (!existing) {
    return { success: false, error: "Bild nicht gefunden." };
  }
  const canManagePrintFields = session.user.role === "super_admin";

  await db
    .update(images)
    .set({
      hash: entry.hash,
      lat: entry.lat,
      lng: entry.lng,
      mainLocation: entry.mainLocation,
      secondaryLocations: entry.secondaryLocations,
      tags: entry.tags,
      webVisible: entry.webVisible,
      webRanking: entry.webRanking,
      printVisible: canManagePrintFields ? entry.printVisible : existing.printVisible,
      printRanking: canManagePrintFields ? entry.printRanking : existing.printRanking,
      updatedAt: new Date(),
      ...(entry.newAdministrativeUnitId ? { administrativeUnitId: entry.newAdministrativeUnitId } : {}),
    })
    .where(eq(images.id, entry.id));

  revalidatePath("/admin/images/upload");
  return { success: true };
}
