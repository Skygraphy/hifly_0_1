"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { canManageAppSettings } from "@/lib/authorization";
import { findGlobalSettingDefinition } from "@/lib/settings-registry";

export interface SettingsActionResult {
  success: boolean;
  error?: string;
}

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
