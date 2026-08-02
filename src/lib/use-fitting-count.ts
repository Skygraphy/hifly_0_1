"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * "Zeige so viele Badges wie tatsächlich in eine Zeile passen, der Rest als
 * +N" — statt jedes Badge per CSS (flex-shrink) bis zur Unlesbarkeit zu
 * stauchen (genau das Problem, das dieser Hook ersetzt: kurze Wörter wie
 * "Weiterer" wurden auf ein einzelnes "W" gequetscht, sobald die Zeile eng
 * wurde), wird real gemessen. Der Aufrufer rendert IMMER alle `itemCount`
 * Kandidaten normal (jedes Badge behält seine natürliche/eigene max-w-
 * Truncate-Größe, kein flex-shrink); nach jedem Render prüft dieser Hook per
 * scrollWidth/clientWidth, ob die Zeile überläuft, und reduziert die
 * sichtbare Anzahl schrittweise, bis sie passt — nie unter 1 ("zeige eben
 * nur ein Tag mit Ellipsen", nie 0 bei mindestens einem Kandidaten).
 * ResizeObserver setzt die Zählung bei Größenänderung zurück auf itemCount,
 * damit bei mehr verfügbarem Platz auch wieder mehr angezeigt wird (sonst
 * bliebe ein einmal reduzierter Stand für immer hängen).
 */
export function useFittingCount(itemCount: number): [React.RefObject<HTMLDivElement | null>, number] {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(itemCount);

  // Neu ansetzen, sobald sich die Kandidatenmenge selbst ändert (andere
  // Zeile/Filter) — sonst bliebe ein zuvor reduzierter Stand hängen, obwohl
  // die neuen Inhalte vielleicht wieder vollständig passen.
  useLayoutEffect(() => {
    setVisibleCount(itemCount);
  }, [itemCount]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || visibleCount <= 1) return;
    if (el.scrollWidth > el.clientWidth) {
      setVisibleCount((count) => Math.max(1, count - 1));
    }
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setVisibleCount(itemCount));
    observer.observe(el);
    return () => observer.disconnect();
  }, [itemCount]);

  return [containerRef, itemCount === 0 ? 0 : Math.min(visibleCount, itemCount)];
}
