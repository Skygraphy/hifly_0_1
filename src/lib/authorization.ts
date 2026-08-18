import type { StandortRef } from "@/lib/standort";

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

/**
 * Darf Bilder in den S3-Bucket hochladen (Upload-Seite überhaupt öffnen).
 * admin UND super_admin — welche konkreten Standorte/Regionen dabei
 * zugewiesen werden dürfen, ist eine separate, datenabhängige Prüfung,
 * siehe canAssignImageLocation.
 */
export function canUploadImages(role: Role | undefined | null): boolean {
  return role === "admin" || role === "super_admin";
}

/**
 * Darf festlegen, welche Standorte/Regionen ein bestimmter admin beim
 * Bild-Upload zuweisen darf (admin_location_grants pflegen). Aktuell
 * dieselbe Schwelle wie canManageUsers, aber bewusst eine eigene Funktion —
 * andere Ressource, die zufällig denselben Wert hat.
 */
export function canManageLocationGrants(role: Role | undefined | null): boolean {
  return role === "super_admin";
}

/**
 * Darf den Shop (Pakete, Kategorien, Preise, Standort-/Bild-Zuordnung)
 * verwalten. Aktuell dieselbe Schwelle wie canManageUsers/
 * canManageLocationGrants, aber bewusst eine eigene Funktion — andere
 * Ressource, die zufällig denselben Wert hat.
 */
export function canManageShop(role: Role | undefined | null): boolean {
  return role === "super_admin";
}

/**
 * Darf Bestellungen einsehen/verwalten (Lieferadressen, Drucke als
 * "verschickt" markieren, siehe /admin/orders). Aktuell dieselbe Schwelle
 * wie canManageShop, aber bewusst eine eigene Funktion — Katalog verwalten
 * und Bestellungen abwickeln sind unterschiedliche Verantwortungen, die
 * zufällig demselben Rollen-Level zugeteilt sind.
 */
export function canManageOrders(role: Role | undefined | null): boolean {
  return role === "super_admin";
}

export interface CanAssignImageLocationInput {
  actingRole: Role;
  standort: StandortRef;
  grantedUnitIds: ReadonlySet<string>;
  grantedRegionIds: ReadonlySet<string>;
}

export interface CanAssignImageLocationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Einzige Quelle der Wahrheit für "darf dieser admin BEIM UPLOAD genau
 * diesen einen Standort/diese Region einem Bild zuweisen" — im Gegensatz zu
 * den obigen Rollen-Prädikaten datenabhängig (welche Freigaben existieren),
 * daher als input/Result-Funktion wie canChangeRole/canBlockUser. super_admin
 * ist immer erlaubt, unabhängig von admin_location_grants (siehe
 * getAssignableLocations in src/app/admin/images/actions.ts, das für
 * super_admin den kompletten Baum als "freigegeben" zurückgibt statt hier
 * separat zu verzweigen).
 */
export function canAssignImageLocation(input: CanAssignImageLocationInput): CanAssignImageLocationResult {
  const { actingRole, standort, grantedUnitIds, grantedRegionIds } = input;

  if (actingRole !== "admin" && actingRole !== "super_admin") {
    return { allowed: false, reason: "Nur admin oder super_admin dürfen Bilder hochladen." };
  }
  if (actingRole === "super_admin") {
    return { allowed: true };
  }
  const granted = standort.type === "unit" ? grantedUnitIds.has(standort.id) : grantedRegionIds.has(standort.id);
  if (!granted) {
    return { allowed: false, reason: "Dieser Standort wurde für diesen admin nicht freigegeben." };
  }
  return { allowed: true };
}

/**
 * Darf admin/super_admin-only auch NICHT öffentlich sichtbare Bilder
 * (web_visible = false/null) in der Suche auf /images sehen — reine
 * Sichtbarkeits-Gate, unabhängig davon, wer das Bild hochgeladen hat. Jeder
 * admin soll weiterhin ALLE (auch fremde) unveröffentlichte Bilder finden
 * können, um sie zu verwalten — nur Bearbeiten/Löschen ist auf den Owner
 * eingeschränkt (siehe canEditImage/canDeleteImage unten).
 */
export function canSeeHiddenImages(role: Role | undefined | null): boolean {
  return role === "admin" || role === "super_admin";
}

export interface CanManageImageInput {
  actingUserId: string | null | undefined;
  actingRole: Role | null | undefined;
  imageUploadedBy: string;
}

/**
 * Darf Bild-Metadaten (main_location, tags, Sichtbarkeit, Ranking, ...) auf
 * der öffentlichen /images-Seite ändern. Weist NIE administrativeUnitId/
 * regionId neu zu (das bleibt dem "Abgleich"-Flow vorbehalten, siehe
 * src/app/admin/images/actions.ts). Owner-only: ein admin darf nur Bilder
 * bearbeiten, die er selbst hochgeladen hat (uploadedBy) — super_admin darf
 * immer, unabhängig vom Owner.
 */
export function canEditImage(input: CanManageImageInput): boolean {
  if (input.actingRole === "super_admin") return true;
  if (input.actingRole === "admin") return input.actingUserId === input.imageUploadedBy;
  return false;
}

/**
 * Darf ein Bild (DB-Zeile + zugehörige S3-Objekte) endgültig löschen.
 * Aktuell dieselbe Owner-Schwelle wie canEditImage, aber bewusst eine eigene
 * Funktion — Löschen ist unwiderruflich, im Gegensatz zum reversiblen
 * Bearbeiten, und soll unabhängig davon weiterentwickelbar bleiben.
 */
export function canDeleteImage(input: CanManageImageInput): boolean {
  if (input.actingRole === "super_admin") return true;
  if (input.actingRole === "admin") return input.actingUserId === input.imageUploadedBy;
  return false;
}

export interface CanManageUserTagInput {
  actingUserId: string | null | undefined;
  actingRole: Role | null | undefined;
  /** null bei Alt-Tags aus der Migration von text[] auf jsonb — der echte
   * Ersteller ist dort nicht bekannt (siehe UserTagEntry in schema.ts). */
  tagAddedBy: string | null;
  imageUploadedBy: string;
}

/**
 * Darf einen einzelnen user_tag ändern/löschen. Drei Fälle, in dieser
 * Reihenfolge: super_admin immer; JEDE Rolle darf ihren EIGENEN Tag verwalten
 * (reine Community-Funktion, unabhängig von der Bild-Eigentümerschaft); ein
 * admin darf zusätzlich JEDEN Tag (auch fremde, auch null/Alt-Tags) auf einem
 * Bild verwalten, das er selbst hochgeladen hat. Neue Tags anlegen braucht
 * keine eigene Prüfung — dort wird addedBy immer auf die eigene id gesetzt,
 * was durch den zweiten Fall hier automatisch erlaubt ist.
 */
export function canManageUserTag(input: CanManageUserTagInput): boolean {
  if (input.actingRole === "super_admin") return true;
  if (input.actingUserId && input.actingUserId === input.tagAddedBy) return true;
  if (input.actingRole === "admin" && input.actingUserId === input.imageUploadedBy) return true;
  return false;
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
