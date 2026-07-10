"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { hasMinRole } from "@/lib/authorization";
import { findPersonalSettingDefinition, PERSONAL_SETTINGS_REGISTRY } from "@/lib/settings-registry";

export interface SettingsActionResult {
  success: boolean;
  error?: string;
}

export async function setPersonalSetting(key: string, value: unknown): Promise<SettingsActionResult> {
  const session = await auth();

  // Unabhängig von der Seiten-Gate erneut geprüft — nie auf die
  // Middleware/Page-Prüfung allein verlassen.
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }

  const def = findPersonalSettingDefinition(key);
  if (!def) {
    return { success: false, error: "Unbekannte Einstellung." };
  }
  if (!hasMinRole(session.user.role, def.minRoleToView)) {
    return { success: false, error: "Für deine Rolle nicht verfügbar." };
  }

  await db
    .insert(userSettings)
    .values({ userId: session.user.id, key, value })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.key],
      set: { value, updatedAt: new Date() },
    });

  // Theme wirkt sich auf das serverseitig gerenderte <html>-Element aus
  // (siehe src/app/layout.tsx) — das Cookie ist reine Render-Optimierung
  // gegen Flackern, nicht die Quelle der Wahrheit.
  if (key === "theme" && typeof value === "string") {
    const cookieStore = await cookies();
    cookieStore.set("theme", value, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  }

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Wird einmalig nach dem ersten Login clientseitig aufgerufen (siehe
 * DisplaySettingsMenu), solange noch lokale Gast-Werte existieren. Rein
 * additiv/idempotent: füllt nur Keys, für die noch KEINE Konto-Einstellung
 * existiert — überschreibt nie einen bereits vorhandenen Konto-Wert.
 */
export async function syncGuestSettingsOnLogin(
  values: Record<string, unknown>
): Promise<SettingsActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Nicht angemeldet." };
  }

  for (const def of PERSONAL_SETTINGS_REGISTRY) {
    if (!def.guestAvailable) continue;
    if (!(def.key in values)) continue;
    if (!hasMinRole(session.user.role, def.minRoleToView)) continue;

    const [existing] = await db
      .select()
      .from(userSettings)
      .where(and(eq(userSettings.userId, session.user.id), eq(userSettings.key, def.key)))
      .limit(1);
    if (existing) continue;

    await db.insert(userSettings).values({
      userId: session.user.id,
      key: def.key,
      value: values[def.key],
    });
  }

  revalidatePath("/settings");
  return { success: true };
}
