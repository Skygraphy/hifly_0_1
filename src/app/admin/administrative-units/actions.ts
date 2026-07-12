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
const DUPLICATE_CODE_ERROR = "Dieser Code existiert bereits unter diesem Elternknoten.";

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
