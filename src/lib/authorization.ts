export type Role = "user" | "admin" | "super_admin";

const ROLE_RANK: Record<Role, number> = { user: 0, admin: 1, super_admin: 2 };

/**
 * Generischer Rollen-Rang-Vergleich — im Gegensatz zu den spezifischen
 * Prädikaten unten (canAccessAdminArea etc.), die für feste Use-Cases
 * gelten, wird das hier für Berechtigungen gebraucht, die selbst pro
 * Einstellung/Ressource einen Mindest-Rang definieren (siehe
 * src/lib/settings-registry.ts).
 */
export function hasMinRole(role: Role | undefined | null, minRole: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/**
 * Nur der super_admin darf die globalen App-Settings ändern (wirken
 * sitezweit, auch für anonyme Besucher) — bewusst eigene Funktion statt
 * hasMinRole(role, "super_admin") direkt an den Call-Sites, damit die
 * Schwelle an einer Stelle steht.
 */
export function canManageAppSettings(role: Role | undefined | null): boolean {
  return role === "super_admin";
}

export function canAccessAdminArea(role: Role | undefined | null): boolean {
  return role === "admin" || role === "super_admin";
}

export function canManageUsers(role: Role | undefined | null): boolean {
  return role === "super_admin";
}

/**
 * Darf die Verwaltungsgliederung (administrative_units) anlegen/ändern/
 * löschen. Aktuell dieselbe Schwelle wie canManageUsers, aber bewusst eine
 * eigene Funktion — andere Ressource, die zufällig denselben Wert hat.
 */
export function canManageAdministrativeUnits(role: Role | undefined | null): boolean {
  return role === "super_admin";
}

/**
 * Darf Regionen (regions + deren Verknüpfung zu administrative_units)
 * anlegen/ändern/löschen. Aktuell dieselbe Schwelle wie
 * canManageAdministrativeUnits, aber bewusst eine eigene Funktion — andere
 * Ressource, die zufällig denselben Wert hat.
 */
export function canManageRegions(role: Role | undefined | null): boolean {
  return role === "super_admin";
}

/**
 * Darf interne Ops-Tools auslösen (z.B. den Flow-Walkthrough-Screenshot-
 * Generator). Aktuell dieselbe Schwelle wie canManageUsers, aber bewusst
 * eine eigene Funktion — "Ops-Tools ausführen" und "User verwalten" sind
 * unterschiedliche Berechtigungen, die zufällig denselben Wert haben.
 */
export function canRunOpsTools(role: Role | undefined | null): boolean {
  return role === "super_admin";
}

/**
 * super_admin darf sich ausschließlich per Passwort anmelden, nie per OAuth.
 * Grund: allowDangerousEmailAccountLinking (in auth.ts) verknüpft OAuth-
 * Logins automatisch mit bestehenden Usern gleicher E-Mail — für den
 * mächtigsten Account im System ist das ein zu großes Risiko.
 */
export function isOAuthSignInAllowed(existingRole: Role | undefined | null): boolean {
  return existingRole !== "super_admin";
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

export interface CanBlockUserInput {
  actingUserId: string;
  actingRole: Role;
  targetUserId: string;
  targetCurrentRole: Role;
}

export interface CanBlockUserResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Einzige Quelle der Wahrheit für "darf X den Account von Y (ent-)blockieren"
 * — von der Server Action genutzt, gleiche Guards wie bei canChangeRole:
 * nur super_admin, nie sich selbst, nie den super_admin.
 */
export function canBlockUser(input: CanBlockUserInput): CanBlockUserResult {
  const { actingRole, actingUserId, targetUserId, targetCurrentRole } = input;

  if (actingRole !== "super_admin") {
    return { allowed: false, reason: "Nur der super_admin darf User blockieren." };
  }
  if (actingUserId === targetUserId) {
    return { allowed: false, reason: "Der super_admin kann sich nicht selbst blockieren." };
  }
  if (targetCurrentRole === "super_admin") {
    return { allowed: false, reason: "Der super_admin kann nicht blockiert werden." };
  }

  return { allowed: true };
}

export interface CanDeleteUserInput {
  actingUserId: string;
  actingRole: Role;
  targetUserId: string;
  targetCurrentRole: Role;
}

export interface CanDeleteUserResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Einzige Quelle der Wahrheit für "darf X den Account von Y löschen" —
 * gleiche Guards wie bei canBlockUser (nur super_admin, nie sich selbst,
 * nie den super_admin), da Löschen unwiderruflich ist (im Gegensatz zum
 * reversiblen Blockieren).
 */
export function canDeleteUser(input: CanDeleteUserInput): CanDeleteUserResult {
  const { actingRole, actingUserId, targetUserId, targetCurrentRole } = input;

  if (actingRole !== "super_admin") {
    return { allowed: false, reason: "Nur der super_admin darf User löschen." };
  }
  if (actingUserId === targetUserId) {
    return { allowed: false, reason: "Der super_admin kann sich nicht selbst löschen." };
  }
  if (targetCurrentRole === "super_admin") {
    return { allowed: false, reason: "Der super_admin kann nicht gelöscht werden." };
  }

  return { allowed: true };
}
