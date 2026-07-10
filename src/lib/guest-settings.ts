export const GUEST_SETTINGS_STORAGE_KEY = "hifly_guest_settings";
const STORAGE_KEY = GUEST_SETTINGS_STORAGE_KEY;

/**
 * Rein clientseitig (localStorage) — für nicht eingeloggte Besucher, die
 * gast-fähige Einstellungen (siehe PERSONAL_SETTINGS_REGISTRY,
 * guestAvailable: true) ändern. Reine Funktionen, damit sie sich wie die
 * Prädikate in authorization.ts isoliert testen lassen.
 */
export function getGuestSettings(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function setGuestSetting(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  const current = getGuestSettings();
  const next = { ...current, [key]: value };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
