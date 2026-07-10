import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings, appSettings } from "@/db/schema";
import { hasMinRole, type Role } from "@/lib/authorization";
import { PERSONAL_SETTINGS_REGISTRY, GLOBAL_SETTINGS_REGISTRY } from "@/lib/settings-registry";

/**
 * Effektive Konto-Einstellungen eines Users: Registry-Standardwert je Key,
 * den die Rolle sehen darf, überschrieben von vorhandenen user_settings-
 * Zeilen. Keys, die die Rolle nicht sehen darf, fehlen im Ergebnis ganz.
 */
export async function getPersonalSettings(
  userId: string,
  role: Role
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const def of PERSONAL_SETTINGS_REGISTRY) {
    if (hasMinRole(role, def.minRoleToView)) {
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
