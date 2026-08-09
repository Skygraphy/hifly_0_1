"use client";

import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Farbiger Punkt unten rechts auf Kachel (image-thumbnail-card.tsx) und
 * Vollbild-Popup (image-preview-popup.tsx) — zeigt dieselbe Farbe wie der
 * Karten-Marker des Bildes (siehe resolveImageColor in image-map-colors.ts),
 * aber voll deckend (opacity 1) statt der 30%-Deckkraft der Marker selbst,
 * damit er auf der Kachel klar erkennbar bleibt. Klickfläche (size-5) bewusst
 * größer als der sichtbare Kreis (size-2.5) — auf einer kleinen Kachel ist
 * der exakte Punkt selbst ein zu kleines Ziel. Klick navigiert zur
 * Kartenansicht und markiert dort den zugehörigen Marker (siehe
 * highlightedId in images-map-view.tsx) — stoppt daher die Propagation, statt
 * zusätzlich den Kachel-Klick (öffnet das Preview) oder Klicks im Popup
 * auszulösen.
 */
export function ImageMapDot({
  color,
  onClick,
  className,
  bordered = true,
}: {
  color: string;
  onClick: () => void;
  className?: string;
  /** Preview-Popup hat einen einheitlich dunklen Rahmen um das Bild — der
   * dezente weiße Rand hebt den Punkt dort vom Bildinhalt ab. Auf der Kachel
   * (viele unterschiedliche Bildfarben direkt in der Ecke) wirkte derselbe
   * Rand dagegen unruhig, dort auf Wunsch ohne. */
  bordered?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label="Standort auf der Karte anzeigen"
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "group z-20 flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      {/* Animation sitzt auf dem INNEREN, kleinen Punkt (nicht auf dem
          äußeren size-5-Klickbereich) — siehe Begründung bei
          --animate-soft-pulse in globals.css: das Wachsen bleibt so
          komplett innerhalb des ohnehin großzügigeren Klickbereichs, statt
          an der Kachel-Kante abgeschnitten zu werden. */}
      <span
        className={cn("size-2.5 rounded-full group-hover:animate-soft-pulse", bordered && "border border-white/40")}
        style={{ backgroundColor: color }}
      />
    </button>
  );
}
