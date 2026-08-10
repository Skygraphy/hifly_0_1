"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, InfoWindow, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { Heart, Loader2, MapPin, Signpost, Tag as TagIcon, Tags as UserTagsIcon, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getImageById, type ImageLocation, type ImageSearchRow } from "@/app/images/actions";
import type { AdministrativeUnit } from "@/lib/administrative-units";
import type { Region } from "@/lib/regions";
import type { StandortRef } from "@/lib/standort";
import { BUTTON_GLASS_CLASS, TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS } from "@/lib/badge-glass-style";
import { resolveTargetLevel, resolveImageColor, FALLBACK_MARKER_COLOR } from "@/lib/image-map-colors";
import { thumbUrlFor } from "@/lib/image-folder";
import { useFittingCount } from "@/lib/use-fitting-count";
import { cn } from "@/lib/utils";

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
// (--primary: #FF6F61) als einziger Akzent auf der Landesgrenze. Roads
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
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#FF6F61" }, { weight: 1.4 }] },
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
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#db504b" }, { weight: 1.4 }] },
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

// Rein statischer Stil für den markierten Punkt, nur mit nativen
// Symbol-Icon-Eigenschaften (kein Bounce, kein Pulsieren/rAF-Loop — auf
// Wunsch des Users verworfen): größerer Kreis (scale), eine etwas
// gedunkelte Füllfarbe (siehe darkenHex) statt der vollen Standort-Farbe,
// und ein markanter Rand in derselben (gedunkelten) Farbe wie die Füllung,
// statt einer festen Akzentfarbe. Rand bleibt beim nativen strokeOpacity-
// Default (voll deckend, 1) — die Füllung bekommt bewusst eine SPÜRBAR
// niedrigere Opazität, damit sich Fläche und Rand klar voneinander
// abheben, statt optisch zu verschmelzen.
const HIGHLIGHT_STROKE_WEIGHT = 4;
const HIGHLIGHT_FILL_OPACITY = 0.55;
const HIGHLIGHT_FILL_DARKEN_AMOUNT = 0.25;
// Bewusst niedrig (statt voll deckend wie der Punkt auf der Kachel, siehe
// image-map-dot.tsx): bei dicht liegenden Bildern addiert sich die
// Transparenz überlappender Marker zu helleren Flecken und zeigt so die
// Bild-Dichte einer Gegend an — ein voll deckender Marker würde diesen
// Effekt verlieren (vom User bestätigt, siehe Kommentar in image-map-dot.tsx).
const MARKER_FILL_OPACITY = 0.3;
// Google Maps koppelt den klickbaren Bereich eines Markers an die
// Bounding-Box seines Icons, nicht an die tatsächlich sichtbaren Pixel —
// ein kleiner, dünner Kreis ist dadurch schwer genau zu treffen. Ein extra
// Marker pro Punkt nur für die größere Trefferfläche wäre die naheliegende
// Lösung, verdoppelt aber die Marker-Zahl. Günstiger (per Messung
// bestätigt): der SICHTBARE Marker bekommt selbst einen unsichtbaren
// (strokeOpacity 0) Rand (siehe coloredMarkers/icon.strokeWeight unten) —
// Google zählt dessen Breite mit zur Bounding-Box, obwohl er nicht gemalt
// wird. strokeWeight = 2× die gewünschte zusätzliche Trefferfläche
// (Rand wächst symmetrisch nach außen UND innen vom Pfadrand, nur die
// äußere Hälfte vergrößert die Bounding-Box). Die sichtbare Kreisgröße
// (icon.scale) ändert sich dadurch nicht.
const MARKER_HIT_PADDING_PX = 9;

/** Dunkelt eine #rrggbb-Farbe um den angegebenen Anteil (0–1) ab. */
function darkenHex(hex: string, amount: number): string {
  const factor = 1 - amount;
  const channel = (offset: number) =>
    Math.round(parseInt(hex.slice(offset, offset + 2), 16) * factor)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

// Ein InfoWindow erscheint standardmäßig OBERHALB seines Ankers, horizontal
// zentriert darauf. disableAutoPan (siehe unten) verhindert bewusst, dass
// die Karte beim Öffnen eines Hover-Vorschaubilds springt — als Kehrseite
// gleicht Google das dann aber auch nicht mehr automatisch aus, wenn der
// Marker nah an EINEM der vier Kartenränder liegt: die Vorschau würde dort
// abgeschnitten.
//
// Frühere Versuche haben das reaktiv gelöst: die tatsächlich gerenderte
// (bereits offene) InfoWindow-Position per getBoundingClientRect messen und
// per CSS transform nachträglich korrigieren. Das erwies sich als unnötig
// fragil — u.a. weil Google ein frisch geöffnetes InfoWindow nicht synchron
// positioniert und weil das ständige erneute Messen/Korrigieren immer
// wieder neue Renders auslöste, die sich im ungünstigsten Fall gegenseitig
// aufschaukelten. Ein zweiter, ebenfalls verworfener Ansatz maß VOR dem
// Öffnen an einer unsichtbaren Kopie der Karte, um Nebenstandorte/Tags/
// User-Tags einzurechnen — auch das erwies sich als zu fragil (das
// verzögerte Öffnen selbst provozierte gelegentlich ein weiteres, echtes
// Google-Hover-Ereignis, siehe hoveredMarkerIdRef-Kommentar unten).
//
// Die Karte zeigt deshalb bewusst NUR noch das Bild (keine Nebenstandorte/
// Tags/User-Tags) — dadurch ist ihre Höhe von Anfang an FEST und exakt
// bekannt (HOVER_CARD_IMAGE_HEIGHT_PX), es gibt nichts mehr zu messen oder
// zu erraten. Der pixelOffset wird rein analytisch aus der Marker-Position
// berechnet (siehe handleMarkerMouseOver) und dem InfoWindow direkt beim
// `.open()`-Aufruf mitgegeben — einmalig, synchron, danach nie mehr
// angefasst.
const INFO_WINDOW_EDGE_MARGIN_PX = 8;

interface EdgeRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// Google lässt zwischen einem InfoWindow und seinem Anker-Marker selbst im
// UNKORRIGIERTEN Zustand (pixelOffset [0,0]) einen kleinen, festen Abstand
// frei. Dieser native Abstand ist KEINE reine Konstante, sondern wächst mit
// dem effektiven Radius des Marker-Icons (Basis-Clearance ~11px + Icon-
// Radius) — per isoliertem Messaufbau bestätigt: 5px Radius (kein
// unsichtbarer Rand) -> 16px, 14px Radius (MARKER_HIT_PADDING_PX-Technik,
// scale 5 + strokeWeight/2 = 5+9) -> 25px. Der ursprüngliche Wert 16 wurde
// VOR Einführung von MARKER_HIT_PADDING_PX gemessen; seit der unsichtbare
// Rand zur Trefferflächen-Vergrößerung mit in Googles eigene Bounding-Box-
// Berechnung eingeht (siehe MARKER_HIT_PADDING_PX-Kommentar), ist der
// tatsächliche native Abstand für die (unmarkierten) Hover-Marker auf 25px
// gewachsen — 16 war dadurch zu klein geworden, die geklappte Karte landete
// entsprechend zu nah am Marker (vom User gemeldet).
// Wichtig für den Klapp-Fall in computeCardCorrection: ein reiner
// Höhen-Spiegel (dy = rect.bottom - rect.top) verschiebt Ober- UND
// Unterkante um denselben Betrag — die HÖHENDIFFERENZ (und damit dieser
// dy-Wert) bleibt von einem konstanten Abstand wie diesem also unberührt.
// Ohne den Korrekturterm unten landet die geklappte Karte dadurch knapp
// UNTERHALB ihrer alten (oberhalb liegenden) Position, aber IMMER NOCH
// OBERHALB des Markers statt sicher darunter — um exakt 2× diesen Wert zu
// kurz.
const GOOGLE_INFO_WINDOW_NATIVE_GAP_PX = 25;

/**
 * [x, y]-pixelOffset, um einen HYPOTHETISCHEN Kartenrahmen (rect — wo die
 * Karte OHNE Korrektur landen würde) innerhalb von containerRect zu halten.
 *
 * Links/rechts/unten: einfaches Klemmen (kleinstmögliche Verschiebung).
 *
 * Oben bewusst ANDERS: ein Klemmen (nur so weit nach unten schieben wie
 * nötig) ließe die Karte weiterhin OBERHALB des Markers stehen — bei einem
 * Marker nah am oberen Rand blieb sie dadurch optisch "am Cursor kleben"
 * (vom User gemeldet). Stattdessen klappt die Karte bei einer
 * Ober-Rand-Kollision komplett UNTER den Marker: rect.bottom ist der Punkt,
 * an dem die Karte im unkorrigierten (oberhalb liegenden) Zustand
 * natürlicherweise endet — exakt so weit unterhalb des Markers erneut
 * platziert, ergibt denselben Abstand wie zuvor oberhalb, nur gespiegelt.
 * dy = rect.bottom - rect.top (= angenommene Kartenhöhe), PLUS zweimal
 * GOOGLE_INFO_WINDOW_NATIVE_GAP_PX (siehe dort), verschiebt die Karte um
 * genau diesen Betrag nach unten, sodass ihr NEUER oberer Rand exakt so
 * weit unterhalb des Markers liegt wie ihr ALTER unterer Rand oberhalb.
 *
 * Grenzfall: bei einer sehr niedrigen Kartenbox (weniger Höhe als die
 * geklappte Karte insgesamt braucht) reicht der Platz unterhalb nach dem
 * Klappen u.U. selbst nicht mehr aus — dann wird die geklappte Position
 * zusätzlich nach OBEN geklemmt (kleinstmöglich, nie so weit, dass sie
 * wieder über den oberen Rand hinausragt). In diesem seltenen Fall passt
 * die Karte schlicht nicht vollständig unterhalb UND innerhalb der
 * Kartenbox — der verbleibende Überstand ist dann unvermeidbar, das
 * Klemmen verhindert aber wenigstens ein Herausragen aus der Kartenbox.
 */
function computeCardCorrection(rect: EdgeRect, containerRect: EdgeRect): [number, number] {
  let dx = 0;
  let dy = 0;
  if (rect.left < containerRect.left + INFO_WINDOW_EDGE_MARGIN_PX) {
    dx = containerRect.left + INFO_WINDOW_EDGE_MARGIN_PX - rect.left;
  } else if (rect.right > containerRect.right - INFO_WINDOW_EDGE_MARGIN_PX) {
    dx = containerRect.right - INFO_WINDOW_EDGE_MARGIN_PX - rect.right;
  }
  if (rect.top < containerRect.top + INFO_WINDOW_EDGE_MARGIN_PX) {
    dy = rect.bottom - rect.top + 2 * GOOGLE_INFO_WINDOW_NATIVE_GAP_PX;
    const flippedBottom = rect.bottom + dy;
    if (flippedBottom > containerRect.bottom - INFO_WINDOW_EDGE_MARGIN_PX) {
      dy -= flippedBottom - (containerRect.bottom - INFO_WINDOW_EDGE_MARGIN_PX);
    }
  } else if (rect.bottom > containerRect.bottom - INFO_WINDOW_EDGE_MARGIN_PX) {
    dy = containerRect.bottom - INFO_WINDOW_EDGE_MARGIN_PX - rect.bottom;
  }
  return [dx, dy];
}

// Verzögert das Verwerfen des Hover-Ziels bei mouseout um diese Zeit, statt
// sofort zu räumen (siehe handleMarkerMouseOut) — reine Kurzzeit-Pufferung
// für den Fall, dass ein sofort folgendes mouseover (z.B. beim schnellen
// Wechsel zwischen zwei benachbarten Markern) den Hover-Zustand nicht
// unnötig auf null zurückwerfen soll. Die EIGENTLICHE Absicherung gegen
// länger andauernde, echte Google-interne mouseout/mouseover-Paare (siehe
// SPURIOUS_MOUSEOUT_RADIUS_PX) übernimmt eine Positionsprüfung, sobald
// dieser Timer feuert — deshalb darf er kurz bleiben.
const HOVER_LEAVE_DEBOUNCE_MS = 300;
// Kurz nach einem Pan/Zoom-Gesture kann die Karte noch eine Weile per
// Trägheit nachlaufen — dabei dispatcht Google wiederholt ECHTE, aber
// FEHLGELEITETE mouseout/mouseover-Paare auf einem Marker, dessen
// Bildschirmposition sich minimal unter dem UNBEWEGTEN Cursor verschiebt
// (per Messung bestätigt: kann mehrere Sekunden andauern, mit wachsenden
// Abständen zwischen den Paaren — ein fester Debounce allein kann das nicht
// zuverlässig abfangen, ohne ein echtes Verlassen spürbar zu verzögern).
// Wenn der HOVER_LEAVE_DEBOUNCE_MS-Timer feuert, wird deshalb zusätzlich
// die TATSÄCHLICHE, zuletzt bekannte Cursor-Position (siehe
// lastMousePositionRef) gegen die AKTUELLE Bildschirmposition des Markers
// geprüft: liegt der Cursor noch innerhalb dieses Radius, war das
// mouseout-Ereignis Google-intern fehlgeleitet (der Cursor hat sich nicht
// wirklich wegbewegt) — das Hover-Ziel bleibt dann bestehen. Der Radius
// orientiert sich am größten gerenderten Marker-Symbol (markierter Punkt,
// scale 9, siehe coloredMarkers) plus Puffer für die beim Trägheits-
// Nachlaufen tatsächlich beobachtete Restdistanz des Cursors.
const SPURIOUS_MOUSEOUT_RADIUS_PX = 20;

// Muss mit der Karten-Breite (w-[285px]) im JSX übereinstimmen.
const HOVER_CARD_WIDTH_PX = 285;
// aspect-[4/3] von HOVER_CARD_WIDTH_PX — exakt bekannt, unabhängig davon, ob
// das Bild selbst schon geladen hat (die Höhe kommt allein aus dem
// CSS-Seitenverhältnis des Containers, nicht aus den Bild-Bytes). Das ist
// die GESAMTE, unveränderliche Höhe der Karte für die (eingefrorene)
// Positionierung — EINGEFROREN, siehe INFO_WINDOW_EDGE_MARGIN_PX-Kommentar.
// Das Nebenstandorte/Tags/User-Tags-Panel in HoverCardBody (siehe dort)
// wächst NICHT in diese Höhe hinein: es ist strikt `absolute` innerhalb des
// aspect-[4/3]-Containers platziert (aus dem Layout-Fluss entfernt) und
// kann diese Höhe deshalb nie beeinflussen, egal wie viel Inhalt es zeigt.
const HOVER_CARD_IMAGE_HEIGHT_PX = (HOVER_CARD_WIDTH_PX * 3) / 4;
// Verzögerung vor dem Nachladen von Nebenstandorten/Tags/User-Tags fürs
// Hover-Vorschaubild — bewusst EIGENE, von HOVER_LEAVE_DEBOUNCE_MS getrennte
// Konstante (unterschiedliche Zwecke: dort Verwerfen des Hover-Ziels, hier
// Verzögerung des Nachlade-Fetches). searchImageLocations liefert diese
// Felder aus Kostengründen nicht mit der (unpaginierten) Kartenabfrage mit,
// siehe ImageLocation-Kommentar in actions.ts.
const HOVER_DETAIL_FETCH_DEBOUNCE_MS = 400;
// Obergrenze für den KANDIDATEN-Pool, den useFittingCount unten überhaupt
// erst zu messen versucht — nicht die tatsächlich sichtbare Anzahl (die
// bestimmt useFittingCount selbst, siehe HoverBadgeRow). Verhindert, dass
// ein Bild mit z.B. 40 Tags 40 DOM-Badges rendert, nur damit die Messung
// die meisten davon gleich wieder verwirft (dasselbe Muster wie
// MAX_VISIBLE_TAGS in image-thumbnail-card.tsx).
const MAX_HOVER_BADGE_CANDIDATES = 8;

/**
 * Eine Info-Zeile im Hover-Vorschaubild-Panel (Nebenstandorte/Tags/
 * User-Tags) — zeigt so viele volle Badges wie in die 285px breite Zeile
 * passen (per useFittingCount, siehe src/lib/use-fitting-count.ts — dieselbe
 * Breiten-Messung wie bei den Grid-Kacheln), das jeweils letzte sichtbare
 * Badge darf dabei enger werden (min-w-8 shrink statt shrink-0) und trägt
 * bei weiteren, nicht mehr gezeigten Einträgen zusätzlich eine angehängte
 * Ellipse — unabhängig davon, ob sein eigener Text überhaupt so lang wäre,
 * dass er von selbst umbräche (bei kurzen Labels sonst keine sichtbare
 * Ellipse, obwohl die Liste erkennbar weitergeht). Der "+N"-Rest landet per
 * ml-auto rechtsbündig direkt danach — bewusst ein SCHLICHTER Text statt der
 * interaktiven OverflowBadgesPopover aus der Kachel (image-thumbnail-card.tsx):
 * diese Karte ist komplett pointer-events-none (siehe HoverCardBody), ein
 * Klick-/Hover-Popover wäre hier unerreichbar. Die Breiten-Messung selbst
 * beeinflusst nur den INHALT dieser (bereits fest 285px breiten) Zeile,
 * nie die Kartengröße selbst (siehe HOVER_CARD_IMAGE_HEIGHT_PX-Kommentar) —
 * unproblematisch für die eingefrorene Positionierung.
 */
function HoverBadgeRow({
  icon: Icon,
  items,
  iconClassName,
  badgeClassName,
}: {
  icon: LucideIcon;
  items: string[];
  iconClassName: string;
  badgeClassName: string;
}) {
  const candidates = items.slice(0, MAX_HOVER_BADGE_CANDIDATES);
  const [rowRef, fitCount] = useFittingCount(candidates.length);
  if (items.length === 0) return null;
  const visible = candidates.slice(0, fitCount);
  const hiddenCount = items.length - visible.length;
  return (
    <div className="flex items-center gap-1">
      <Icon className={cn("size-3 shrink-0", iconClassName)} />
      <div ref={rowRef} className="flex flex-1 flex-nowrap items-center gap-1 overflow-hidden">
        {visible.map((item, index) => {
          const isLast = index === visible.length - 1;
          const showsMore = isLast && hiddenCount > 0;
          return (
            <Badge
              key={`${item}-${isLast ? "trailing" : "full"}`}
              className={cn("max-w-full text-[11px]", isLast ? "min-w-8 shrink" : "shrink-0", badgeClassName)}
            >
              <span className="min-w-0 truncate">{showsMore ? `${item}…` : item}</span>
            </Badge>
          );
        })}
        {hiddenCount > 0 && (
          <span className={cn("ml-auto shrink-0 text-[11px] font-medium", iconClassName)}>+{hiddenCount}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Der Karteninhalt fürs Hover-Vorschaubild — Bild + Hauptadresse sofort
 * sichtbar; Nebenstandorte/Tags/User-Tags (details, siehe
 * detailsById/handleMarkerMouseOver in MapMarkersAndBounds) blenden erst
 * nachträglich als Panel ein, sobald sie geladen sind. Das Panel ist
 * bewusst strikt `absolute` innerhalb des `aspect-[4/3]`-Containers
 * platziert (siehe HOVER_CARD_IMAGE_HEIGHT_PX-Kommentar) — es beeinflusst
 * die (eingefrorene) Kartenhöhe dadurch nie, egal wie viel Inhalt es zeigt.
 */
function HoverCardBody({
  location,
  details,
}: {
  location: ColoredImageLocation;
  /** undefined = noch nicht (fertig) geladen, null = Fetch ohne Treffer —
   * in beiden Fällen bleibt das Panel unsichtbar. */
  details: ImageSearchRow | null | undefined;
}) {
  const hasExtra = Boolean(
    details && (details.secondaryLocations.length > 0 || details.tags.length > 0 || details.userTags.length > 0)
  );
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  return (
    <div className="pointer-events-none w-[285px] overflow-hidden rounded-xl bg-black outline-4 outline-black/50">
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- festes Vorschaubild, kein next/image-Mehrwert in einem Google-Maps-InfoWindow */}
        <img
          src={thumbUrlFor(location.id)}
          alt=""
          className="size-full object-cover"
          onLoad={() => setIsImageLoaded(true)}
        />

        {/* Spinner, solange das Thumbnail noch lädt — die Karte wird pro
            gehovertem Marker über key={location.id} am Aufrufort neu
            gemountet (siehe MapMarkersAndBounds), isImageLoaded startet
            deshalb bei jedem Markerwechsel wieder bei false. */}
        {!isImageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        )}

        {/* ID/Favorit stammen aus details (ImageSearchRow), nicht aus
            location (ImageLocation) — die schlanke, unpaginierte
            Karten-Query lädt bewusst kein hash/isFavorite (siehe
            ImageLocation-Kommentar in actions.ts). Erscheinen deshalb erst,
            sobald details geladen ist: sofort bei bereits gecachten
            Markern, sonst verzögert nach dem debounced Fetch (siehe
            detailsById-Effekt in MapMarkersAndBounds) — reine Anzeige,
            keine CopyableId/FavoriteButton-Interaktivität, da die Karte
            komplett pointer-events-none ist.

            Wrapper bleibt IMMER gemountet (wie das Nebenstandorte/Tags-
            Panel unten) und blendet nur per opacity-Transition ein/aus —
            bei bedingtem Mounten (`{details && <div>...}`) gäbe es keinen
            "Vorher"-Zustand im DOM, aus dem heraus animiert werden könnte,
            die Badges würden also hart erscheinen statt sanft einzublenden. */}
        <div
          className={cn(
            "absolute top-1 right-1 flex items-center gap-1 transition-opacity duration-500",
            details ? "opacity-100" : "opacity-0"
          )}
        >
          {details && (
            <>
              {/* rounded-md statt der Badge-Standardform (rounded-4xl/
                  Pille, siehe badge.tsx) — auf Wunsch des Users eine
                  eckigere "Badge"-Optik statt einer Pille, passend zur
                  eckigen Form des Favoriten-Containers direkt daneben.
                  twMerge (via cn) löst den Klassenkonflikt auf, rounded-md
                  gewinnt. */}
              <Badge className={cn("gap-1 rounded-md text-[11px] text-primary", BUTTON_GLASS_CLASS)}>
                ID {details.hash}
              </Badge>
              {/* size-5 statt size-6 — an die Höhe des ID-Badges daneben
                  angeglichen (Badge-Basisklasse ist h-5, siehe badge.tsx),
                  sonst standen beide unterschiedlich hoch nebeneinander. */}
              <div className={cn("flex size-5 items-center justify-center rounded-md", BUTTON_GLASS_CLASS)}>
                <Heart className={cn("size-3 text-primary", details.isFavorite && "fill-current")} />
              </div>
            </>
          )}
        </div>

        {/* Blendet aus, sobald das Panel unten dieselbe Info (als erste
            Zeile) zeigt — verhindert eine doppelte Anzeige der Hauptadresse.
            Bleibt unverändert sichtbar, solange kein Panel erscheint (der
            allergrößte Teil der Bilder hat keine Nebenstandorte/Tags). */}
        {location.mainLocation && (
          <Badge
            className={cn(
              "absolute bottom-1 left-1 max-w-[70%] gap-1 text-[11px] text-primary transition-opacity duration-300",
              BUTTON_GLASS_CLASS,
              hasExtra && "opacity-0"
            )}
          >
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{location.mainLocation}</span>
          </Badge>
        )}

        {/* Immer gemountet (nicht erst bei hasExtra), damit der Wechsel von
            opacity-0 auf opacity-100 tatsächlich ANIMIERT statt beim
            allerersten Erscheinen sofort im Endzustand zu stehen. Rein
            absolut positioniert innerhalb des aspect-[4/3]-Containers —
            beeinflusst dessen (eingefrorene) Layout-Größe deshalb nie, egal
            wie viel Inhalt letztlich hineingerendert wird (siehe
            HOVER_CARD_IMAGE_HEIGHT_PX-Kommentar). */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 space-y-0.5 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-2 pt-5 pb-1.5 transition-all duration-300",
            hasExtra ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
          )}
        >
          <div className="-mt-5 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />
          {location.mainLocation && (
            <div className="flex items-center gap-1">
              <MapPin className="size-3 shrink-0 text-primary" />
              <Badge className={cn("max-w-full shrink-0 text-[11px] text-primary", BUTTON_GLASS_CLASS)}>
                <span className="min-w-0 truncate">{location.mainLocation}</span>
              </Badge>
            </div>
          )}
          {details && (
            <>
              <HoverBadgeRow
                icon={Signpost}
                items={details.secondaryLocations}
                iconClassName="text-primary"
                badgeClassName={cn("text-primary", BUTTON_GLASS_CLASS)}
              />
              <HoverBadgeRow
                icon={TagIcon}
                items={details.tags}
                iconClassName={TAG_ACCENT_TEXT_CLASS}
                badgeClassName={cn(TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
              />
              <HoverBadgeRow
                icon={UserTagsIcon}
                items={details.userTags.map((entry) => entry.tag)}
                iconClassName={TAG_ACCENT_TEXT_CLASS}
                badgeClassName={cn(TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Ein unsichtbarer google.maps.OverlayView, einzig um an dessen
 * getProjection() zu kommen — die Maps JS API bietet sonst keinen direkten
 * Weg, eine geografische Koordinate in eine Pixel-Position relativ zur
 * Kartenbox umzurechnen. Wird in handleMarkerMouseOver gebraucht, um die
 * Rand-Korrektur ANALYTISCH (unabhängig von Googles eigener, zeitlich
 * unvorhersehbarer InfoWindow-Positionierung) zu berechnen. onAdd/draw/
 * onRemove müssen als (auch leere) Funktionen vorhanden sein, sonst wirft
 * die Maps API beim Hinzufügen zur Karte einen Fehler.
 */
function useMapProjection(map: google.maps.Map | null): google.maps.OverlayView | null {
  const [overlay, setOverlay] = useState<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map) return;
    const projectionOverlay = new google.maps.OverlayView();
    projectionOverlay.onAdd = () => {};
    projectionOverlay.draw = () => {};
    projectionOverlay.onRemove = () => {};
    projectionOverlay.setMap(map);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Overlay muss erst zur Karte hinzugefügt werden, bevor er nutzbar ist
    setOverlay(projectionOverlay);
    return () => {
      projectionOverlay.setMap(null);
      setOverlay(null);
    };
  }, [map]);

  return overlay;
}

function MapMarkersAndBounds({
  locations,
  bounds,
  containerWidth,
  containerHeight,
  containerRef,
  highlightedId,
  onSelectImage,
  isPreviewOpen,
  knownRowsById,
}: {
  locations: ColoredImageLocation[];
  bounds: SimpleBounds | null;
  containerWidth: number;
  containerHeight: number;
  /** Sichtbare Kartenbox (der Wrapper aus ImagesMapView) — Grundlage für die
   * Rand-Kollisionsmessung des Hover-Vorschaubilds, siehe pixelOffset unten. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  highlightedId?: string | null;
  onSelectImage: (id: string) => void;
  /** Ob das große Vollbild-Preview (images-page-client.tsx) gerade offen
   * ist — siehe Effekt unten, der die kleine Kartenvorschau beim Schließen
   * mitschließt. */
  isPreviewOpen: boolean;
  /** Siehe ImagesMapView — Vorrang vor detailsById unten, löst das
   * Stale-Cache-Problem nach einer Bearbeitung über das große Preview. */
  knownRowsById: ReadonlyMap<string, ImageSearchRow>;
}) {
  const map = useMap();
  // Für die Rand-Kollisionsberechnung/Messung, siehe handleMarkerMouseOver
  // weiter unten.
  const projectionOverlay = useMapProjection(map);
  // Marker-Instanz UND der analytisch berechnete pixelOffset werden direkt
  // im onMouseOver-Handler aus markerRefs/containerRef aufgelöst und HIER
  // (nicht als abgeleiteter Wert während des Renderns) in State gespeichert
  // — ein Ref-Read während des Renderns ist laut React verboten
  // (react-hooks/refs), da refs nicht für den Rendervorgang getrackt werden.
  // Event-Handler sind dagegen ein sicherer Ort dafür.
  const [hoveredMarker, setHoveredMarker] = useState<{
    id: string;
    marker: google.maps.Marker;
    pixelOffset: [number, number] | undefined;
  } | null>(null);
  // Ref-Map statt useMarkerRef() pro Punkt — Hooks lassen sich nicht in der
  // .map()-Schleife unten aufrufen. Dient als Anker fürs Hover-InfoWindow.
  const markerRefs = useRef(new globalThis.Map<string, google.maps.Marker>());
  // Siehe HOVER_LEAVE_DEBOUNCE_MS/handleMarkerMouseOut.
  const hoverLeaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Zuletzt bekannte ECHTE Cursor-Position (Viewport-Koordinaten), aus einem
  // window-weiten mousemove mitgeschrieben (siehe Effekt unten) — dient
  // handleMarkerMouseOut als Tatsachen-Check gegen Google-intern
  // fehlgeleitete mouseout-Ereignisse, siehe SPURIOUS_MOUSEOUT_RADIUS_PX.
  const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null);
  // Spiegel von hoveredMarker?.id, OHNE dass ein Lesezugriff darauf
  // handleMarkerMouseOver instabil macht (siehe projectionOverlayRef-
  // Kommentar unten für dasselbe Muster). Gebraucht für die Idempotenz-
  // Prüfung in handleMarkerMouseOver: Google feuert auf einem Canvas-
  // gerenderten Marker gelegentlich ein GENUINES (nicht von uns
  // fehlgemessenes) erneutes mouseover, OBWOHL sich die Maus nicht bewegt
  // hat (per Messung bestätigt, siehe HOVER_LEAVE_DEBOUNCE_MS-Kommentar) —
  // ohne diese Prüfung würde JEDES dieser Ereignisse die bereits korrekt
  // geöffnete Karte erneut schließen und neu aufbauen; dieses
  // Schließen+Neuöffnen selbst störte dabei wiederum Googles eigene
  // Hover-Erkennung (dieselbe Ursache wie beim früher behobenen
  // Marker-Prop-Problem) und löste SOFORT das nächste solcher Ereignisse
  // aus — eine sich selbst aufschaukelnde Schließen/Neuöffnen-Schleife
  // (per Messung bestätigt).
  const hoveredMarkerIdRef = useRef<string | null>(null);

  // Immer die aktuellen Werte, aber OHNE dass ein Lesezugriff darauf einen
  // Effekt/Callback neu erzeugt. Gebraucht, damit handleMarkerMouseOver
  // (siehe unten) wirklich STABIL bleibt (leeres/fast leeres
  // Dependency-Array), obwohl es auf diese sich häufig ändernden Werte
  // zugreifen muss.
  const projectionOverlayRef = useRef(projectionOverlay);
  useEffect(() => {
    projectionOverlayRef.current = projectionOverlay;
  }, [projectionOverlay]);
  const onSelectImageRef = useRef(onSelectImage);
  useEffect(() => {
    onSelectImageRef.current = onSelectImage;
  }, [onSelectImage]);
  useEffect(() => {
    hoveredMarkerIdRef.current = hoveredMarker?.id ?? null;
  }, [hoveredMarker]);
  // Einziger Zweck: lastMousePositionRef aktuell halten (siehe
  // SPURIOUS_MOUSEOUT_RADIUS_PX-Kommentar) — window-weit statt nur auf der
  // Kartenbox, da ein mouseout-Ereignis selbst kein zuverlässiges
  // clientX/clientY der jetzigen Cursor-Position liefert (das Ereignis
  // gehört zum verlassenen Element, nicht zur aktuellen Mausposition).
  useEffect(() => {
    function handleWindowMouseMove(event: MouseEvent) {
      lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
    }
    window.addEventListener("mousemove", handleWindowMouseMove);
    return () => window.removeEventListener("mousemove", handleWindowMouseMove);
  }, []);

  // Schließt die kleine Kartenvorschau mit, sobald das große Vollbild-
  // Preview schließt — während das Preview offen ist, blockiert dessen
  // Overlay jede weitere Maus-Interaktion mit der Karte, ein echtes
  // mouseout auf dem zugrundeliegenden Marker (siehe handleMarkerMouseOut,
  // eingefroren) feuert deshalb nie, die kleine Vorschau bliebe sonst
  // fälschlich stehen. Reine Ergänzung, ruft nur denselben
  // setHoveredMarker(null)-Pfad auf, den ein echtes mouseout auch nutzen
  // würde — die eingefrorene Positionierungslogik selbst bleibt unberührt.
  const wasPreviewOpenRef = useRef(isPreviewOpen);
  useEffect(() => {
    if (wasPreviewOpenRef.current && !isPreviewOpen) {
      setHoveredMarker(null);
      if (hoverLeaveTimeoutRef.current) {
        clearTimeout(hoverLeaveTimeoutRef.current);
        hoverLeaveTimeoutRef.current = null;
      }
    }
    wasPreviewOpenRef.current = isPreviewOpen;
  }, [isPreviewOpen]);

  // Nebenstandorte/Tags/User-Tags pro Bild-id — lazy nachgeladen (siehe
  // Effekt unten), NICHT Teil von ColoredImageLocation/searchImageLocations
  // (siehe dortiger Kommentar: bewusst schlank für die unpaginierte
  // Kartenabfrage). undefined = noch nicht angefragt, null = Fetch ohne
  // Treffer (z.B. zwischenzeitlich gelöscht/nicht mehr sichtbar). Cache
  // bleibt über die gesamte Komponenten-Lebensdauer bestehen — erneutes
  // Hovern desselben Markers ist dadurch instant (kein erneuter Fetch).
  const [detailsById, setDetailsById] = useState<Record<string, ImageSearchRow | null>>({});
  // Für einen Lesezugriff INNERHALB des Fetch-Effekts unten, ohne dass der
  // Effekt bei jeder Cache-Aktualisierung neu binden muss (dasselbe Muster
  // wie projectionOverlayRef/onSelectImageRef oben).
  const detailsByIdRef = useRef(detailsById);
  useEffect(() => {
    detailsByIdRef.current = detailsById;
  }, [detailsById]);

  // Lädt Nebenstandorte/Tags/User-Tags NACHTRÄGLICH und verzögert (siehe
  // HOVER_DETAIL_FETCH_DEBOUNCE_MS), rein LESEND an hoveredMarker?.id
  // gekoppelt — bewusst ein GANZ EIGENER Effekt, unabhängig von
  // handleMarkerMouseOver/-Out und computeCardCorrection (eingefroren,
  // siehe INFO_WINDOW_EDGE_MARGIN_PX-Kommentar): schreibt nie in
  // hoveredMarker oder pixelOffset, kann die Positionierung deshalb nicht
  // beeinflussen. Ein Marker-Wechsel (oder Schließen der Karte) räumt einen
  // noch nicht gefeuerten Timer über das Cleanup automatisch weg.
  useEffect(() => {
    const id = hoveredMarker?.id ?? null;
    // knownRowsById.has(id): images-page-client.tsx kennt diese Zeile
    // bereits aktuell (rows/externalPreviewRow) — ein eigener Fetch wäre
    // hier reine Verschwendung, siehe Render-Stelle unten für den
    // eigentlichen Vorrang.
    if (!id || knownRowsById.has(id) || detailsByIdRef.current[id] !== undefined) return;
    const timeoutId = setTimeout(() => {
      void getImageById(id).then((row) => {
        // Zwischenzeitlich zu einem ANDEREN Marker gewechselt (oder ganz
        // geschlossen) — dieses Ergebnis gehört nicht mehr zur aktuell
        // gezeigten Karte, wird trotzdem gecacht (kommt beim erneuten
        // Hovern desselben Markers zugute), aber nicht mehr "frisch"
        // benötigt.
        setDetailsById((prev) => (prev[id] !== undefined ? prev : { ...prev, [id]: row }));
      });
    }, HOVER_DETAIL_FETCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [hoveredMarker?.id, knownRowsById]);

  // Stabile (per useCallback über die gesamte Marker-Hover-Sitzung hinweg
  // gleichbleibende) Event-Handler statt der früheren, direkt in der
  // .map()-Schleife inline definierten Arrow-Functions — DAS war die
  // eigentliche Ursache des vom User gemeldeten "Karte bleibt über dem
  // Cursor"-Problems auf der vollen, unbefilterten Karte: <Marker> (siehe
  // @vis.gl/react-google-maps-Quelle) entfernt und hängt bei JEDER
  // Prop-Änderung (inkl. einer bei jedem Render NEU erzeugten
  // onMouseOver/onMouseOut-Funktion) alle internen Google-Maps-
  // Event-Listener komplett neu ein (gme.clearInstanceListeners + erneutes
  // addListener) — und genau das kann bei einem Canvas-gerenderten Marker
  // Googles eigene interne Hover-Erkennung kurz durcheinanderbringen und ein
  // ECHTES (nicht von uns fehlgemessenes) mouseout auslösen, obwohl sich die
  // Maus gar nicht bewegt hat (per Messung bestätigt: markierte icon- UND
  // position-Objekte allein reichten NICHT, erst die zusätzlich bei jedem
  // Render neu erzeugten Event-Handler erklärten das beobachtete Muster
  // vollständig). loc wird als Parameter übergeben statt eingefangen, damit
  // diese Funktionen selbst über die gesamte Komponenten-Lebensdauer hinweg
  // ein einziges Mal erzeugt werden (siehe coloredMarkers weiter unten, wo
  // sie EINMALIG pro Marker gebunden werden, nicht bei jedem Render neu).
  const handleMarkerClick = useCallback((id: string) => {
    onSelectImageRef.current(id);
  }, []);

  const handleMarkerMouseOver = useCallback(
    (loc: ColoredImageLocation) => {
      // Ein eventuell noch anstehendes, verzögertes Verwerfen (siehe
      // HOVER_LEAVE_DEBOUNCE_MS/handleMarkerMouseOut) ist jetzt hinfällig —
      // die Maus ist ja gerade wieder (oder immer noch) über einem Marker.
      if (hoverLeaveTimeoutRef.current) {
        clearTimeout(hoverLeaveTimeoutRef.current);
        hoverLeaveTimeoutRef.current = null;
      }
      // Idempotenz-Guard gegen ein GENUINES, wiederholtes mouseover-Ereignis
      // auf demselben, unbewegten Marker (siehe hoveredMarkerIdRef-Kommentar
      // oben) — dieser Marker ist bereits offen, ein erneuter Durchlauf
      // würde das InfoWindow unnötig (und mit Schließen/Neuöffnen-
      // Nebenwirkungen) neu aufbauen.
      if (hoveredMarkerIdRef.current === loc.id) return;
      const marker = markerRefs.current.get(loc.id);
      // Ref-Zugriffe (containerRef.current) sind laut React nur außerhalb
      // des Rendervorgangs sicher — deshalb hier im Event-Handler, nicht
      // während des Renderns.
      const projection = projectionOverlayRef.current?.getProjection();
      if (!marker || !projection || !containerRef.current) return;
      const point = projection.fromLatLngToContainerPixel(new google.maps.LatLng(loc.lat, loc.lng));
      if (!point) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const markerPageX = containerRect.left + point.x;
      const markerPageY = containerRect.top + point.y;
      // Die Karte zeigt nur noch das Bild (siehe HoverCardBody) — ihre Höhe
      // ist damit IMMER exakt HOVER_CARD_IMAGE_HEIGHT_PX, kein Raten, kein
      // Messen, kein verzögertes Nachladen nötig.
      const imageRect: EdgeRect = {
        left: markerPageX - HOVER_CARD_WIDTH_PX / 2,
        right: markerPageX + HOVER_CARD_WIDTH_PX / 2,
        top: markerPageY - HOVER_CARD_IMAGE_HEIGHT_PX,
        bottom: markerPageY,
      };
      setHoveredMarker({ id: loc.id, marker, pixelOffset: computeCardCorrection(imageRect, containerRect) });
    },
    [containerRef]
  );

  // Verzögert statt sofort geräumt (siehe HOVER_LEAVE_DEBOUNCE_MS) — ein
  // mouseout, das kurz danach vom selben Marker durch ein erneutes
  // mouseover widerrufen wird (siehe hoverLeaveTimeoutRef-Cancel in
  // handleMarkerMouseOver), soll unseren Positionierungs-Ablauf NICHT
  // zurücksetzen. Wenn der Timer feuert, wird zusätzlich (siehe
  // SPURIOUS_MOUSEOUT_RADIUS_PX) die TATSÄCHLICHE Cursor-Position gegen die
  // AKTUELLE Marker-Position geprüft — steht der Cursor dort immer noch,
  // war das mouseout Google-intern fehlgeleitet und wird ignoriert.
  const handleMarkerMouseOut = useCallback((id: string) => {
    if (hoverLeaveTimeoutRef.current) clearTimeout(hoverLeaveTimeoutRef.current);
    hoverLeaveTimeoutRef.current = setTimeout(() => {
      hoverLeaveTimeoutRef.current = null;
      const cursor = lastMousePositionRef.current;
      const marker = markerRefs.current.get(id);
      const markerPosition = marker?.getPosition();
      const projection = projectionOverlayRef.current?.getProjection();
      if (cursor && markerPosition && projection && containerRef.current) {
        const point = projection.fromLatLngToContainerPixel(markerPosition);
        if (point) {
          const containerRect = containerRef.current.getBoundingClientRect();
          const markerScreenX = containerRect.left + point.x;
          const markerScreenY = containerRect.top + point.y;
          const distance = Math.hypot(cursor.x - markerScreenX, cursor.y - markerScreenY);
          if (distance < SPURIOUS_MOUSEOUT_RADIUS_PX) return;
        }
      }
      setHoveredMarker((current) => (current?.id === id ? null : current));
    }, HOVER_LEAVE_DEBOUNCE_MS);
  }, [containerRef]);

  const handleMarkerRef = useCallback((id: string, marker: google.maps.Marker | null) => {
    if (marker) markerRefs.current.set(id, marker);
    else markerRefs.current.delete(id);
  }, []);

  // Plain Array-/Map-Suche in Props/State (kein Ref-Read) — sicher während
  // des Renderns, anders als ein direkter Zugriff auf markerRefs.
  const hoveredLocation = hoveredMarker ? locations.find((loc) => loc.id === hoveredMarker.id) : undefined;

  useEffect(() => {
    return () => {
      if (hoverLeaveTimeoutRef.current) clearTimeout(hoverLeaveTimeoutRef.current);
    };
  }, []);

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

  // Memoisiert, damit weder icon NOCH position bei jedem Render für JEDEN
  // Marker neu als Objekt-Literal entstehen. <Marker> ruft bei jeder
  // Prop-Änderung marker.setOptions(...) bzw. marker.setPosition(...) auf
  // (siehe @vis.gl/react-google-maps-Quelle) — bei gleichbleibenden Werten
  // unnötig NEUE Objekte lösten dort wiederholt ein internes Neuzeichnen
  // bzw. Neupositionieren des Markers aus, was (v.a. das wiederholte
  // setPosition mit denselben Koordinaten) per Messung bestätigt ein ECHTES
  // (von Google selbst dispatchtes, keine App-Fehlmessung) mouseout auf dem
  // gerade gehoverten Marker auslösen konnte. Neu berechnet nur, wenn sich
  // locations oder highlightedId tatsächlich ändern.
  const coloredMarkers = useMemo(() => {
    if (!map) return [];
    return locations.map((loc) => {
      const isHighlighted = loc.id === highlightedId;
      const baseColor = loc.color ?? FALLBACK_MARKER_COLOR;
      const markerColor = isHighlighted ? darkenHex(baseColor, HIGHLIGHT_FILL_DARKEN_AMOUNT) : baseColor;
      return {
        loc,
        isHighlighted,
        position: { lat: loc.lat, lng: loc.lng },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isHighlighted ? 9 : 5,
          fillColor: markerColor,
          fillOpacity: isHighlighted ? HIGHLIGHT_FILL_OPACITY : MARKER_FILL_OPACITY,
          // Beim hervorgehobenen Marker bleibt der bestehende ECHTE (sicht-
          // bare) Rand unangetastet — er ist ohnehin schon größer (scale 9)
          // und hat mit HIGHLIGHT_STROKE_WEIGHT bereits eine reale, breite
          // Randfläche, die zur Trefferfläche zählt (per Messung bestätigt:
          // die Trefferfläche zählt auch bei sichtbarem Rand dessen Breite
          // mit). Beim normalen (winzigen) Marker dagegen ein rein
          // UNSICHTBARER Rand (strokeOpacity 0) einzig zur Vergrößerung der
          // Trefferfläche, siehe MARKER_HIT_PADDING_PX-Kommentar oben.
          strokeWeight: isHighlighted ? HIGHLIGHT_STROKE_WEIGHT : MARKER_HIT_PADDING_PX * 2,
          strokeOpacity: isHighlighted ? 1 : 0,
          strokeColor: markerColor,
        },
        // Einmal pro Marker gebunden (nicht bei jedem Render neu) — siehe
        // ausführliche Begründung bei handleMarkerMouseOver oben.
        onClick: () => handleMarkerClick(loc.id),
        onMouseOver: () => handleMarkerMouseOver(loc),
        onMouseOut: () => handleMarkerMouseOut(loc.id),
        onRef: (marker: google.maps.Marker | null) => handleMarkerRef(loc.id, marker),
      };
    });
  }, [map, locations, highlightedId, handleMarkerClick, handleMarkerMouseOver, handleMarkerMouseOut, handleMarkerRef]);

  if (!map) return null;

  return (
    <>
      {coloredMarkers.map(({ loc, isHighlighted, position, icon, onClick, onMouseOver, onMouseOut, onRef }) => {
        return (
          <Marker
            key={loc.id}
            position={position}
            zIndex={isHighlighted ? 1000 : undefined}
            icon={icon}
            onClick={onClick}
            onMouseOver={onMouseOver}
            onMouseOut={onMouseOut}
            ref={onRef}
          />
        );
      })}
      {/* Kleines Vorschaubild beim Hovern — natives InfoWindow (Anker am
          Marker, Google übernimmt Positionierung/Nachführen bei Pan/Zoom)
          statt einer selbstgebauten, absolut positionierten Overlay-Div.
          thumbUrlFor(id) ist eine reine Funktion nur aus der id (siehe
          image-folder.ts) — kein Datennachladen fürs Bild selbst nötig.
          Zeigt SOFORT Bild + Hauptadresse — die Position beim Öffnen ist
          dadurch immer exakt, ohne Verzögerung oder Raten (siehe
          HOVER_CARD_IMAGE_HEIGHT_PX-Kommentar, EINGEFROREN). Nebenstandorte/
          Tags/User-Tags (details) laden NACHTRÄGLICH und verzögert (siehe
          detailsById-Effekt oben) und blenden als reines Overlay innerhalb
          der bestehenden Kartenhöhe ein (siehe HoverCardBody) — das ändert
          die Kartengröße nie, die Positionierung bleibt unberührt.
          Favorit/Bearbeiten/Löschen bleiben bewusst außen vor — das sind
          Aktionen, keine Information, und passen nicht zu einer
          nicht-interaktiven Kartenvorschau (pointer-events-none, siehe
          HoverCardBody). */}
      {hoveredMarker && hoveredLocation && (
        <InfoWindow
          anchor={hoveredMarker.marker}
          headerContent={null}
          disableAutoPan
          pixelOffset={hoveredMarker.pixelOffset}
        >
          <HoverCardBody
            key={hoveredLocation.id}
            location={hoveredLocation}
            // knownRowsById zuerst: in images-page-client.tsx bereits
            // geladene Zeilen (rows/externalPreviewRow) sind IMMER aktuell
            // (z.B. gerade über das große Preview bearbeitet) — der eigene
            // details-Cache unten kann dagegen veraltet sein, da er nie
            // gezielt invalidiert wird (siehe Fetch-Effekt oben).
            details={knownRowsById.get(hoveredMarker.id) ?? detailsById[hoveredMarker.id]}
          />
        </InfoWindow>
      )}
    </>
  );
}

export function ImagesMapView({
  locations,
  units,
  regions,
  standort,
  highlightedId,
  onSelectImage,
  isPreviewOpen,
  knownRowsById,
}: {
  locations: ImageLocation[];
  units: AdministrativeUnit[];
  regions: Region[];
  standort: StandortRef | null;
  /** Marker, der beim Klick auf den Standort-Punkt einer Kachel/Preview
   * hierher navigiert ist (siehe image-map-dot.tsx) ODER zuletzt direkt auf
   * der Karte angeklickt wurde (siehe onSelectImage) — bekommt einen
   * größeren, dunkleren, umrandeten Stil (siehe HIGHLIGHT_*-Konstanten). */
  highlightedId?: string | null;
  /** Klick auf einen Kartenpunkt — öffnet in images-page-client.tsx das
   * Vollbild-Preview desselben Bilds. */
  onSelectImage: (id: string) => void;
  /** Ob das große Vollbild-Preview gerade offen ist — siehe
   * MapMarkersAndBounds, schließt die kleine Kartenvorschau beim Schließen
   * des großen Previews mit. */
  isPreviewOpen: boolean;
  /** Bereits in images-page-client.tsx geladene, IMMER aktuelle Zeilen
   * (rows + externalPreviewRow) — siehe MapMarkersAndBounds, bekommt dort
   * Vorrang vor dem eigenen, potenziell veralteten details-Cache. */
  knownRowsById: ReadonlyMap<string, ImageSearchRow>;
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
          (langjährig unverändert), um gezielt per CSS angefasst zu werden.
          Dieselbe Technik für die Hover-InfoWindow-Klassen darunter: Google
          bringt fürs InfoWindow eigenes weißes Bubble-Chrome (Hintergrund,
          Schließen-X, Pfeil-Spitze) mit, das über MapOptions/InfoWindowProps
          NICHT abschaltbar ist — nur über diese festen .gm-*-Klassen.
          border-radius/overflow auf .gm-style-iw-c/-d werden zusätzlich
          zurückgesetzt (Google bringt dort einen EIGENEN 8px-Radius +
          overflow: hidden/scroll mit): sonst entstand ein zweiter,
          abweichender Rundungs-Radius um unseren eigenen rounded-xl-Inhalt
          herum (sichtbar als Eck-Artefakte), und dieser äußere
          overflow:hidden/scroll schnitt unseren outline-4 (der außerhalb
          der eigenen Box gezeichnet wird) teilweise weg. */}
      <style>{`
        [data-testid="images-map-view"] .gm-fullscreen-control { filter: brightness(0.85); }
        [data-testid="images-map-view"] .gm-style-iw-c,
        [data-testid="images-map-view"] .gm-style-iw-d {
          padding: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          overflow: visible !important;
        }
        [data-testid="images-map-view"] .gm-style-iw-tc { display: none !important; }
        [data-testid="images-map-view"] .gm-style-iw-chr,
        [data-testid="images-map-view"] .gm-ui-hover-effect { display: none !important; }
        /* Google setzt den Pan-Cursor selbst per Inline-Style auf ein
           EIGENES, extern nachgeladenes .cur-Bild (openhand_8_8.cur beim
           Ruhezustand, closedhand_8_8.cur beim aktiven Ziehen) — das
           betroffene div trägt dabei weder Klasse noch sonst ein
           Attribut, über das es sich gezielt ansprechen ließe. Der
           Dateiname selbst ist aber seit Jahren stabil (dieselbe
           Begründung wie bei .gm-fullscreen-control oben) und lässt sich
           darüber im Inline-Style-Attribut selbst finden. Auf Wunsch des
           Users NICHT die Hand-Cursor (Googles eigener Stil), sondern beim
           Herumfahren der ganz normale Cursor (default) und beim aktiven
           Ziehen der Kreuz-/4-Pfeile-Cursor (move) — beides native
           CSS-Schlüsselwörter, die keinen externen Datei-Ladevorgang
           brauchen und deshalb auch dann zuverlässig funktionieren, wenn
           Googles eigene .cur-Datei (z.B. durch einen Adblocker/
           Privacy-Filter oder ein Netzwerkproblem) beim User nicht lädt. */
        [data-testid="images-map-view"] [style*="openhand"] { cursor: default !important; }
        [data-testid="images-map-view"] [style*="closedhand"] { cursor: move !important; }
      `}</style>
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
            containerRef={wrapperRef}
            highlightedId={highlightedId}
            onSelectImage={onSelectImage}
            isPreviewOpen={isPreviewOpen}
            knownRowsById={knownRowsById}
          />
        </Map>
      </APIProvider>
    </div>
  );
}
