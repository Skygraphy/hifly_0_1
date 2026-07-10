// Geteilte Logik zwischen DisplaySettingsMenu (immer sichtbar im Header)
// und der generischen Settings-Seite (/settings) — beide Stellen können
// "theme" ändern und müssen dieselbe DOM-Klasse + Cookie-Aktualisierung
// auslösen, sonst zeigt nur eine der beiden Stellen den Effekt sofort an.
export type ThemePreference = "light" | "dark" | "system";

export function resolveIsDark(preference: string): boolean {
  if (preference === "light") return false;
  if (preference === "system") {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return true;
}

export const THEME_CHANGE_EVENT = "hifly-theme-change";

export function applyThemePreference(value: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolveIsDark(value));
  // Cookie speichert die Präferenz selbst (auch "system"), nicht den
  // aufgelösten Wert — siehe src/app/layout.tsx für die SSR-/FOUC-Logik.
  document.cookie = `theme=${value}; path=/; max-age=${60 * 60 * 24 * 365}`;
  // Andere gemountete Theme-Controls auf derselben Seite (Header-Dropdown +
  // /settings-Select sind unabhängige Komponenten ohne gemeinsamen State)
  // synchron nachziehen, statt dass sie erst beim nächsten Laden auffallen.
  window.dispatchEvent(new CustomEvent<string>(THEME_CHANGE_EVENT, { detail: value }));
}
