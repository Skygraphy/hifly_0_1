"use client";

import { useEffect, useLayoutEffect, useState } from "react";

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
 *
 * Callback-Ref (State) statt `useRef`: ein reiner `useRef` benachrichtigt
 * React NICHT, wenn das referenzierte DOM-Element attacht — bei wenigen
 * Kandidaten (Kachel: 2–4) läuft der Mess-Effekt trotzdem noch oft genug
 * (durch andere Renders im selben Commit) erneut, dass es zufällig
 * funktioniert; bei vielen Kandidaten (per Messung bestätigt: 28 User-Tags)
 * blieb `containerRef.current` bei JEDEM Effekt-Durchlauf `null` — die Zeile
 * maß nie einen Überlauf und zeigte dadurch ausnahmslos ALLE Kandidaten an,
 * die dann sichtbar aus dem Panel herausliefen. Mit dem Element in State
 * (via Callback-Ref gesetzt) löst React beim tatsächlichen Attach-Zeitpunkt
 * zuverlässig einen Re-Render aus, der Mess-Effekt bekommt garantiert ein
 * echtes Element zu sehen.
 *
 * `resetKey` (optional): weiterer Auslöser für denselben Reset-auf-itemCount,
 * zusätzlich zu einer Änderung von `itemCount` selbst. Nötig, wenn sich die
 * verfügbare Breite ändert, OHNE dass sich `itemCount` ändert UND ohne dass
 * sich die Container-Box selbst resized (der ResizeObserver oben beobachtet
 * nur die Größe des Containers, nicht die seines Inhalts) — z.B. bei den
 * User-Tags, deren Zeile ein Eingabefeld enthält, das beim Bearbeiten breiter
 * wird als der kleine "+"-Button. Reduziert `itemCount` (gedeckelt auf
 * MAX_VISIBLE_TAGS) bereits vorher, ändert sich `itemCount` bei weiteren
 * Tags nie mehr — ohne diesen zusätzlichen Trigger bliebe ein während des
 * Bearbeitens reduzierter Stand für immer hängen, auch nachdem das
 * Eingabefeld wieder zum schmalen Button eingeklappt ist und eigentlich
 * wieder mehr Platz da wäre.
 */
export function useFittingCount(
  itemCount: number,
  resetKey?: unknown
): [(node: HTMLDivElement | null) => void, number] {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(itemCount);

  // Neu ansetzen, sobald sich die Kandidatenmenge selbst ändert (andere
  // Zeile/Filter) oder `resetKey` wechselt — sonst bliebe ein zuvor
  // reduzierter Stand hängen, obwohl die neuen Inhalte vielleicht wieder
  // vollständig passen.
  useLayoutEffect(() => {
    // Gewollter Reset auf itemCount bei Wechsel von Kandidatenmenge/
    // resetKey, siehe Kommentar oben.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleCount(itemCount);
  }, [itemCount, resetKey]);

  // Bewusst OHNE Dependency-Array: dieser Effekt muss nach JEDEM Render neu
  // prüfen (auch nach den eigenen setState-Aufrufen), um die Anzahl
  // schrittweise bis zur tatsächlich passenden Größe zu reduzieren — ein
  // deklariertes Array würde genau diese Konvergenz-Schleife verhindern.
  useLayoutEffect(() => {
    if (!container || visibleCount <= 1) return;
    if (container.scrollWidth > container.clientWidth) {
      // Gewollte, konvergierende Mess-Schleife — siehe Kommentar oben.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleCount((count) => Math.max(1, count - 1));
    }
  });

  useEffect(() => {
    if (!container) return;
    const observer = new ResizeObserver(() => setVisibleCount(itemCount));
    observer.observe(container);
    return () => observer.disconnect();
  }, [container, itemCount]);

  return [setContainer, itemCount === 0 ? 0 : Math.min(visibleCount, itemCount)];
}
