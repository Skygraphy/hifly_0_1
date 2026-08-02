"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import type { ImageLocation } from "@/app/images/actions";
import type { AdministrativeUnit } from "@/lib/administrative-units";
import type { Region } from "@/lib/regions";
import type { StandortRef } from "@/lib/standort";
import { resolveTargetLevel, resolveImageColor, FALLBACK_MARKER_COLOR } from "@/lib/image-map-colors";

// Zentriert auf Österreich — Fallback für den leeren Zustand (keine
// Koordinaten zum Filter) bzw. bevor die erste Karten-Abfrage zurück ist.
const AUSTRIA_CENTER = { lat: 47.5162, lng: 14.5501 };
const AUSTRIA_ZOOM = 7;

const DEFAULT_HEIGHT = 520;
const MIN_HEIGHT = 320;
// Bewusst großzügig statt z.B. 720: Ein enges Limit zwingt bei einer
// hohen/schmalen Punktwolke (N-S entlang der Donau) einen zu breiten
// Container, was den Zoom unnötig herauszoomt, um trotzdem in die Breite zu
// passen ("mehr Leerraum als nötig"). Das hier ist nur ein Sicherheitsnetz
// gegen echte Ausreißer (z.B. eine fast gerade Punktlinie), keine übliche
// Grenze im Alltag.
const MAX_HEIGHT = 1600;
// Rein geografischer Meter-pro-Grad-Wert, konstant genug für diesen Zweck
// (Höhen-/Seitenverhältnis-Näherung, keine exakte Vermessung).
const METERS_PER_LAT_DEGREE = 110_540;
const METERS_PER_LNG_DEGREE_AT_EQUATOR = 111_320;
// Rand in Pixeln, den der berechnete Zoom um die äußersten Punkte frei lässt.
const MARGIN_PX = 36;
const WORLD_DIM_PX = 256;
const MAX_ZOOM = 20;
const SINGLE_POINT_ZOOM = 14;

interface SimpleBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function computeBounds(locations: ImageLocation[]): SimpleBounds | null {
  if (locations.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const loc of locations) {
    if (loc.lat < minLat) minLat = loc.lat;
    if (loc.lat > maxLat) maxLat = loc.lat;
    if (loc.lng < minLng) minLng = loc.lng;
    if (loc.lng > maxLng) maxLng = loc.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

// An das App-Theme angelehnt (siehe globals.css .dark-Block): fast
// schwarzer Hintergrund, gedämpfte Grautöne für Straßen/Flächen, Koralle
// (--primary: #FF7F50) als einziger Akzent auf der Landesgrenze. Roads
// bewusst OHNE eigene Stroke-Farbe: bei einer Landesansicht (Zoom 7) sind
// Straßenlinien nur wenige Sub-Pixel breit — jede stylers-Stroke-Farbe
// (auch mit kleinem weight) füllt dann die komplette sichtbare Linie und
// hätte z.B. bei road.highway JEDE Autobahn koralle eingefärbt statt nur
// einzelne Akzente. Differenzierung stattdessen nur über Fill-Helligkeit;
// die Koralle (--primary) bleibt der Landesgrenze vorbehalten. Ebenfalls
// bewusst OHNE "labels.icon" visibility:off (aus der Referenz übernommen,
// dann wieder entfernt): in diesem Maps-Rendering verschwanden dadurch
// nicht nur die kleinen Orts-Punkt-Icons, sondern auch die zugehörigen
// Stadt-Labels (Wien, München, …) komplett von der Karte.
//
// POI (Restaurants/Geschäfte/Sehenswürdigkeiten) und Transit (Bahnhöfe/
// Linien) komplett ausgeblendet — auf einer Karte, die eigene Bild-Standorte
// zeigt, sind Googles Business-Pins nur Ablenkung, keine "wichtigste
// Information". Park-Flächenfärbung (poi.park geometry) bleibt als reiner
// Hintergrund-Kontext bestehen, nur die Pins/Labels verschwinden.
const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#171717" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7a7a7a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#171717" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#FF7F50" }, { weight: 1.4 }] },
  // Orts-Labels und Straßen-Fills leicht warm zur Koralle hin getönt statt
  // reinem Neutralgrau — dezent genug, um bei Straßen nicht dieselbe
  // "Stroke frisst die ganze Linie"-Falle wie zuvor zu treffen (das betrifft
  // nur geometry.fill, kein Stroke), aber genug, um die Karte spürbar ans
  // App-Farbschema anzubinden statt rein neutral zu wirken.
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#dbbbaf" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1c2418" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2a2a2a" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#141414" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a8a" }] },
  // Gelbe Autobahnknoten-/Ausfahrt-Schilder (z.B. "Knoten Floridsdorf", "16
  // Korneuburg-Ost") sind KEINEM der offiziellen road.*-Subtypen zugeordnet
  // (per Live-Test widerlegt: weder road.highway noch .controlled_access,
  // .arterial oder .local greifen einzeln) — nur die generische "road"-Ebene
  // erfasst sie. Reihenfolge ist hier wichtig: erst alle road-Labels global
  // abschalten, DANACH für die drei echten Subtypen NUR den Text (Straßen-
  // namen) wieder einschalten — labels.icon (Routennummern-Schilder wie
  // "14"/"A22"/"3") bleibt überall aus, auf Wunsch entfernt: zu leicht mit
  // den eigenen farbigen Kreis-Markern zu verwechseln.
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "labels.text", stylers: [{ visibility: "on" }] },
  { featureType: "road.arterial", elementType: "labels.text", stylers: [{ visibility: "on" }] },
  { featureType: "road.local", elementType: "labels.text", stylers: [{ visibility: "on" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#473b36" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#504540" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#dbbbaf" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#6b6b6b" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#101418" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a5a63" }] },
];

// Helleres Pendant fürs Light-Theme, dieselbe Feature-Aufteilung wie
// DARK_MAP_STYLE oben — warmes Off-White statt Google-Standard-Grün/Weiß,
// gleicher Koralle-Akzent (Light-Theme-Primary) nur auf der Landesgrenze.
const LIGHT_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f7f4f1" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7d7671" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f7f4f1" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#ece7e2" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#d9603f" }, { weight: 1.4 }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#674940" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e3ead9" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e5ded8" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8179" }] },
  // Siehe DARK_MAP_STYLE oben für die Begründung: gelbe Knoten-/Ausfahrt-
  // Schilder hängen an keinem der offiziellen road.*-Subtypen, nur an der
  // generischen "road"-Ebene — deshalb erst global aus, dann für die drei
  // echten Subtypen nur der Text (Straßennamen) wieder an (Reihenfolge
  // wichtig). labels.icon (Routennummern-Schilder) bleibt überall aus.
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "labels.text", stylers: [{ visibility: "on" }] },
  { featureType: "road.arterial", elementType: "labels.text", stylers: [{ visibility: "on" }] },
  { featureType: "road.local", elementType: "labels.text", stylers: [{ visibility: "on" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#f9ede7" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f2e0d7" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#674940" }] },
  { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#a39c95" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe0e8" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#7391a0" }] },
];

// Folgt der "dark"-Klasse auf <html>, die per apply-theme.ts (Header-
// Theme-Menü, /settings) gesetzt wird — MutationObserver statt eigenem
// Event-Handling, da das die eine tatsächliche Quelle der Wahrheit ist,
// unabhängig davon, wodurch die Klasse geändert wurde (Nutzerwahl, System-
// Präferenz-Wechsel bei "System").
function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

// Misst die tatsächliche gerenderte Breite des Karten-Wrappers (per
// ResizeObserver, reagiert auf Viewport-/Layout-Änderungen) — Grundlage für
// die Seitenverhältnis-basierte Höhenberechnung unten, da die Breite selbst
// über w-full/das übergeordnete max-w-6xl-Layout kommt, nicht fix vorgegeben ist.
function useContainerWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/**
 * Höhe des Karten-Containers passend zum Seitenverhältnis der Punktwolke bei
 * FIXER Breite — verhindert, dass fitBounds bei einer falsch proportionierten
 * Container-Form viel ungenutzten Leerraum lässt (Letterboxing). Längengrad-
 * Abstände schrumpfen mit dem Kosinus des Breitengrads (in Österreichs
 * Breiten ~0.67-0.68) — ohne diese Korrektur käme ein zu breites/zu wenig
 * hohes Seitenverhältnis heraus. Bei 0-1 Punkten oder unbekannter Breite:
 * fixe Standardhöhe (kein sinnvolles Seitenverhältnis berechenbar).
 */
function computeMapHeight(bounds: SimpleBounds | null, locationCount: number, containerWidth: number): number {
  if (!bounds || locationCount < 2 || containerWidth <= 0) return DEFAULT_HEIGHT;

  const avgLatRad = ((bounds.minLat + bounds.maxLat) / 2) * (Math.PI / 180);
  const lngSpanMeters = Math.max(
    (bounds.maxLng - bounds.minLng) * METERS_PER_LNG_DEGREE_AT_EQUATOR * Math.cos(avgLatRad),
    1
  );
  const latSpanMeters = Math.max((bounds.maxLat - bounds.minLat) * METERS_PER_LAT_DEGREE, 1);
  const aspectRatio = lngSpanMeters / latSpanMeters;

  const height = containerWidth / aspectRatio;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(height)));
}

/**
 * latitude → Mercator-Y-Fraktion (dieselbe Projektion, die Google Maps
 * intern für Tile-Koordinaten verwendet) — Grundlage für die Zoom-Berechnung,
 * da geografische Breite NICHT linear auf Pixel abgebildet wird.
 */
function mercatorLatFraction(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  const radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
  return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
}

// Bewusst OHNE Math.floor: Google Maps unterstützt seit isFractionalZoomEnabled
// (siehe <Map>-Prop unten) echte Kommazahlen als Zoom, nicht nur ganze
// Stufen. Ein Integer-Zoom hätte kleine MARGIN_PX-Anpassungen oft komplett
// wirkungslos gemacht, da zwei benachbarte Zoom-Stufen den Maßstab jeweils
// verdoppeln — der reale Bedarf liegt meist irgendwo dazwischen.
function zoomForPixelFraction(pixelDim: number, fraction: number): number {
  if (fraction <= 0) return MAX_ZOOM;
  return Math.log2(pixelDim / WORLD_DIM_PX / fraction);
}

/**
 * Berechnet den Zoom, der eine geografische Bounding Box exakt (samt
 * MARGIN_PX Rand) in einen Container gegebener Pixelgröße einpasst — bewusst
 * SELBST berechnet statt map.fitBounds() zu nutzen: fitBounds ermittelt den
 * Zoom anhand der Container-Größe zum Aufrufzeitpunkt, aber unsere
 * Container-Höhe ändert sich erst kurz VORHER per React-State/CSS (siehe
 * computeMapHeight) — je nachdem, ob der Browser das Resize bereits an die
 * Karte weitergereicht hat, rechnete fitBounds noch mit der alten Höhe und
 * ließ sichtbar zu viel Leerraum um die Punkte. Mit expliziter Zielgröße als
 * Parameter ist das Ergebnis unabhängig vom tatsächlichen DOM-Resize-Timing.
 */
function computeZoomForBounds(bounds: SimpleBounds, containerWidthPx: number, containerHeightPx: number): number {
  const effectiveWidth = Math.max(containerWidthPx - MARGIN_PX * 2, 40);
  const effectiveHeight = Math.max(containerHeightPx - MARGIN_PX * 2, 40);

  const latFraction = (mercatorLatFraction(bounds.maxLat) - mercatorLatFraction(bounds.minLat)) / Math.PI;
  const lngDiff = bounds.maxLng - bounds.minLng;
  const lngFraction = (lngDiff < 0 ? lngDiff + 360 : lngDiff) / 360;

  const latZoom = zoomForPixelFraction(effectiveHeight, latFraction);
  const lngZoom = zoomForPixelFraction(effectiveWidth, lngFraction);

  return Math.max(0, Math.min(latZoom, lngZoom, MAX_ZOOM));
}

/**
 * Marker + automatisches Bounds-Fitting, gebündelt in einer Komponente, weil
 * beides erst sinnvoll ist, sobald useMap() eine echte Instanz liefert (vor
 * dem Laden des Maps-Scripts ist "google" als globaler Namespace schlicht
 * noch nicht vorhanden — der frühe "if (!map) return null" davor verhindert,
 * dass google.maps.SymbolPath weiter unten referenziert wird, bevor das
 * Script geladen ist). Muss als Kind von <Map> gerendert werden, da useMap()
 * sonst keine Instanz findet.
 *
 * Kreis-Marker bewusst über den klassischen Marker mit einem
 * SymbolPath.CIRCLE-Icon statt AdvancedMarker: AdvancedMarker verlangt eine
 * gültige mapId (sonst "initialized without a valid Map ID"-Fehler, keine
 * Marker sichtbar) — eine mapId schaltet aber auf Vector-Rendering um, das
 * unser eigenes styles-Array (Dark/Light-Theme) ignoriert und stattdessen
 * eine in der Google Cloud Console konfigurierte Kartenvorlage verlangt, die
 * wir nicht haben. Der klassische Marker braucht keine mapId und bleibt mit
 * dem Raster-styles-Array kompatibel.
 */
type ColoredImageLocation = ImageLocation & { color: string | null };

// Klassischer Marker unterstützt (anders als AdvancedMarker, siehe Kommentar
// oben) nativ eine kurze Bounce-Animation über die animation-Option — kein
// CSS/DOM nötig, funktioniert also auch mit dem Canvas/Raster-Marker. Läuft
// nur kurz an (HIGHLIGHT_BOUNCE_MS), damit sie nicht endlos weiterhüpft,
// während der vergrößerte/umrandete "fancy" Stil danach stehen bleibt, bis
// ein anderes Bild markiert wird.
const HIGHLIGHT_STROKE_COLOR = "#FF7F50";
const HIGHLIGHT_BOUNCE_MS = 1400;

function MapMarkersAndBounds({
  locations,
  bounds,
  containerWidth,
  containerHeight,
  highlightedId,
}: {
  locations: ColoredImageLocation[];
  bounds: SimpleBounds | null;
  containerWidth: number;
  containerHeight: number;
  highlightedId?: string | null;
}) {
  const map = useMap();
  const [bouncingId, setBouncingId] = useState<string | null>(null);

  useEffect(() => {
    if (!map) return;

    if (!bounds || locations.length === 0) {
      map.setCenter(AUSTRIA_CENTER);
      map.setZoom(AUSTRIA_ZOOM);
      return;
    }

    if (locations.length === 1) {
      map.setCenter({ lat: locations[0].lat, lng: locations[0].lng });
      map.setZoom(SINGLE_POINT_ZOOM);
      return;
    }

    map.setCenter({ lat: (bounds.minLat + bounds.maxLat) / 2, lng: (bounds.minLng + bounds.maxLng) / 2 });
    map.setZoom(computeZoomForBounds(bounds, containerWidth, containerHeight));
  }, [map, locations, bounds, containerWidth, containerHeight]);

  useEffect(() => {
    if (!highlightedId) return;
    setBouncingId(highlightedId);
    const timeout = setTimeout(() => setBouncingId(null), HIGHLIGHT_BOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [highlightedId]);

  if (!map) return null;

  return (
    <>
      {locations.map((loc) => {
        const isHighlighted = loc.id === highlightedId;
        return (
          <Marker
            key={loc.id}
            position={{ lat: loc.lat, lng: loc.lng }}
            zIndex={isHighlighted ? 1000 : undefined}
            animation={loc.id === bouncingId ? google.maps.Animation.BOUNCE : undefined}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: isHighlighted ? 9 : 5,
              fillColor: loc.color ?? FALLBACK_MARKER_COLOR,
              fillOpacity: isHighlighted ? 1 : 0.3,
              strokeWeight: isHighlighted ? 3 : 0,
              strokeColor: HIGHLIGHT_STROKE_COLOR,
            }}
          />
        );
      })}
    </>
  );
}

export function ImagesMapView({
  locations,
  units,
  regions,
  standort,
  highlightedId,
}: {
  locations: ImageLocation[];
  units: AdministrativeUnit[];
  regions: Region[];
  standort: StandortRef | null;
  /** Marker, der beim Klick auf den Standort-Punkt einer Kachel/Preview
   * hierher navigiert hat (siehe image-map-dot.tsx) — bekommt kurz eine
   * Bounce-Animation und bleibt danach vergrößert/umrandet stehen. */
  highlightedId?: string | null;
}) {
  const isDark = useIsDarkTheme();
  const [wrapperRef, containerWidth] = useContainerWidth();
  const bounds = useMemo(() => computeBounds(locations), [locations]);
  const height = useMemo(
    () => computeMapHeight(bounds, locations.length, containerWidth),
    [bounds, locations.length, containerWidth]
  );

  // Farbe hängt von der aktuell im Standort-Filter gewählten Ebene ab, nicht
  // (mehr) fix an jedem Bild dran — siehe resolveTargetLevel/resolveImageColor
  // in src/lib/image-map-colors.ts für die genaue Kaskaden-Regel.
  const coloredLocations = useMemo<ColoredImageLocation[]>(() => {
    const targetLevel = resolveTargetLevel(standort, units, regions);
    // globalThis.Map statt Map: der Name "Map" ist in dieser Datei bereits
    // die importierte Google-Maps-Komponente, würde den globalen Map-
    // Konstruktor sonst verdecken.
    const unitsById = new globalThis.Map(units.map((unit) => [unit.id, unit]));
    const regionsById = new globalThis.Map(regions.map((region) => [region.id, region]));
    return locations.map((location) => ({
      ...location,
      color: resolveImageColor(location, targetLevel, unitsById, regionsById),
    }));
  }, [locations, standort, units, regions]);

  return (
    // Bewusst ohne border UND ohne rounded-lg/overflow-hidden: das Grid hat
    // scharfe Ecken und reicht randlos bis zum Container-Rand. Abgerundete
    // Ecken an der Karte lassen sie optisch an allen vier Ecken "eingerückt"
    // wirken, obwohl die geraden Kanten pixelgenau dieselbe Breite haben —
    // genau das wurde beim Umschalten als "Karte wirkt schmäler" gemeldet.
    // Höhe bewusst dynamisch (style statt Tailwind-Klasse): passt sich pro
    // Filter dem Seitenverhältnis der Punktwolke an, siehe computeMapHeight.
    <div ref={wrapperRef} className="w-full" style={{ height }} data-testid="images-map-view">
      {/* Dimmt ausschließlich den verbleibenden Vollbild-Button — Googles
          eigene Steuerelemente lassen sich nicht über MapOptions einfärben,
          nur die feste .gm-fullscreen-control-Klasse ist dafür stabil genug
          (langjährig unverändert), um gezielt per CSS angefasst zu werden. */}
      <style>{`[data-testid="images-map-view"] .gm-fullscreen-control { filter: brightness(0.85); }`}</style>
      <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!}>
        {/* Bewusst OHNE colorScheme-Prop: die steuert nur Googles eigene
            UI-Controls (Zoom/Map-Satellite-Pille), nicht die Kartenfarben
            selbst — die kommen ausschließlich aus dem styles-Array unten.
            disableDefaultUI blendet ALLE Standard-Controls aus (Zoom,
            Map/Satellite-Pille, Street-View-Pegman, Kompass) — nur
            fullscreenControl wird gezielt wieder eingeschaltet. */}
        <Map
          defaultCenter={AUSTRIA_CENTER}
          defaultZoom={AUSTRIA_ZOOM}
          gestureHandling="greedy"
          disableDefaultUI
          fullscreenControl
          isFractionalZoomEnabled
          styles={isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
        >
          <MapMarkersAndBounds
            locations={coloredLocations}
            bounds={bounds}
            containerWidth={containerWidth}
            containerHeight={height}
            highlightedId={highlightedId}
          />
        </Map>
      </APIProvider>
    </div>
  );
}
