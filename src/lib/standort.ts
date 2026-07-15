export type StandortRef = { type: "unit"; id: string } | { type: "region"; id: string };

/**
 * Akzeptiert die neue Objekt-Form direkt UND — rückwärtskompatibel — einen
 * blanken Nicht-Leer-String, wie er vor der Einführung von Regionen sowohl
 * in user_settings.value als auch im hifly_guest_settings-localStorage-Blob
 * gespeichert wurde (immer eine administrative_units-id). Ein solcher
 * String wird als { type: "unit", id: rawString } interpretiert. Bewusst
 * KEIN destruktives Migrations-Skript: das Lesen ist so immer korrekt,
 * unabhängig davon, wann/ob ein Browser/DB-Zustand aktualisiert wurde.
 */
export function parseStandortValue(raw: unknown): StandortRef | null {
  if (raw && typeof raw === "object" && "type" in raw && "id" in raw) {
    const { type, id } = raw as { type: unknown; id: unknown };
    if ((type === "unit" || type === "region") && typeof id === "string" && id) {
      return { type, id };
    }
    return null;
  }
  if (typeof raw === "string" && raw) {
    return { type: "unit", id: raw };
  }
  return null;
}
