"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Erkennt, ob ein Element durch `truncate` (text-overflow: ellipsis) gerade
 * tatsächlich abgeschnitten ist (scrollWidth > clientWidth) — dieselbe
 * Messtechnik wie useFittingCount, nur pro Einzelelement statt pro Zeile.
 * useLayoutEffect (statt useEffect) misst VOR dem ersten Paint, damit der
 * Aufrufer im selben Frame zwischen abgeschnittener und vollständiger
 * Darstellung wechseln kann, ohne dass kurz die falsche Variante aufblitzt.
 * ResizeObserver hält den Status bei Größenänderungen (z.B. Spaltenzahl-
 * Wechsel im Grid) aktuell.
 */
export function useIsTruncated<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setIsTruncated(el.scrollWidth > el.clientWidth);
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, isTruncated];
}
