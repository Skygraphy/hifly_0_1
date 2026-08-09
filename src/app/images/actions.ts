"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { images, imageFavorites, type UserTagEntry } from "@/db/schema";
import { canSeeHiddenImages, canEditImage, canDeleteImage, canManageUserTag } from "@/lib/authorization";
import { thumbUrlFor, previewUrlFor } from "@/lib/image-folder";
import { listObjectKeysUnderPrefix, deleteObjects } from "@/lib/s3";

const PAGE_SIZE = 60;

export type ImageSortBy = "ranking" | "address-asc" | "address-desc";

export interface SearchImagesInput {
  /** Bereits um Nachfahren erweiterte Einheiten-ids (siehe
   * collectDescendantIds), vom Client berechnet — spart eine erneute
   * administrativeUnits-Abfrage bei jedem Tastendruck. */
  administrativeUnitIds?: string[];
  regionId?: string;
  locationQuery: string;
  tagsQuery: string;
  /** Sucht in images.hash (User-facing "ID") — optional statt required wie
   * die beiden Felder oben, damit bestehende Aufrufer (u.a. viele
   * Testfälle) ohne Änderung gültig bleiben; fehlt es, wirkt einfach kein
   * ID-Filter (siehe buildImageConditions). */
  hashQuery?: string;
  /** Filtert auf den Favoriten-Status der aktuellen Session — fehlt/undefined
   * = kein Filter ("Alle"), "yes" = nur eigene Favoriten, "no" = nur
   * NICHT favorisierte Bilder. Anonyme Sessions haben nie Favoriten (siehe
   * buildImageConditions: "yes" liefert dann leer, "no" liefert alles). */
  favoritesOnly?: "yes" | "no";
  offset: number;
  /** Fehlt (z.B. beim initialen Server-Render in page.tsx) → "ranking". */
  sortBy?: ImageSortBy;
}

export interface ImageSearchRow {
  id: string;
  /** 6-stelliger Hash aus dem Ordnernamen — User-facing als "ID"
   * bezeichnet (eindeutige Kennung zum Identifizieren/Bestellen eines
   * Bilds, DB-seitig per images_hash_idx erzwungen). Durchsuchbar über
   * hashQuery, angezeigt im Vollbild-Popup (CopyableIdBadge in
   * image-preview-popup.tsx). */
  hash: string;
  mainLocation: string | null;
  secondaryLocations: string[];
  tags: string[];
  userTags: UserTagEntry[];
  webVisible: boolean | null;
  webRanking: number | null;
  printVisible: boolean | null;
  printRanking: number | null;
  /** Für die Owner-only Bearbeiten/Löschen-Prüfung auf dem Client (siehe
   * canEditImage/canDeleteImage) — die serverseitige Prüfung in
   * updateImageMetadata/deleteImage/deleteImages ist die eigentliche
   * Absicherung, das hier steuert nur, ob die Icons/Checkbox angezeigt werden. */
  uploadedBy: string;
  /** Ob die AKTUELLE Session dieses Bild favorisiert hat (siehe
   * image_favorites in schema.ts) — für anonyme Sessions immer false. */
  isFavorite: boolean;
  thumbUrl: string;
  /** Vollbild-Ansicht (preview.jpg statt thumb.jpg) fürs Popup. */
  previewUrl: string;
  /** Nie beide gleichzeitig gesetzt (images_standort_check) — für den
   * Standort-Punkt auf Kachel/Preview, der dieselbe Farbe wie der
   * zugehörige Karten-Marker zeigt (siehe resolveImageColor in
   * image-map-colors.ts, genutzt in images-page-client.tsx). */
  administrativeUnitId: string | null;
  regionId: string | null;
}

export interface SearchImagesResult {
  rows: ImageSearchRow[];
  hasMore: boolean;
  /** Gesamtzahl der Treffer über alle Seiten hinweg (unabhängig von limit/offset). */
  total: number;
}

function splitWords(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

/**
 * Gemeinsame Filter-Bedingungen für searchImages UND searchImageLocations —
 * beide durchsuchen dieselben Felder (Sichtbarkeit, Standort, Ort-/Tags-Text)
 * und müssen daher exakt gleich bleiben. Vorher gab es dafür zwei Kopien;
 * eine Divergenz genau hier hatte bereits einmal die Tags-Suche stillschweigend
 * kaputt gemacht (array_to_string auf der inzwischen jsonb-gewordenen
 * user_tags-Spalte), siehe Kommentar bei der tagsQuery-Bedingung unten.
 */
function buildImageConditions(input: SearchImagesInput, seesHiddenImages: boolean, currentUserId: string | undefined): SQL[] {
  const conditions: SQL[] = [];

  if (!seesHiddenImages) {
    conditions.push(eq(images.webVisible, true));
  }

  if (input.administrativeUnitIds && input.administrativeUnitIds.length > 0) {
    conditions.push(inArray(images.administrativeUnitId, input.administrativeUnitIds));
  } else if (input.regionId) {
    conditions.push(eq(images.regionId, input.regionId));
  }

  for (const word of splitWords(input.locationQuery)) {
    const pattern = `%${word}%`;
    conditions.push(
      sql`(${images.mainLocation} ILIKE ${pattern} OR array_to_string(${images.secondaryLocations}, ' ') ILIKE ${pattern})`
    );
  }

  for (const word of splitWords(input.tagsQuery)) {
    const pattern = `%${word}%`;
    // user_tags ist jsonb ({tag, addedBy}[]), kein text[] mehr — array_to_string
    // funktioniert dafür nicht (Postgres kennt die Funktion nicht für jsonb).
    // jsonb_array_elements + string_agg zieht die "tag"-Texte zum Vergleich raus.
    conditions.push(
      sql`(array_to_string(${images.tags}, ' ') ILIKE ${pattern} OR (SELECT string_agg(elem->>'tag', ' ') FROM jsonb_array_elements(COALESCE(${images.userTags}, '[]'::jsonb)) AS elem) ILIKE ${pattern})`
    );
  }

  for (const word of splitWords(input.hashQuery ?? "")) {
    const pattern = `%${word}%`;
    conditions.push(sql`${images.hash} ILIKE ${pattern}`);
  }

  // Favoriten hängen an der Session, nicht an einer Spalte auf images
  // selbst (siehe image_favorites in schema.ts) — daher eine korrelierte
  // EXISTS-Subquery statt eines einfachen Spaltenvergleichs. Anonyme
  // Sessions (currentUserId undefined) können nichts favorisiert haben:
  // "yes" liefert dann bewusst leer, "no" liefert bewusst alles.
  if (input.favoritesOnly === "yes") {
    conditions.push(
      currentUserId
        ? sql`EXISTS (SELECT 1 FROM ${imageFavorites} WHERE ${imageFavorites.imageId} = ${images.id} AND ${imageFavorites.userId} = ${currentUserId})`
        : sql`false`
    );
  } else if (input.favoritesOnly === "no") {
    conditions.push(
      currentUserId
        ? sql`NOT EXISTS (SELECT 1 FROM ${imageFavorites} WHERE ${imageFavorites.imageId} = ${images.id} AND ${imageFavorites.userId} = ${currentUserId})`
        : sql`true`
    );
  }

  return conditions;
}

/**
 * Liest die Bilder für /images — bewusst ohne Auth-Zwang (anonym erlaubt),
 * `auth()` wird trotzdem geladen, um die Sichtbarkeits-Regel zu bestimmen:
 * admin/super_admin sehen ALLE Bilder (auch web_visible = false/null), damit
 * sie unsichtbare Bilder von hier aus finden/bearbeiten können — alle
 * anderen (anonym, user) nur web_visible = true.
 *
 * Textfilter-Logik (mit dem User abgestimmt): location-, tags- und
 * hash-Query müssen alle drei treffen, wenn angegeben (UND). Jede Query
 * wird an Leerzeichen in Wörter gesplittet — alle Wörter müssen (UND)
 * irgendwo in den zugehörigen, zusammengeführten Feldern vorkommen.
 * location durchsucht main_location + secondary_locations (ODER zwischen
 * den beiden Feldern), tags durchsucht tags + user_tags (ODER), hash
 * (User-facing "ID") durchsucht nur die eine hash-Spalte.
 */
export async function searchImages(input: SearchImagesInput): Promise<SearchImagesResult> {
  const session = await auth();
  const role = session?.user?.role;
  const seesHiddenImages = canSeeHiddenImages(role);
  const currentUserId = session?.user?.id;

  const conditions = buildImageConditions(input, seesHiddenImages, currentUserId);

  // Sequenznummer und Aufnahmedatum laufen als versteckte, nicht auswählbare
  // Tiebreaker mit: bei Ort-Sortierung sonst identisch benannte Adressen in
  // eine sinnvolle, stabile Reihenfolge bringen, bevor der finale id-Tiebreaker
  // greift.
  //
  // Abschließend immer nach id sortieren: ohne diesen eindeutigen Tiebreaker
  // ist die Reihenfolge unter vielen gleich benannten Adressen (z.B. 6x
  // "Adalbert Stifter-Gasse") nicht deterministisch garantiert — Zeilen
  // könnten zwischen zwei Anfragen (Offset-Pagination, Neu-Laden) die Plätze
  // tauschen, was wie kaputte Sortierung wirkt.
  const orderBy =
    input.sortBy === "address-asc"
      ? [
          sql`${images.mainLocation} ASC NULLS LAST`,
          sql`${images.secondaryLocations} ASC NULLS LAST`,
          asc(images.sequenceNumber),
          asc(images.captureDate),
          asc(images.id),
        ]
      : input.sortBy === "address-desc"
        ? [
            sql`${images.mainLocation} DESC NULLS LAST`,
            sql`${images.secondaryLocations} DESC NULLS LAST`,
            desc(images.sequenceNumber),
            desc(images.captureDate),
            asc(images.id),
          ]
        : [sql`${images.webRanking} DESC NULLS LAST`, desc(images.createdAt), asc(images.id)];

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: images.id,
        hash: images.hash,
        mainLocation: images.mainLocation,
        secondaryLocations: images.secondaryLocations,
        tags: images.tags,
        userTags: images.userTags,
        webVisible: images.webVisible,
        webRanking: images.webRanking,
        printVisible: images.printVisible,
        printRanking: images.printRanking,
        uploadedBy: images.uploadedBy,
        administrativeUnitId: images.administrativeUnitId,
        regionId: images.regionId,
        // Korrelierte EXISTS-Subquery statt Join: liefert direkt einen
        // booleschen Wert pro Zeile, ohne die Kardinalität der
        // Haupt-Query zu verändern (ein LEFT JOIN auf image_favorites
        // würde bei mehreren Favoriten-Zeilen — kann hier zwar nicht
        // vorkommen, PK ist ja (user_id, image_id) — unnötig kompliziert
        // wirken). Anonyme Sessions haben nie Favoriten.
        isFavorite: currentUserId
          ? sql<boolean>`EXISTS (SELECT 1 FROM ${imageFavorites} WHERE ${imageFavorites.imageId} = ${images.id} AND ${imageFavorites.userId} = ${currentUserId})`
          : sql<boolean>`false`,
      })
      .from(images)
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(PAGE_SIZE + 1)
      .offset(input.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(images).where(whereClause),
  ]);

  const hasMore = rows.length > PAGE_SIZE;

  return {
    rows: rows.slice(0, PAGE_SIZE).map((row) => ({
      ...row,
      secondaryLocations: row.secondaryLocations ?? [],
      tags: row.tags ?? [],
      userTags: row.userTags ?? [],
      thumbUrl: thumbUrlFor(row.id),
      previewUrl: previewUrlFor(row.id),
    })),
    hasMore,
    total: count,
  };
}

/**
 * Lädt EINE Zeile per id, komplett — dieselbe Spaltenliste/Sichtbarkeits-
 * Logik wie searchImages. Gebraucht für den Klick auf einen Kartenpunkt
 * (images-map-view.tsx): `searchImageLocations` liefert für Kartenpunkte
 * bewusst nur id/lat/lng/administrativeUnitId/regionId (schlank, weil
 * unpaginiert — siehe dortiger Kommentar), das volle Preview-Popup
 * braucht aber die vollständige ImageSearchRow. Wird nur aufgerufen, wenn
 * das angeklickte Bild nicht ohnehin schon in den lokal geladenen
 * (paginierten) Grid-Zeilen steckt.
 */
export async function getImageById(id: string): Promise<ImageSearchRow | null> {
  const session = await auth();
  const seesHiddenImages = canSeeHiddenImages(session?.user?.role);
  const currentUserId = session?.user?.id;

  const conditions = [eq(images.id, id)];
  if (!seesHiddenImages) conditions.push(eq(images.webVisible, true));

  const [row] = await db
    .select({
      id: images.id,
      hash: images.hash,
      mainLocation: images.mainLocation,
      secondaryLocations: images.secondaryLocations,
      tags: images.tags,
      userTags: images.userTags,
      webVisible: images.webVisible,
      webRanking: images.webRanking,
      printVisible: images.printVisible,
      printRanking: images.printRanking,
      uploadedBy: images.uploadedBy,
      administrativeUnitId: images.administrativeUnitId,
      regionId: images.regionId,
      isFavorite: currentUserId
        ? sql<boolean>`EXISTS (SELECT 1 FROM ${imageFavorites} WHERE ${imageFavorites.imageId} = ${images.id} AND ${imageFavorites.userId} = ${currentUserId})`
        : sql<boolean>`false`,
    })
    .from(images)
    .where(and(...conditions))
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    secondaryLocations: row.secondaryLocations ?? [],
    tags: row.tags ?? [],
    userTags: row.userTags ?? [],
    thumbUrl: thumbUrlFor(row.id),
    previewUrl: previewUrlFor(row.id),
  };
}

export interface ImageLocation {
  id: string;
  lat: number;
  lng: number;
  /** Nie beide gleichzeitig gesetzt (images_standort_check). Die Marker-
   * Farbe wird NICHT hier aufgelöst, sondern clientseitig in
   * images-map-view.tsx — sie hängt von der aktuell im Standort-Filter
   * gewählten Ebene ab (siehe resolveImageColor in
   * src/lib/administrative-units.ts), nicht nur von der eigenen Zuordnung. */
  administrativeUnitId: string | null;
  regionId: string | null;
  /** Für das Hover-Vorschaubild auf der Karte (images-map-view.tsx) — eine
   * einzelne, günstige Text-Spalte. Bewusst KEIN isFavorite/tags/userTags
   * o.ä. hier: diese Query ist absichtlich unpaginiert (siehe Kommentar bei
   * searchImageLocations) und lädt potenziell hunderte/tausende Zeilen auf
   * einmal — eine korrelierte EXISTS-Subquery (wie isFavorite in
   * searchImages) oder größere jsonb-Spalten pro Zeile wären dafür
   * unverhältnismäßig teuer. */
  mainLocation: string | null;
}

/**
 * Kartendaten für die Google-Maps-Ansicht auf /images — bewusst OHNE
 * Pagination (anders als searchImages): eine Karte soll immer alle zum
 * Filter passenden Punkte zeigen, nicht nur die aktuell im Grid nachgeladene
 * Seite, sonst passen Zoom/Center-Fit nicht zur tatsächlichen Treffermenge.
 * Nutzt dieselben Filter-Bedingungen wie searchImages (buildImageConditions),
 * zusätzlich eingeschränkt auf Bilder mit vorhandenen Koordinaten — die gibt
 * es nur für Bilder, die den Abgleich-Flow durchlaufen haben.
 */
export async function searchImageLocations(input: SearchImagesInput): Promise<ImageLocation[]> {
  const session = await auth();
  const role = session?.user?.role;
  const seesHiddenImages = canSeeHiddenImages(role);

  const conditions = buildImageConditions(input, seesHiddenImages, session?.user?.id);
  conditions.push(isNotNull(images.lat), isNotNull(images.lng));

  const rows = await db
    .select({
      id: images.id,
      lat: images.lat,
      lng: images.lng,
      administrativeUnitId: images.administrativeUnitId,
      regionId: images.regionId,
      mainLocation: images.mainLocation,
    })
    .from(images)
    .where(and(...conditions));

  return rows.map((row) => ({
    id: row.id,
    // NOT NULL durch die isNotNull-Bedingungen oben erzwungen, aber der
    // Spaltentyp selbst bleibt nullable — hier ist ein Cast sicher.
    lat: row.lat!,
    lng: row.lng!,
    administrativeUnitId: row.administrativeUnitId,
    regionId: row.regionId,
    mainLocation: row.mainLocation,
  }));
}

export interface RandomImageThumb {
  id: string;
  mainLocation: string | null;
  thumbUrl: string;
}

/**
 * Bis zu 5 zufällige Bilder für einen Standort — für die rein dekorative
 * Vorschau auf der Startseite (siehe standort-thumbnail-preview.tsx),
 * zwischen dem gewählten Standort-Namen und der Breadcrumb-Navigation.
 * Nutzt dieselbe Sichtbarkeits-/Standort-Filterung wie searchImages
 * (buildImageConditions) — anonym erlaubt, wie dort. `order by random()`
 * statt einer festen Sortierung ist hier bewusst unproblematisch: es geht
 * um eine kleine, seltene Stichprobe (max. 5 Zeilen), nicht um eine
 * paginierte Auflistung, bei der ein voller Tabellen-Scan pro Aufruf ins
 * Gewicht fiele.
 */
export async function getRandomImages(input: {
  administrativeUnitIds?: string[];
  regionId?: string;
}): Promise<RandomImageThumb[]> {
  const session = await auth();
  const seesHiddenImages = canSeeHiddenImages(session?.user?.role);

  const conditions = buildImageConditions(
    { ...input, locationQuery: "", tagsQuery: "", hashQuery: "", offset: 0 },
    seesHiddenImages,
    session?.user?.id
  );
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({ id: images.id, mainLocation: images.mainLocation })
    .from(images)
    .where(whereClause)
    .orderBy(sql`random()`)
    .limit(5);

  return rows.map((row) => ({ ...row, thumbUrl: thumbUrlFor(row.id) }));
}

export interface UpdateImageMetadataInput {
  id: string;
  mainLocation: string | null;
  secondaryLocations: string[];
  tags: string[];
  webVisible: boolean | null;
  webRanking: number | null;
  printVisible: boolean | null;
  printRanking: number | null;
}

export interface UpdateImageMetadataResult {
  success: boolean;
  error?: string;
}

/**
 * Ändert NUR Anzeige-/Sichtbarkeits-Metadaten — weist NIE
 * administrativeUnitId/regionId neu zu (das bleibt Aufgabe des
 * "Abgleich"-Flows, siehe src/app/admin/images/actions.ts). user_tags wird
 * hier NICHT mehr verwaltet (siehe addUserTag/removeUserTag) — pro-Tag-
 * Eigentümerschaft passt nicht zu einer Freitext-Bulk-Ersetzung.
 * print_visible/print_ranking dürfen nur vom super_admin geändert werden,
 * auch der Owner-admin eines Bildes nicht — bei jedem anderen Aufrufer
 * bleiben die vorhandenen DB-Werte für diese zwei Felder unangetastet
 * (stilles Ignorieren statt Fehler, da alle anderen Felder trotzdem
 * gespeichert werden sollen).
 */
export async function updateImageMetadata(input: UpdateImageMetadataInput): Promise<UpdateImageMetadataResult> {
  const session = await auth();

  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }

  const [existing] = await db
    .select({ uploadedBy: images.uploadedBy, printVisible: images.printVisible, printRanking: images.printRanking })
    .from(images)
    .where(eq(images.id, input.id))
    .limit(1);
  if (!existing) {
    return { success: false, error: "Bild nicht gefunden." };
  }
  if (!canEditImage({ actingUserId: session.user.id, actingRole: session.user.role, imageUploadedBy: existing.uploadedBy })) {
    return { success: false, error: "Nur der Eigentümer oder super_admin darf dieses Bild bearbeiten." };
  }

  const canManagePrintFields = session.user.role === "super_admin";

  await db
    .update(images)
    .set({
      mainLocation: input.mainLocation,
      secondaryLocations: input.secondaryLocations,
      tags: input.tags,
      webVisible: input.webVisible,
      webRanking: input.webRanking,
      printVisible: canManagePrintFields ? input.printVisible : existing.printVisible,
      printRanking: canManagePrintFields ? input.printRanking : existing.printRanking,
      updatedAt: new Date(),
    })
    .where(eq(images.id, input.id));

  revalidatePath("/images");
  return { success: true };
}

export interface DeleteImageResult {
  success: boolean;
  error?: string;
}

/** Löscht zuerst alle S3-Objekte unter `${id}/`, dann die DB-Zeile. */
export async function deleteImage(id: string): Promise<DeleteImageResult> {
  const session = await auth();

  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }

  const [existing] = await db.select({ uploadedBy: images.uploadedBy }).from(images).where(eq(images.id, id)).limit(1);
  if (!existing) {
    return { success: false, error: "Bild nicht gefunden." };
  }
  if (!canDeleteImage({ actingUserId: session.user.id, actingRole: session.user.role, imageUploadedBy: existing.uploadedBy })) {
    return { success: false, error: "Nur der Eigentümer oder super_admin darf dieses Bild löschen." };
  }

  const keys = await listObjectKeysUnderPrefix(`${id}/`);
  await deleteObjects(keys);
  await db.delete(images).where(eq(images.id, id));

  revalidatePath("/images");
  return { success: true };
}

export interface DeleteImagesResult {
  deletedIds: string[];
  skippedIds: string[];
}

/**
 * Bulk-Variante von deleteImage: prüft pro Bild einzeln canDeleteImage (nicht
 * nur einmal pauschal), damit eine Auswahl mit gemischtem Eigentum nicht
 * versehentlich fremde Bilder mitlöscht — löscht dann S3-Objekte + DB-Zeilen
 * nur für die erlaubten ids. `skippedIds` sind Bilder, die zwar angefragt,
 * aber wegen fehlender Owner-Berechtigung nicht gelöscht wurden (die Client-
 * seitige Checkbox zeigt fremde Bilder zwar gar nicht erst an, diese Prüfung
 * bleibt trotzdem die eigentliche Absicherung, nicht nur eine UI-Konvenienz).
 */
export async function deleteImages(ids: string[]): Promise<DeleteImagesResult> {
  const session = await auth();
  if (!session?.user || ids.length === 0) {
    return { deletedIds: [], skippedIds: ids };
  }

  const candidates = await db.select({ id: images.id, uploadedBy: images.uploadedBy }).from(images).where(inArray(images.id, ids));

  const deletedIds: string[] = [];
  const skippedIds: string[] = [];
  for (const candidate of candidates) {
    if (canDeleteImage({ actingUserId: session.user.id, actingRole: session.user.role, imageUploadedBy: candidate.uploadedBy })) {
      deletedIds.push(candidate.id);
    } else {
      skippedIds.push(candidate.id);
    }
  }
  // ids, die gar keine passende Zeile hatten (z.B. bereits anderweitig gelöscht)
  const foundIds = new Set(candidates.map((candidate) => candidate.id));
  for (const id of ids) {
    if (!foundIds.has(id)) skippedIds.push(id);
  }

  for (const id of deletedIds) {
    const keys = await listObjectKeysUnderPrefix(`${id}/`);
    await deleteObjects(keys);
  }
  if (deletedIds.length > 0) {
    await db.delete(images).where(inArray(images.id, deletedIds));
  }

  revalidatePath("/images");
  return { deletedIds, skippedIds };
}

export interface AddUserTagResult {
  success: boolean;
  error?: string;
  userTags?: UserTagEntry[];
}

/**
 * Fügt einen persönlichen Tag hinzu — jede eingeloggte Session darf das, auf
 * JEDEM Bild (reine Community-Funktion, keine Bild-Eigentümerschaft nötig,
 * siehe canManageUserTag in authorization.ts). addedBy wird immer auf die
 * eigene Session-id gesetzt, nie vom Client übernommen.
 */
export async function addUserTag(imageId: string, tag: string): Promise<AddUserTagResult> {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }

  const trimmed = tag.trim();
  if (!trimmed) {
    return { success: false, error: "Tag darf nicht leer sein." };
  }

  const [existing] = await db.select({ userTags: images.userTags }).from(images).where(eq(images.id, imageId)).limit(1);
  if (!existing) {
    return { success: false, error: "Bild nicht gefunden." };
  }

  const currentTags = existing.userTags ?? [];
  const alreadyExists = currentTags.some(
    (entry) => entry.addedBy === session.user.id && entry.tag.toLowerCase() === trimmed.toLowerCase()
  );
  if (alreadyExists) {
    return { success: false, error: "Diesen Tag hast du bereits hinzugefügt." };
  }

  const nextTags: UserTagEntry[] = [...currentTags, { tag: trimmed, addedBy: session.user.id }];
  await db.update(images).set({ userTags: nextTags, updatedAt: new Date() }).where(eq(images.id, imageId));

  revalidatePath("/images");
  return { success: true, userTags: nextTags };
}

export interface RemoveUserTagResult {
  success: boolean;
  error?: string;
  userTags?: UserTagEntry[];
}

/**
 * Entfernt einen einzelnen user_tag — Berechtigung siehe canManageUserTag
 * (eigener Tag jede Rolle, jeder Tag für den Owner-admin des Bildes,
 * super_admin immer).
 */
export async function removeUserTag(
  imageId: string,
  tag: string,
  addedBy: string | null
): Promise<RemoveUserTagResult> {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }

  const [existing] = await db
    .select({ uploadedBy: images.uploadedBy, userTags: images.userTags })
    .from(images)
    .where(eq(images.id, imageId))
    .limit(1);
  if (!existing) {
    return { success: false, error: "Bild nicht gefunden." };
  }

  if (
    !canManageUserTag({
      actingUserId: session.user.id,
      actingRole: session.user.role,
      tagAddedBy: addedBy,
      imageUploadedBy: existing.uploadedBy,
    })
  ) {
    return { success: false, error: "Diesen Tag darfst du nicht entfernen." };
  }

  const currentTags = existing.userTags ?? [];
  const nextTags = currentTags.filter((entry) => !(entry.tag === tag && entry.addedBy === addedBy));

  await db.update(images).set({ userTags: nextTags, updatedAt: new Date() }).where(eq(images.id, imageId));

  revalidatePath("/images");
  return { success: true, userTags: nextTags };
}

export interface ToggleFavoriteResult {
  success: boolean;
  error?: string;
  isFavorite?: boolean;
}

/**
 * Schaltet den Favoriten-Status FÜR DIE EIGENE Session um — anders als
 * user_tags gibt es hier kein Owner-Konzept (canManageUserTag ist nicht
 * relevant): jede Session verwaltet ausschließlich ihre eigene Zeile in
 * image_favorites, referenziert immer über die eigene session.user.id, nie
 * vom Client übernommen.
 */
export async function toggleFavorite(imageId: string): Promise<ToggleFavoriteResult> {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  const userId = session.user.id;

  const [existing] = await db
    .select({ userId: imageFavorites.userId })
    .from(imageFavorites)
    .where(and(eq(imageFavorites.userId, userId), eq(imageFavorites.imageId, imageId)))
    .limit(1);

  if (existing) {
    await db.delete(imageFavorites).where(and(eq(imageFavorites.userId, userId), eq(imageFavorites.imageId, imageId)));
    revalidatePath("/images");
    return { success: true, isFavorite: false };
  }

  await db.insert(imageFavorites).values({ userId, imageId });
  revalidatePath("/images");
  return { success: true, isFavorite: true };
}
