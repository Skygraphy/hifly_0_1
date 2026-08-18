"use client";

import { useSyncExternalStore } from "react";

// Modul-weiter Zustand statt Zustand/Context: das Projekt hat noch keine
// Notification-Bibliothek (Zustand steht zwar im Tech-Stack, ist aber nicht
// installiert) — für "eine einzelne Nachricht global anzeigen" reicht
// useSyncExternalStore (React-Bordmittel für externen, außerhalb der
// Baumhierarchie liegenden Zustand), ohne neue Abhängigkeit oder
// Context-Provider-Verdrahtung durch die ganze App.
let message: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Ersetzt window.alert() — zeigt ein zum App-Look passendes Popup
 * (AppAlertDialog, einmalig in layout.tsx gemountet) statt des nativen
 * Browser-Standarddialogs. Von überall aufrufbar (Event-Handler,
 * Server-Action-Callbacks), ohne dass der Aufrufer selbst einen Hook oder
 * Dialog-State verwalten muss.
 */
export function showAppAlert(next: string) {
  message = next;
  emit();
}

export function clearAppAlert() {
  message = null;
  emit();
}

export function useAppAlertMessage(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => message,
    () => null
  );
}
