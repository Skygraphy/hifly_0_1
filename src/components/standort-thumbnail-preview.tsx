"use client";

import { useCallback, useEffect, useState } from "react";
import { getRandomImages, type RandomImageThumb } from "@/app/images/actions";

export interface StandortThumbnailFilter {
  administrativeUnitIds?: string[];
  regionId?: string;
}

// Dieselbe Zellgröße wie die /images-Kachel: dort minmax(240px, 1fr) bei
// aspect-[4/3] (siehe image-grid.tsx), hier als fester Wert statt eines
// wachsenden Grids, da die Vorschau immer höchstens 5 Bilder in einer Reihe
// zeigt statt einer vollen Spaltenanzahl.
const TILE_WIDTH = 240;
const TILE_HEIGHT = 180;

/**
 * Eine einzelne Kachel — kennt (wie image-thumbnail-card.tsx) die
 * Bildmaße, um Hochformat zu erkennen: Querformat füllt die feste
 * TILE_WIDTH×TILE_HEIGHT-Fläche auf bg-card, Hochformat bekommt STATT der
 * umgebenden Box nur eine feste Höhe mit automatischer Breite — keine
 * bg-card-Fläche, die sonst links/rechts als leerer Platzhalter neben dem
 * schmaleren Bild stehen bliebe.
 */
function ThumbnailTile({ thumb }: { thumb: RandomImageThumb }) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const isPortrait = dimensions !== null && dimensions.width < dimensions.height;

  const checkOrientation = useCallback((img: HTMLImageElement) => {
    const { naturalWidth, naturalHeight } = img;
    if (naturalWidth > 0 && naturalHeight > 0) setDimensions({ width: naturalWidth, height: naturalHeight });
  }, []);

  // Aus dem Browser-Cache bediente Bilder sind schon "complete", bevor React
  // den onLoad-Handler anhängt — derselbe Callback-Ref-Trick wie in
  // image-thumbnail-card.tsx.
  const imgRef = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete) checkOrientation(img);
    },
    [checkOrientation]
  );

  if (isPortrait) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- fertige,
      // feste Thumbnail-Größe aus S3, next/image bringt hier keine
      // Optimierung (dieselbe Begründung wie image-thumbnail-card.tsx).
      <img
        ref={imgRef}
        src={thumb.thumbUrl}
        alt={thumb.mainLocation ?? ""}
        loading="lazy"
        onLoad={(event) => checkOrientation(event.currentTarget)}
        className="rounded-md border border-white/10"
        style={{ height: TILE_HEIGHT }}
        data-testid={`standort-thumbnail-${thumb.id}`}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-md bg-card"
      style={{ width: TILE_WIDTH, height: TILE_HEIGHT }}
      data-testid={`standort-thumbnail-${thumb.id}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- s.o. */}
      <img
        ref={imgRef}
        src={thumb.thumbUrl}
        alt={thumb.mainLocation ?? ""}
        loading="lazy"
        onLoad={(event) => checkOrientation(event.currentTarget)}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}

/**
 * Rein dekorative Vorschau auf der Startseite, zwischen dem gewählten
 * Standort-Namen und der Breadcrumb-Navigation (siehe
 * administrative-level-widget.tsx) — bis zu 5 zufällige Bilder desselben
 * Standorts, in derselben Größe wie die Kacheln auf /images (siehe
 * image-thumbnail-card.tsx), aber bewusst OHNE jede Interaktion: kein
 * Klick-Preview, kein Hover-Reveal, keine Bearbeiten/Löschen/Tag-Funktionen,
 * kein Adress-Badge — nur die Bilder selbst.
 *
 * `filter` kommt vom Aufrufer bereits per useMemo referenzstabil (ändert
 * sich nur, wenn sich der zugrunde liegende Standort tatsächlich ändert) —
 * sonst würde jeder Render einen neuen Abruf auslösen.
 */
export function StandortThumbnailPreview({ filter }: { filter: StandortThumbnailFilter | null }) {
  const [thumbs, setThumbs] = useState<RandomImageThumb[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Promise.resolve([]) statt eines synchronen setThumbs([]) im
    // filter===null-Fall: setState direkt (statt in einem Callback) im
    // Effekt-Body verletzt react-hooks/set-state-in-effect (unnötige
    // Extra-Renderpasse) — der einheitliche Promise-Pfad räumt stattdessen
    // im selben .then()-Callback auf wie der eigentliche Abruf.
    const request = filter ? getRandomImages(filter) : Promise.resolve([]);
    request.then((result) => {
      if (!cancelled) setThumbs(result);
    });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  if (thumbs.length === 0) return null;

  return (
    <div
      className="mt-4 flex flex-wrap items-center justify-center gap-3"
      data-testid="standort-thumbnail-preview"
    >
      {thumbs.map((thumb) => (
        <ThumbnailTile key={thumb.id} thumb={thumb} />
      ))}
    </div>
  );
}
