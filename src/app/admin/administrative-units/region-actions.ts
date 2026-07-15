"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { regions, regionAdministrativeUnits } from "@/db/schema";
import { canManageRegions } from "@/lib/authorization";
import type { AdministrativeLevel } from "@/lib/administrative-units";

export interface RegionActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

const POSTGRES_UNIQUE_VIOLATION = "23505";
const DUPLICATE_NAME_ERROR = "Dieser Name existiert bereits.";

export interface RegionInput {
  name: string;
  description: string | null;
  color: string | null;
}

export interface RegionHome {
  parentId: string | null;
  level: AdministrativeLevel;
}

export async function createRegion(
  input: RegionInput,
  home: RegionHome,
  initialUnitIds?: string[]
): Promise<RegionActionResult> {
  const session = await auth();

  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageRegions(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf Regionen verwalten." };
  }
  if (!input.name.trim()) {
    return { success: false, error: "Name ist ein Pflichtfeld." };
  }
  // Auf Bund-Ebene gibt es nur eine einzige Einheit (Österreich selbst) —
  // eine Region dort anzulegen wäre bedeutungslos (nichts, wovon sie sich
  // abgrenzen könnte). Serverseitig erzwungen, nicht nur über das
  // ausgeblendete UI-Menüitem.
  if (home.level === "federal") {
    return { success: false, error: "Auf Bund-Ebene können keine Regionen angelegt werden." };
  }
  // Eine Region ohne jede Verknüpfung darf es per Definition nicht geben —
  // serverseitig erzwungen, nicht nur über den deaktivierten
  // Speichern-Button im Client.
  if (!initialUnitIds || initialUnitIds.length === 0) {
    return { success: false, error: "Eine Region braucht mindestens eine Verknüpfung." };
  }

  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(regions)
        .values({
          name: input.name.trim(),
          description: input.description?.trim() || null,
          color: input.color?.trim() || null,
          parentId: home.parentId,
          homeLevel: home.level,
        })
        .returning({ id: regions.id });

      if (initialUnitIds && initialUnitIds.length > 0) {
        await tx
          .insert(regionAdministrativeUnits)
          .values(initialUnitIds.map((administrativeUnitId) => ({ regionId: row.id, administrativeUnitId })));
      }

      return row.id;
    });

    revalidatePath("/admin/administrative-units");
    return { success: true, id };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_NAME_ERROR };
    }
    throw err;
  }
}

export async function updateRegion(id: string, input: RegionInput): Promise<RegionActionResult> {
  const session = await auth();

  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageRegions(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf Regionen verwalten." };
  }
  if (!input.name.trim()) {
    return { success: false, error: "Name ist ein Pflichtfeld." };
  }

  try {
    await db
      .update(regions)
      .set({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(regions.id, id));

    revalidatePath("/admin/administrative-units");
    return { success: true, id };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === POSTGRES_UNIQUE_VIOLATION) {
      return { success: false, error: DUPLICATE_NAME_ERROR };
    }
    throw err;
  }
}

export async function deleteRegion(id: string): Promise<RegionActionResult> {
  const session = await auth();

  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageRegions(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf Regionen verwalten." };
  }

  // region_administrative_units hat ON DELETE CASCADE auf region_id.
  await db.delete(regions).where(eq(regions.id, id));

  revalidatePath("/admin/administrative-units");
  return { success: true };
}

/**
 * Verknüpft/entknüpft eine Region ausschließlich mit Einheiten aus
 * `candidateUnitIds` (typischerweise genau eine Spalte bzw. ein Segment) —
 * Verknüpfungen zu Einheiten außerhalb dieser Menge (andere Äste) bleiben
 * unangetastet. Ersetzt das alte, global über ALLE Einheiten "vollständig
 * ersetzen"-Muster (setRegionUnits), das nachträgliches Verknüpfen über
 * mehrere Äste hinweg umständlich machte.
 */
export async function setRegionUnitsWithinScope(
  regionId: string,
  candidateUnitIds: string[],
  checkedUnitIds: string[]
): Promise<RegionActionResult> {
  const session = await auth();

  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageRegions(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf Regionen verwalten." };
  }

  const toUnlink = candidateUnitIds.filter((id) => !checkedUnitIds.includes(id));

  // Eine Region ohne jede Verknüpfung darf es per Definition nicht geben —
  // serverseitig erzwungen (nicht nur über den deaktivierten
  // Speichern-Button im Client), auch für Verknüpfungen außerhalb dieser
  // Spalte (candidateUnitIds), die von diesem Aufruf gar nicht berührt werden.
  const existingLinks = await db
    .select({ administrativeUnitId: regionAdministrativeUnits.administrativeUnitId })
    .from(regionAdministrativeUnits)
    .where(eq(regionAdministrativeUnits.regionId, regionId));
  const remaining = new Set(existingLinks.map((link) => link.administrativeUnitId));
  for (const id of toUnlink) remaining.delete(id);
  for (const id of checkedUnitIds) remaining.add(id);
  if (remaining.size === 0) {
    return { success: false, error: "Eine Region braucht mindestens eine Verknüpfung." };
  }

  await db.transaction(async (tx) => {
    if (toUnlink.length > 0) {
      await tx
        .delete(regionAdministrativeUnits)
        .where(
          and(
            eq(regionAdministrativeUnits.regionId, regionId),
            inArray(regionAdministrativeUnits.administrativeUnitId, toUnlink)
          )
        );
    }
    if (checkedUnitIds.length > 0) {
      await tx
        .insert(regionAdministrativeUnits)
        .values(checkedUnitIds.map((administrativeUnitId) => ({ regionId, administrativeUnitId })))
        .onConflictDoNothing();
    }
  });

  revalidatePath("/admin/administrative-units");
  return { success: true, id: regionId };
}
