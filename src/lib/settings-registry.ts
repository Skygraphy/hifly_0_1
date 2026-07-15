import type { Role } from "@/lib/authorization";

export type SettingType = "boolean" | "string" | "number";

export interface PersonalSettingDefinition {
  key: string;
  label: string;
  description: string;
  type: SettingType;
  defaultValue: boolean | string | number;
  /** Wer darf diese Einstellung für sich selbst sehen/setzen. */
  minRoleToView: Role;
  /** Auch für nicht eingeloggte Besucher anzeigen (lokal gespeichert). */
  guestAvailable: boolean;
  /** Feste Werteliste (z.B. Theme) — wird als Select statt freiem Input gerendert. */
  options?: { value: string; label: string }[];
  /**
   * Von der generischen /settings-Liste ausschließen — für Einstellungen,
   * die schon voll les-/schreibbar sind, aber noch kein passendes UI haben
   * (z.B. eine Fremdschlüssel-artige id, für die ein rohes Text-Input keine
   * sinnvolle Zwischenlösung wäre). Betrifft nur das Rendering, nicht
   * getPersonalSettings/setPersonalSetting.
   */
  hidden?: boolean;
}

export interface GlobalSettingDefinition {
  key: string;
  label: string;
  description: string;
  type: SettingType;
  defaultValue: boolean | string | number;
}

/**
 * Nur Theme ist hier vollständig funktional verdrahtet (die Hell/Dunkel-CSS
 * existiert bereits in globals.css). Sprache/Schriftgröße/Filter würden
 * jeweils eigene, größere Vorhaben (i18n, CSS-Skalierung, eine konkrete
 * Filter-UI) brauchen und sind bewusst nicht Teil dieser Registry — der
 * Mechanismus trägt sie identisch, sobald sie gebraucht werden.
 */
export const PERSONAL_SETTINGS_REGISTRY: PersonalSettingDefinition[] = [
  {
    key: "theme",
    label: "Farbschema",
    description: "Hell, dunkel oder System-Standard.",
    type: "string",
    defaultValue: "dark",
    minRoleToView: "user",
    guestAvailable: true,
    options: [
      { value: "system", label: "System" },
      { value: "light", label: "Hell" },
      { value: "dark", label: "Dunkel" },
    ],
  },
  // Platzhalter-Beispiel für eine rollen-gegatete, NICHT gast-fähige
  // Einstellung — kein Produkt-Commitment, beweist nur den Mechanismus.
  {
    key: "show_debug_info",
    label: "Debug-Infos anzeigen",
    description: "Zeigt zusätzliche technische Details in der Oberfläche.",
    type: "boolean",
    defaultValue: false,
    minRoleToView: "admin",
    guestAvailable: false,
  },
  // Speichert den aktuell gewählten Standort — entweder eine
  // administrative_units-Zeile ODER eine region (siehe src/lib/standort.ts:
  // StandortRef, { type: "unit" | "region", id }, aufgelöst über
  // parseStandortValue). Ältere, vor Einführung von Regionen gespeicherte
  // Werte sind noch ein blanker administrative_units-id-String —
  // parseStandortValue interpretiert das rückwärtskompatibel als
  // { type: "unit", id }. type: "string" hier ist daher nur nominal (siehe
  // unten) und betrifft nicht getPersonalSettings/setPersonalSetting.
  // Bewusst hidden: true — die Auswahl hat ein eigenes Widget auf "/"
  // (AdministrativeLevelWidget), ein rohes Text-Input in der generischen
  // /settings-Liste wäre keine sinnvolle Zwischenlösung. "Standort" statt
  // "Verwaltungsebene" im Label — Letzteres ist nur die interne
  // Domain-Bezeichnung für die administrative_units-Hälfte.
  {
    key: "default_administrative_unit",
    label: "Standard-Standort",
    description: "Wird beim nächsten Besuch als Filter vorausgewählt.",
    type: "string",
    defaultValue: "",
    minRoleToView: "user",
    guestAvailable: true,
    hidden: true,
  },
];

/**
 * Platzhalter-Beispiel für eine super_admin-only App-Einstellung — kein
 * Produkt-Commitment, beweist nur den Mechanismus.
 */
export const GLOBAL_SETTINGS_REGISTRY: GlobalSettingDefinition[] = [
  {
    key: "maintenance_mode",
    label: "Wartungsmodus",
    description: "Zeigt einen sitezweiten Wartungshinweis.",
    type: "boolean",
    defaultValue: false,
  },
];

export function findPersonalSettingDefinition(key: string): PersonalSettingDefinition | undefined {
  return PERSONAL_SETTINGS_REGISTRY.find((def) => def.key === key);
}

export function findGlobalSettingDefinition(key: string): GlobalSettingDefinition | undefined {
  return GLOBAL_SETTINGS_REGISTRY.find((def) => def.key === key);
}
