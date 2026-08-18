"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { canManageAppSettings, type Role } from "@/lib/authorization";
import { findGlobalSettingDefinition, findPersonalSettingDefinition } from "@/lib/settings-registry";
import {
  getGlobalSettings,
  getPersonalSettingPermissions,
  PERSONAL_SETTING_PERMISSIONS_KEY,
} from "@/lib/settings-service";

export interface SettingsActionResult {
  success: boolean;
  error?: string;
}

const VALID_ROLES: Role[] = ["user", "admin", "super_admin"];

export async function setGlobalSetting(key: string, value: unknown): Promise<SettingsActionResult> {
  const session = await auth();

  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageAppSettings(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf App-Einstellungen ändern." };
  }
  const definition = findGlobalSettingDefinition(key);
  if (!definition) {
    return { success: false, error: "Unbekannte Einstellung." };
  }
  if (definition.type === "number" && (typeof value !== "number" || !Number.isInteger(value) || value <= 0)) {
    return { success: false, error: "Bitte eine ganze positive Zahl eingeben." };
  }

  // Marker-Warn-/Sperrgrenze für die Kartenansicht (siehe
  // images-page-client.tsx) — die Obergrenze muss über der Warnschwelle
  // liegen, sonst wäre die Warnung nie erreichbar (der Wechsel wäre schon
  // gesperrt, bevor gewarnt werden könnte). Server-seitig statt nur im
  // GlobalSettingRow geprüft: die beiden Felder sind unabhängige,
  // nicht miteinander verdrahtete Client-Komponenten, hier liegt die
  // eigentliche Autorität (dieselbe "nie nur der UI vertrauen"-Haltung wie
  // bei den Rollen-/Login-Checks oben).
  if (key === "map_marker_warning_threshold" || key === "map_marker_hard_limit") {
    const current = await getGlobalSettings();
    const warningThreshold = key === "map_marker_warning_threshold" ? (value as number) : Number(current.map_marker_warning_threshold);
    const hardLimit = key === "map_marker_hard_limit" ? (value as number) : Number(current.map_marker_hard_limit);
    if (hardLimit <= warningThreshold) {
      return { success: false, error: "Die Obergrenze muss höher sein als die Warnschwelle." };
    }
  }

  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });

  // Wirkt sitezweit (z.B. Wartungsbanner) — auch außerhalb von /admin/settings.
  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
  return { success: true };
}

/**
 * Legt fest, welche Rolle mindestens nötig ist, um eine Konto-Einstellung zu
 * sehen/setzen — überschreibt den Registry-Default (`minRoleToView`) zur
 * Laufzeit (siehe getPersonalSettingPermissions). Alle Overrides liegen in
 * einer einzigen app_settings-Zeile (JSON-Objekt), analog zu setGlobalSetting
 * aber mit merge statt Ersetzen, da mehrere Keys denselben Eintrag teilen.
 */
export async function setPersonalSettingPermission(
  key: string,
  minRole: Role
): Promise<SettingsActionResult> {
  const session = await auth();

  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }
  if (!canManageAppSettings(session.user.role)) {
    return { success: false, error: "Nur der super_admin darf Berechtigungen ändern." };
  }
  if (!findPersonalSettingDefinition(key)) {
    return { success: false, error: "Unbekannte Einstellung." };
  }
  if (!VALID_ROLES.includes(minRole)) {
    return { success: false, error: "Unbekannte Rolle." };
  }

  const permissions = await getPersonalSettingPermissions();
  const value = { ...permissions, [key]: minRole };

  await db
    .insert(appSettings)
    .values({ key: PERSONAL_SETTING_PERMISSIONS_KEY, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });

  revalidatePath("/admin/settings");
  revalidatePath("/settings");
  return { success: true };
}
