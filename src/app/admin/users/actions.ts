"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users, adminLocationGrants } from "@/db/schema";
import { canChangeRole, canBlockUser, canDeleteUser, canManageLocationGrants, type Role } from "@/lib/authorization";
import type { StandortRef } from "@/lib/standort";

export interface SetUserRoleResult {
  success: boolean;
  error?: string;
}

export async function setUserAdminRole(
  targetUserId: string,
  desiredRole: Role
): Promise<SetUserRoleResult> {
  const session = await auth();

  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }

  const [target] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target) {
    return { success: false, error: "User nicht gefunden." };
  }

  const check = canChangeRole({
    actingUserId: session.user.id,
    actingRole: session.user.role,
    targetUserId,
    targetCurrentRole: target.role,
    desiredRole,
  });

  if (!check.allowed) {
    return { success: false, error: check.reason };
  }

  await db
    .update(users)
    .set({ role: desiredRole, updatedAt: new Date() })
    .where(eq(users.id, targetUserId));

  revalidatePath("/admin/users");
  return { success: true };
}

export async function setUserBlockedStatus(
  targetUserId: string,
  blocked: boolean
): Promise<SetUserRoleResult> {
  const session = await auth();

  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }

  const [target] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target) {
    return { success: false, error: "User nicht gefunden." };
  }

  const check = canBlockUser({
    actingUserId: session.user.id,
    actingRole: session.user.role,
    targetUserId,
    targetCurrentRole: target.role,
  });

  if (!check.allowed) {
    return { success: false, error: check.reason };
  }

  await db
    .update(users)
    .set({ isBlocked: blocked, updatedAt: new Date() })
    .where(eq(users.id, targetUserId));

  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteUser(targetUserId: string): Promise<SetUserRoleResult> {
  const session = await auth();

  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }

  const [target] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  if (!target) {
    return { success: false, error: "User nicht gefunden." };
  }

  const check = canDeleteUser({
    actingUserId: session.user.id,
    actingRole: session.user.role,
    targetUserId,
    targetCurrentRole: target.role,
  });

  if (!check.allowed) {
    return { success: false, error: check.reason };
  }

  // accounts/sessions/user_settings referenzieren users.id mit
  // onDelete: "cascade" (siehe src/db/schema.ts) — räumen sich automatisch mit auf.
  await db.delete(users).where(eq(users.id, targetUserId));

  revalidatePath("/admin/users");
  return { success: true };
}

export interface GrantLocationResult {
  success: boolean;
  error?: string;
}

/**
 * Gibt einem admin GENAU eine Verwaltungseinheit/Region fürs Bild-Upload
 * frei (siehe admin_location_grants in src/db/schema.ts) — bewusst kein
 * Kaskadieren auf Unterebenen. onConflictDoNothing greift über die
 * partiellen Unique-Indizes der Tabelle, ein erneutes Freigeben derselben
 * Kombination ist damit ein no-op statt eines Fehlers.
 */
export async function grantAdminLocation(
  adminUserId: string,
  standort: StandortRef
): Promise<GrantLocationResult> {
  const session = await auth();

  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageLocationGrants(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf Standort-Freigaben verwalten." };
  }

  await db
    .insert(adminLocationGrants)
    .values({
      adminUserId,
      administrativeUnitId: standort.type === "unit" ? standort.id : null,
      regionId: standort.type === "region" ? standort.id : null,
      grantedBy: session.user.id,
    })
    .onConflictDoNothing();

  revalidatePath("/admin/users");
  return { success: true };
}

export async function revokeAdminLocation(
  adminUserId: string,
  standort: StandortRef
): Promise<GrantLocationResult> {
  const session = await auth();

  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageLocationGrants(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf Standort-Freigaben verwalten." };
  }

  await db
    .delete(adminLocationGrants)
    .where(
      and(
        eq(adminLocationGrants.adminUserId, adminUserId),
        standort.type === "unit"
          ? eq(adminLocationGrants.administrativeUnitId, standort.id)
          : eq(adminLocationGrants.regionId, standort.id)
      )
    );

  revalidatePath("/admin/users");
  return { success: true };
}
