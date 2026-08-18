/**
 * Reine, DOM-/cookies()-freie Logik für die anonyme Registrierungs-Sperre
 * auf /images (siehe images/actions.ts:recordAnonymousImageView,
 * images/page.tsx) — leicht mit Vitest testbar, die eigentliche
 * cookies()-I/O bleibt bei den Aufrufern (Server Component/Server Action).
 * Grenze/Zeitfenster kommen aus GLOBAL_SETTINGS_REGISTRY
 * (anon_image_view_limit/anon_image_view_window_minutes).
 */

export const ANON_VIEW_COOKIE_NAME = "hifly_anon_views";

export interface AnonViewState {
  /** Anzahl gezählter Vollbild-Preview-Öffnungen im AKTUELLEN Fenster. */
  count: number;
  /** Epoch-ms des ERSTEN gezählten Aufrufs im aktuellen Fenster. */
  windowStart: number;
}

export function readAnonViewState(cookieValue: string | undefined): AnonViewState | null {
  if (!cookieValue) return null;
  try {
    const parsed: unknown = JSON.parse(cookieValue);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as AnonViewState).count === "number" &&
      typeof (parsed as AnonViewState).windowStart === "number" &&
      Number.isFinite((parsed as AnonViewState).count) &&
      Number.isFinite((parsed as AnonViewState).windowStart)
    ) {
      return parsed as AnonViewState;
    }
  } catch {
    // Kaputtes/manipuliertes Cookie — wie "noch nie etwas angeschaut" behandeln.
  }
  return null;
}

function isWindowExpired(state: AnonViewState, windowMinutes: number, now: number): boolean {
  return now - state.windowStart > windowMinutes * 60_000;
}

/**
 * Ob der ausgehend von state aktuell gesperrt werden sollte — genutzt beim
 * Seitenaufruf (images/page.tsx), BEVOR ein weiterer Blick gezählt wird.
 * Ein abgelaufenes Fenster gilt nie als gesperrt (das Zurücksetzen selbst
 * passiert erst beim nächsten nextAnonViewState-Aufruf, nicht hier — diese
 * Funktion liest nur).
 */
export function isOverLimit(
  state: AnonViewState | null,
  limit: number,
  windowMinutes: number,
  now: number
): boolean {
  if (!state) return false;
  if (isWindowExpired(state, windowMinutes, now)) return false;
  return state.count >= limit;
}

/**
 * Nächster Zustand nach einem weiteren gezählten Bild — startet ein neues
 * Fenster (count 1), wenn noch keins existiert oder das alte abgelaufen ist,
 * sonst wird nur hochgezählt (windowStart bleibt gleich, das Fenster ist ein
 * fester Zeitraum ab dem ERSTEN Bild, kein bei jedem Bild neu verschobenes
 * "letzte X Minuten"-Fenster).
 */
export function nextAnonViewState(state: AnonViewState | null, windowMinutes: number, now: number): AnonViewState {
  if (!state || isWindowExpired(state, windowMinutes, now)) {
    return { count: 1, windowStart: now };
  }
  return { count: state.count + 1, windowStart: state.windowStart };
}
