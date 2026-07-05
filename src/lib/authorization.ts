export type Role = "user" | "admin" | "super_admin";

export function canAccessAdminArea(role: Role | undefined | null): boolean {
  return role === "admin" || role === "super_admin";
}

export function canManageUsers(role: Role | undefined | null): boolean {
  return role === "super_admin";
}

export interface CanChangeRoleInput {
  actingUserId: string;
  actingRole: Role;
  targetUserId: string;
  targetCurrentRole: Role;
  desiredRole: Role;
}

export interface CanChangeRoleResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Einzige Quelle der Wahrheit für "darf X die Rolle von Y ändern" — von der
 * Middleware (grobe Seiten-Gate) UND der Server Action (feingranulare,
 * unabhängige Prüfung) genutzt, damit beide Ebenen nie auseinanderlaufen.
 *
 * `desiredRole` ist bewusst als `Role` (nicht `"user" | "admin"`) typisiert:
 * der Wert kommt in der Server Action aus einem FormData-String, wo TS'
 * engere Typisierung zur Laufzeit nicht greift — der "super_admin"-Check
 * unten ist daher die tatsächliche Absicherung, nicht nur der Typ.
 */
export function canChangeRole(input: CanChangeRoleInput): CanChangeRoleResult {
  const { actingRole, actingUserId, targetUserId, targetCurrentRole, desiredRole } = input;

  if (actingRole !== "super_admin") {
    return { allowed: false, reason: "Nur der super_admin darf Rollen ändern." };
  }
  if (actingUserId === targetUserId) {
    return { allowed: false, reason: "Der super_admin kann sich nicht selbst ändern." };
  }
  if (targetCurrentRole === "super_admin") {
    return { allowed: false, reason: "Der super_admin kann nicht über diese Aktion geändert werden." };
  }
  if (desiredRole === "super_admin") {
    return { allowed: false, reason: "Die Rolle super_admin kann über diese Aktion nicht vergeben werden." };
  }

  return { allowed: true };
}
