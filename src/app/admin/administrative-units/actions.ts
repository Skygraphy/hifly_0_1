"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { administrativeUnits } from "@/db/schema";
import { canManageAdministrativeUnits } from "@/lib/authorization";
import type { AdministrativeLevel } from "@/lib/administrative-units";

export interface AdministrativeUnitActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

const POSTGRES_UNIQUE_VIOLATION = "23505";
const POSTGRES_CHECK_VIOLATION = "23514";
const DUPLICATE_CODE_ERROR = "Dieser Code existiert bereits unter diesem Elternknoten.";
const FEDERAL_UNPUBLISHED_ERROR = "Die Bund-Ebene kann nicht als Entwurf gespeichert werden.";

export interface AdministrativeUnitInput {
  code: string;
  name: string;
  shortName: string | null;
  color: string | null;
}

export async function createAdministrativeUnit(
  parentId: string | null,
  level: AdministrativeLevel,
  input: AdministrativeUnitInput
): Promise<AdministrativeUnitActionResult> {
  const session = await auth();

  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageAdministrativeUnits(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf die Verwaltungsgliederung ändern." };
  }
  if (!input.code.trim() || !input.name.trim()) {
    return { success: false, error: "Code und Name sind Pflichtfelder." };
  }

  try {
    const [row] = await db
      .insert(administrativeUnits)
      .values({
        parentId,
        level,
        code: input.code.trim(),
        name: input.name.trim(),
        shortName: input.shortName?.trim() || null,
        color: input.color?.trim() || null,
        // Entwurf ist der Default bei Neuanlage — Freigabe passiert danach
        // über die Checkbox auf der Zeile (setAdministrativeUnitPublished).
        // Bund-Ebene ist von der Freigabe-Pflicht ausgenommen — serverseitig
        // erzwungen (siehe auch die CHECK-Constraint in schema.ts als
        // letzte Absicherung).
        published: level === "federal",
      })
      .returning({ id: administrativeUnits.id });

    revalidatePath("/admin/administrative-units");
    return { success: true, id: row.id };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_CODE_ERROR };
    }
    throw err;
  }
}

export async function updateAdministrativeUnit(
  id: string,
  input: AdministrativeUnitInput
): Promise<AdministrativeUnitActionResult> {
  const session = await auth();

  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageAdministrativeUnits(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf die Verwaltungsgliederung ändern." };
  }
  if (!input.code.trim() || !input.name.trim()) {
    return { success: false, error: "Code und Name sind Pflichtfelder." };
  }

  try {
    await db
      .update(administrativeUnits)
      .set({
        code: input.code.trim(),
        name: input.name.trim(),
        shortName: input.shortName?.trim() || null,
        color: input.color?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(administrativeUnits.id, id));

    revalidatePath("/admin/administrative-units");
    return { success: true, id };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_CODE_ERROR };
    }
    throw err;
  }
}

/**
 * Direktes Umschalten der Freigabe über die Checkbox neben der Einheit in
 * Spalten-/Breadcrumb-Ansicht — eigene, schlanke Action statt über
 * updateAdministrativeUnit, damit ein Klick auf die Checkbox nicht den
 * gesamten Bearbeiten-Dialog voraussetzt. Kein level-Lookup nötig (blindes
 * Update per id) — die CHECK-Constraint in schema.ts verhindert, dass die
 * Bund-Ebene als Entwurf landet; im Normalbetrieb ohnehin unerreichbar, da
 * die Checkbox auf Bund-Ebene gar nicht erst gerendert wird.
 */
export async function setAdministrativeUnitPublished(
  id: string,
  published: boolean
): Promise<AdministrativeUnitActionResult> {
  const session = await auth();

  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageAdministrativeUnits(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf die Verwaltungsgliederung ändern." };
  }

  try {
    await db
      .update(administrativeUnits)
      .set({ published, updatedAt: new Date() })
      .where(eq(administrativeUnits.id, id));
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === POSTGRES_CHECK_VIOLATION) {
      return { success: false, error: FEDERAL_UNPUBLISHED_ERROR };
    }
    throw err;
  }

  revalidatePath("/admin/administrative-units");
  return { success: true, id };
}

export async function deleteAdministrativeUnit(id: string): Promise<AdministrativeUnitActionResult> {
  const session = await auth();

  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageAdministrativeUnits(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf die Verwaltungsgliederung ändern." };
  }

  // parent_id hat ON DELETE CASCADE — löscht automatisch alle Unterknoten mit.
  await db.delete(administrativeUnits).where(eq(administrativeUnits.id, id));

  revalidatePath("/admin/administrative-units");
  return { success: true };
}
