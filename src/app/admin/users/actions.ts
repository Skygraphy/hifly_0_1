"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { canChangeRole, canBlockUser, canDeleteUser, type Role } from "@/lib/authorization";

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
