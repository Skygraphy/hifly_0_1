"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { canManageAppSettings, type Role } from "@/lib/authorization";
import { findGlobalSettingDefinition, findPersonalSettingDefinition } from "@/lib/settings-registry";
import { getPersonalSettingPermissions, PERSONAL_SETTING_PERMISSIONS_KEY } from "@/lib/settings-service";

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
  if (!findGlobalSettingDefinition(key)) {
    return { success: false, error: "Unbekannte Einstellung." };
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
