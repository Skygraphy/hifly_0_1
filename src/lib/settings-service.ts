import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings, appSettings } from "@/db/schema";
import { hasMinRole, type Role } from "@/lib/authorization";
import { PERSONAL_SETTINGS_REGISTRY, GLOBAL_SETTINGS_REGISTRY } from "@/lib/settings-registry";

/**
 * Reservierter app_settings-Key für die Berechtigungs-Overrides der Konto-
 * Einstellungen — bewusst KEIN Eintrag in GLOBAL_SETTINGS_REGISTRY, da er
 * nicht als generische App-Einstellung gerendert werden soll (eigene UI-
 * Sektion, siehe src/app/admin/settings/page.tsx).
 */
export const PERSONAL_SETTING_PERMISSIONS_KEY = "personal_setting_permissions";

/**
 * Effektive Mindest-Rolle je Konto-Einstellung, um sie zu sehen/setzen:
 * Registry-Wert (`minRoleToView`) als Default, per super_admin zur Laufzeit
 * überschreibbar (siehe setPersonalSettingPermission). Kein Auth-Check beim
 * Lesen — wird von getPersonalSettings/setPersonalSetting intern genutzt.
 */
export async function getPersonalSettingPermissions(): Promise<Record<string, Role>> {
  const result: Record<string, Role> = {};
  for (const def of PERSONAL_SETTINGS_REGISTRY) {
    result[def.key] = def.minRoleToView;
  }

  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, PERSONAL_SETTING_PERMISSIONS_KEY));
  if (row && typeof row.value === "object" && row.value !== null) {
    const overrides = row.value as Record<string, unknown>;
    for (const def of PERSONAL_SETTINGS_REGISTRY) {
      const override = overrides[def.key];
      if (override === "user" || override === "admin" || override === "super_admin") {
        result[def.key] = override;
      }
    }
  }

  return result;
}

/**
 * Effektive Konto-Einstellungen eines Users: Registry-Standardwert je Key,
 * den die Rolle laut den effektiven Berechtigungen sehen darf, überschrieben
 * von vorhandenen user_settings-Zeilen. Keys, die die Rolle nicht sehen
 * darf, fehlen im Ergebnis ganz.
 */
export async function getPersonalSettings(
  userId: string,
  role: Role
): Promise<Record<string, unknown>> {
  const permissions = await getPersonalSettingPermissions();
  const result: Record<string, unknown> = {};
  for (const def of PERSONAL_SETTINGS_REGISTRY) {
    if (hasMinRole(role, permissions[def.key])) {
      result[def.key] = def.defaultValue;
    }
  }

  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  for (const row of rows) {
    if (row.key in result) {
      result[row.key] = row.value;
    }
  }

  return result;
}

/**
 * Globale App-Settings — kein Auth-Check nötig, Lesen ist öffentlich (z.B.
 * für einen Wartungsbanner, der auch anonyme Besucher betrifft). Nur das
 * Schreiben ist super_admin-only (siehe src/app/admin/settings/actions.ts).
 */
export async function getGlobalSettings(): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const def of GLOBAL_SETTINGS_REGISTRY) {
    result[def.key] = def.defaultValue;
  }

  const rows = await db.select().from(appSettings);
  for (const row of rows) {
    result[row.key] = row.value;
  }

  return result;
}
