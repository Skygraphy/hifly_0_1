"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Check, Hash, Heart, Images, LayoutGrid, Map, MapPin, Tag, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ImageGrid } from "@/components/image-grid";
import { ImagesMapView } from "@/components/images-map-view";
import { ImageEditDialog } from "@/components/image-edit-dialog";
import { ImageDeleteDialog } from "@/components/image-delete-dialog";
import { ImagePreviewPopup } from "@/components/image-preview-popup";
import { BulkDeleteDialog } from "@/components/bulk-delete-dialog";
import { ScrollToTopButton } from "@/components/scroll-to-top-button";
import { groupByParent, collectDescendantIds, type AdministrativeUnit } from "@/lib/administrative-units";
import { canEditImage, canDeleteImage } from "@/lib/authorization";
import { resolveTargetLevel, resolveImageColor, FALLBACK_MARKER_COLOR } from "@/lib/image-map-colors";
import { cn } from "@/lib/utils";
import { showAppAlert } from "@/lib/app-alert";
import type { StandortRef } from "@/lib/standort";
import type { Region, RegionAdministrativeUnitLink } from "@/lib/regions";
import type { UserTagEntry } from "@/db/schema";
import type { AccountMenuUser } from "@/components/account-menu";
import { StandortFilter } from "./standort-filter";
import {
  searchImages,
  searchImageLocations,
  countImageLocations,
  addUserTag,
  removeUserTag,
  toggleFavorite,
  getImageById,
  recordAnonymousImageView,
  type ImageSearchRow,
  type ImageSortBy,
  type ImageLocation,
} from "./actions";

// "all" bleibt bewusst kein serverseitig übertragener Wert (siehe
// SearchImagesInput.favoritesOnly: "yes" | "no" | undefined) — "all" heißt
// clientseitig "keinen favoritesOnly-Parameter mitschicken", analog dazu,
// wie ein leerer hashQuery/locationQuery-String keinen Filter auslöst.
type FavoritesFilter = "all" | "yes" | "no";

const FAVORITES_FILTER_OPTIONS: { value: FavoritesFilter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "yes", label: "Nur Favoriten" },
  { value: "no", label: "Keine Favoriten" },
];

const DEBOUNCE_MS = 250;
const SKELETON_COUNT = 8;

// "ranking" bleibt in ImageSortBy/actions.ts erhalten (serverseitig weiter
// nutzbar), ist hier aber vorerst nicht auswählbar — auf Wunsch des Users
// geht es aktuell nur um Adresse auf-/absteigend.
const SORT_OPTIONS: { value: ImageSortBy; label: string }[] = [
  { value: "address-asc", label: "Ort (A-Z)" },
  { value: "address-desc", label: "Ort (Z-A)" },
];

function resolveStandortName(
  standort: StandortRef | null,
  units: AdministrativeUnit[],
  regions: Region[]
): string | null {
  if (!standort) return null;
  if (standort.type === "unit") return units.find((unit) => unit.id === standort.id)?.name ?? null;
  return regions.find((region) => region.id === standort.id)?.name ?? null;
}

export function ImagesPageClient({
  units,
  regions,
  regionLinks,
  initialStandort,
  initialRows,
  initialHasMore,
  initialTotal,
  user,
  mapMarkerWarningThreshold,
  mapMarkerHardLimit,
  initialMapMarkerCount,
}: {
  units: AdministrativeUnit[];
  regions: Region[];
  regionLinks: RegionAdministrativeUnitLink[];
  initialStandort: StandortRef | null;
  initialRows: ImageSearchRow[];
  initialHasMore: boolean;
  initialTotal: number;
  user: AccountMenuUser | null;
  /** Siehe settings-registry.ts (map_marker_warning_threshold/
   * map_marker_hard_limit) — steuert den "Karte"-Umschalter unten. */
  mapMarkerWarningThreshold: number;
  mapMarkerHardLimit: number;
  initialMapMarkerCount: number;
}) {
  const byParent = useMemo(() => groupByParent(units), [units]);
  const router = useRouter();

  const [standort, setStandort] = useState<StandortRef | null>(initialStandort);
  const [locationQuery, setLocationQuery] = useState("");
  const [tagsQuery, setTagsQuery] = useState("");
  const [hashQuery, setHashQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState<FavoritesFilter>("all");
  const [sortBy, setSortBy] = useState<ImageSortBy>("address-asc");
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const [mapLocations, setMapLocations] = useState<ImageLocation[]>([]);
  // Trefferzahl für die Kartenansicht (Bilder MIT Koordinaten, siehe
  // countImageLocations) — anders als mapLocations NICHT lazy, sondern bei
  // jeder Filteränderung aktualisiert (siehe runMarkerCountCheck unten),
  // da der "Karte"-Button-Zustand (Warnung/Sperre) schon in der
  // Grid-Ansicht korrekt sein muss, bevor überhaupt umgeschaltet wird.
  const [mapMarkerCount, setMapMarkerCount] = useState(initialMapMarkerCount);
  const [isMapWarningDialogOpen, setIsMapWarningDialogOpen] = useState(false);
  // Erklärender Hinweis, wenn die Obergrenze überschritten ist (siehe
  // isMapBlocked unten) — der Button selbst bleibt klickbar, nur der
  // Wechsel bleibt aus, siehe Kommentar am Button.
  const [isMapBlockedDialogOpen, setIsMapBlockedDialogOpen] = useState(false);
  // Bild, dessen Standort-Punkt (siehe image-map-dot.tsx) zuletzt angeklickt
  // wurde — nur gesetzt, wenn der Wechsel zur Karte darüber ausgelöst wurde,
  // steuert dort die "fancy" Marker-Hervorhebung (siehe highlightedId in
  // images-map-view.tsx). Der normale Grid/Karte-Umschalt-Button setzt es
  // NICHT — ein "einfacher" Wechsel zeigt die Karte ohne Hervorhebung.
  const [highlightedImageId, setHighlightedImageId] = useState<string | null>(null);
  const [rows, setRows] = useState(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [total, setTotal] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  // Nur für append (Infinite Scroll) getrennt vom generellen isLoading
  // getrackt: bei einer neuen Suche (Filter/Sortierung/Standort, offset 0)
  // werden die Zeilen ersetzt, Skeletons darunter würden dort keinen Sinn
  // ergeben — nur beim Nachladen ist "ein paar Kacheln mehr am Ende" richtig.
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Nur die id, nicht die ganze Zeile — editRow wird unten (wie previewRow)
  // live aus rows abgeleitet, damit ein im Dialog hinzugefügter/entfernter
  // User-Tag dort sofort sichtbar wird, ohne manuelle Synchronisation.
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ImageSearchRow | null>(null);
  // Nur die id, nicht die ganze Zeile — previewRow wird unten live aus rows
  // abgeleitet, damit das Popup automatisch verschwindet, sobald die Zeile
  // durch Löschen aus rows fällt, und nach Edit/Tag-Änderungen sofort den
  // aktuellen Stand zeigt, ohne manuelle Synchronisation.
  const [previewId, setPreviewId] = useState<string | null>(null);
  // Prev/Next im Preview ergeben nur Sinn, wenn man sich vorher tatsächlich
  // durch die Grid-Reihenfolge bewegt hat — bei einem über die Karte
  // geöffneten Bild ist die rows-Position bestenfalls zufällig (ein
  // Kartenbild, das noch nicht in rows steht, hat dort sogar gar keine
  // Position, siehe externalRowsById), "Weiter" würde dann zu einem
  // thematisch beliebigen Bild springen. Wird bei jedem Preview-Öffnen neu
  // gesetzt (Grid-Klick → false, Kartenklick → true).
  const [previewOpenedFromMap, setPreviewOpenedFromMap] = useState(false);
  // Per Kartenklick per getImageById nachgeladene Bilder, die (noch) nicht
  // in rows stehen (siehe handleSelectMapImage) — bewusst NICHT in rows
  // eingefügt, das hätte in der eigentlich sortierten/paginierten Liste eine
  // Lücke bzw. einen Sprung erzeugt (auf Wunsch des Users). Preview,
  // Bearbeiten- und Tag/Favorit-Aktionen fallen für diese Zeilen auf diesen
  // State zurück (siehe findRowAnywhere/updateRowAnywhere), damit sie
  // trotzdem funktionieren, obwohl das Bild in der Kachel-Ansicht nicht
  // sichtbar ist. AKKUMULIEREND (nicht nur das zuletzt geklickte Bild) —
  // ein früherer Einzelplatz-Stand wurde beim nächsten Kartenklick auf ein
  // ANDERES, ebenfalls nicht in rows stehendes Bild überschrieben, wodurch
  // eine zuvor über das große Preview vorgenommene Bearbeitung verloren
  // ging (vom User gemeldet: nach Zwischenklick auf einen anderen Kreis
  // zeigte der ursprüngliche wieder die alten Daten). Bleibt wie der
  // Karten-eigene detailsById-Cache (images-map-view.tsx) für die gesamte
  // Sitzung bestehen.
  const [externalRowsById, setExternalRowsById] = useState<ReadonlyMap<string, ImageSearchRow>>(new globalThis.Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  // Zuletzt einzeln (de-)markiertes Bild — Anker für Shift-Klick-Bereiche.
  // Bewegt sich bei einem Shift-Klick selbst NICHT (Standard-Verhalten:
  // mehrfaches Shift-Klicken passt den Bereichs-Endpunkt an, ohne den
  // Startpunkt zu verlieren).
  const lastSelectedIndexRef = useRef<number | null>(null);

  // Verwirft veraltete Antworten, falls eine spätere Anfrage (z.B. durch
  // schnelles Weitertippen) früher zurückkommt als eine ältere.
  const requestSeq = useRef(0);
  // Eigener Zähler für die Karten-Abfrage — unabhängiger Request-Strom als
  // das Grid (andere Server Action, andere Antwortzeiten).
  const mapRequestSeq = useRef(0);

  const runSearch = useCallback(
    async (
      nextStandort: StandortRef | null,
      nextLocationQuery: string,
      nextTagsQuery: string,
      nextHashQuery: string,
      nextFavoritesOnly: FavoritesFilter,
      offset: number,
      append: boolean,
      nextSortBy: ImageSortBy
    ) => {
      const seq = ++requestSeq.current;
      setIsLoading(true);
      if (append) setIsLoadingMore(true);
      const result = await searchImages({
        administrativeUnitIds:
          nextStandort?.type === "unit" ? collectDescendantIds(nextStandort.id, byParent) : undefined,
        regionId: nextStandort?.type === "region" ? nextStandort.id : undefined,
        locationQuery: nextLocationQuery,
        tagsQuery: nextTagsQuery,
        hashQuery: nextHashQuery,
        favoritesOnly: nextFavoritesOnly === "all" ? undefined : nextFavoritesOnly,
        offset,
        sortBy: nextSortBy,
      });
      if (seq !== requestSeq.current) return;
      setRows((prev) => (append ? [...prev, ...result.rows] : result.rows));
      setHasMore(result.hasMore);
      setTotal(result.total);
      setIsLoading(false);
      setIsLoadingMore(false);
      // Eine neue (nicht angehängte) Suche ersetzt die Ergebnismenge komplett
      // — eine bestehende Auswahl könnte auf ids zeigen, die gar nicht mehr
      // in der Liste sind.
      if (!append) {
        setSelectedIds(new Set());
        lastSelectedIndexRef.current = null;
      }
    },
    [byParent]
  );

  // Lädt ALLE zum Filter passenden Bilder mit Koordinaten für die
  // Kartenansicht — bewusst ohne Pagination (anders als runSearch), damit
  // Zoom/Center-Fit auf der Karte die vollständige Treffermenge sieht.
  // Nur aufgerufen, während viewMode === "map" ist (siehe Aufrufer unten) —
  // dasselbe Lazy-Prinzip wie das verzögerte Laden des Maps-Scripts selbst.
  const runMapSearch = useCallback(
    async (
      nextStandort: StandortRef | null,
      nextLocationQuery: string,
      nextTagsQuery: string,
      nextHashQuery: string,
      nextFavoritesOnly: FavoritesFilter
    ) => {
      const seq = ++mapRequestSeq.current;
      const result = await searchImageLocations({
        administrativeUnitIds:
          nextStandort?.type === "unit" ? collectDescendantIds(nextStandort.id, byParent) : undefined,
        regionId: nextStandort?.type === "region" ? nextStandort.id : undefined,
        locationQuery: nextLocationQuery,
        tagsQuery: nextTagsQuery,
        hashQuery: nextHashQuery,
        favoritesOnly: nextFavoritesOnly === "all" ? undefined : nextFavoritesOnly,
        offset: 0,
      });
      if (seq !== mapRequestSeq.current) return;
      setMapLocations(result);
    },
    [byParent]
  );

  // Aktualisiert mapMarkerCount für den "Karte"-Button (Warnung/Sperre,
  // siehe mapMarkerWarningThreshold/mapMarkerHardLimit) — anders als
  // runMapSearch NICHT auf viewMode === "map" beschränkt: der Button muss
  // schon in der Grid-Ansicht wissen, ob der Wechsel erlaubt ist, BEVOR
  // draufgeklickt wird.
  const markerCountRequestSeq = useRef(0);
  const runMarkerCountCheck = useCallback(
    async (
      nextStandort: StandortRef | null,
      nextLocationQuery: string,
      nextTagsQuery: string,
      nextHashQuery: string,
      nextFavoritesOnly: FavoritesFilter
    ) => {
      const seq = ++markerCountRequestSeq.current;
      const result = await countImageLocations({
        administrativeUnitIds:
          nextStandort?.type === "unit" ? collectDescendantIds(nextStandort.id, byParent) : undefined,
        regionId: nextStandort?.type === "region" ? nextStandort.id : undefined,
        locationQuery: nextLocationQuery,
        tagsQuery: nextTagsQuery,
        hashQuery: nextHashQuery,
        favoritesOnly: nextFavoritesOnly === "all" ? undefined : nextFavoritesOnly,
        offset: 0,
      });
      if (seq !== markerCountRequestSeq.current) return;
      setMapMarkerCount(result);
    },
    [byParent]
  );

  function handleStandortChange(next: StandortRef | null) {
    setStandort(next);
    void runSearch(next, locationQuery, tagsQuery, hashQuery, favoritesOnly, 0, false, sortBy);
    if (viewMode === "map") void runMapSearch(next, locationQuery, tagsQuery, hashQuery, favoritesOnly);
    void runMarkerCountCheck(next, locationQuery, tagsQuery, hashQuery, favoritesOnly);
  }

  // Diskrete Auswahl statt Texteingabe: löst wie handleStandortChange sofort
  // eine neue Suche aus, nicht debounced.
  function handleSortChange(next: ImageSortBy) {
    setSortBy(next);
    void runSearch(standort, locationQuery, tagsQuery, hashQuery, favoritesOnly, 0, false, next);
  }

  // Diskrete Auswahl statt Texteingabe: löst wie handleStandortChange/
  // handleSortChange sofort eine neue Suche aus, nicht debounced.
  function handleFavoritesOnlyChange(next: FavoritesFilter) {
    setFavoritesOnly(next);
    void runSearch(standort, locationQuery, tagsQuery, hashQuery, next, 0, false, sortBy);
    if (viewMode === "map") void runMapSearch(standort, locationQuery, tagsQuery, hashQuery, next);
    void runMarkerCountCheck(standort, locationQuery, tagsQuery, hashQuery, next);
  }

  // Text-Filter: bei jedem Tastendruck, debounced. Der erste Durchlauf nach
  // dem Mount wird übersprungen — initialRows kommt bereits vom Server.
  const skippedFirstRun = useRef(false);
  useEffect(() => {
    if (!skippedFirstRun.current) {
      skippedFirstRun.current = true;
      return;
    }
    const timeout = setTimeout(() => {
      void runSearch(standort, locationQuery, tagsQuery, hashQuery, favoritesOnly, 0, false, sortBy);
      if (viewMode === "map") void runMapSearch(standort, locationQuery, tagsQuery, hashQuery, favoritesOnly);
      void runMarkerCountCheck(standort, locationQuery, tagsQuery, hashQuery, favoritesOnly);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // standort/sortBy/favoritesOnly/runSearch bewusst nicht in den deps:
    // Standort-/Sortier-/Favoriten-Änderungen laufen sofort über
    // handleStandortChange/handleSortChange/handleFavoritesOnlyChange,
    // nicht debounced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationQuery, tagsQuery, hashQuery]);

  const handleLoadMore = useCallback(() => {
    void runSearch(standort, locationQuery, tagsQuery, hashQuery, favoritesOnly, rows.length, true, sortBy);
  }, [runSearch, standort, locationQuery, tagsQuery, hashQuery, favoritesOnly, sortBy, rows.length]);

  // Lädt automatisch nach, sobald der Sentinel unterhalb des Grids in Sicht
  // kommt — rootMargin sorgt dafür, dass schon vor dem exakten Erreichen des
  // unteren Rands nachgeladen wird, statt erst wenn er sichtbar ist.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) handleLoadMore();
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
    // viewMode bewusst mit in den Deps: der Sentinel wird nur gerendert,
    // während viewMode "grid" ist (siehe unten), verschwindet also beim
    // Wechsel zur Karte komplett aus dem DOM und wird beim Rücksprung als
    // NEUER Knoten neu gemountet. Ohne viewMode hier würde dieser Effekt
    // nach einem Kartenausflug nie erneut laufen (hasMore/isLoading/
    // handleLoadMore ändern sich dabei ja nicht zwangsläufig) — der neue
    // Sentinel bliebe dauerhaft unbeobachtet, automatisches Nachladen wäre
    // nach dem Rücksprung stumm kaputt.
  }, [hasMore, isLoading, handleLoadMore, viewMode]);

  // Rücksprung von der Karte zur Kachel-Ansicht: wurde highlightedImageId
  // durch einen Kartenklick gesetzt (siehe handleSelectMapImage), springt
  // das Grid beim Wechsel auf viewMode "grid" automatisch zu dieser Kachel
  // und hebt sie kurz hervor — aber NUR, wenn sie tatsächlich schon geladen
  // ist. Ein Kartenklick fügt ein noch nicht geladenes Bild bewusst NICHT in
  // rows ein (siehe handleSelectMapImage), der Fall unten ("Kachel nicht
  // gefunden") ist dafür also der normale, nicht nur ein Rand-Fall. Rein
  // imperativ über das ohnehin vorhandene data-testid jeder Kachel
  // (image-thumbnail-${id}) statt einer neuen Ref-Prop-Kette durch
  // ImageGrid/ImageThumbnailCard — outline-4 outline-primary statt ring-*,
  // dieselbe Konvention wie der Preview-Bildrahmen (outline wird nicht vom
  // overflow-hidden der Kachel beschnitten, siehe image-preview-popup.tsx).
  useEffect(() => {
    if (viewMode !== "grid" || !highlightedImageId) return;
    const el = document.querySelector<HTMLElement>(`[data-testid="image-thumbnail-${highlightedImageId}"]`);
    if (!el) {
      // Kachel (noch) nicht geladen oder aktuell herausgefiltert — nichts
      // zum Anspringen, Markierung wieder verwerfen statt sie hängen zu
      // lassen.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHighlightedImageId(null);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("outline-4", "outline-primary");
    const timeout = setTimeout(() => {
      el.classList.remove("outline-4", "outline-primary");
      setHighlightedImageId(null);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [viewMode, highlightedImageId]);

  // Standort-Punkt (Kachel/Preview) angeklickt: schließt ein offenes Preview,
  // markiert das Bild auf der Karte und lädt die Kartendaten neu für den
  // aktuellen Filter — dieselbe Aktualisierung wie beim normalen Grid/Karte-
  // Button, nur zusätzlich mit gesetztem highlightedImageId.
  function handleLocateOnMap(row: ImageSearchRow) {
    setPreviewId(null);
    setHighlightedImageId(row.id);
    setViewMode("map");
    void runMapSearch(standort, locationQuery, tagsQuery, hashQuery, favoritesOnly);
  }

  // Umgekehrte Richtung: ein Kartenpunkt wurde direkt angeklickt. Öffnet
  // das Vollbild-Preview (setPreviewId) und markiert denselben Punkt auf
  // der Karte (setHighlightedImageId) — derselbe State wie bei
  // handleLocateOnMap, dadurch bekommt der angeklickte Punkt automatisch
  // denselben größeren/dunkleren/umrandeten Stil. searchImageLocations
  // liefert für Kartenpunkte bewusst nur schlanke Felder (id/lat/lng/…,
  // siehe ImageLocation) — ist das Bild nicht ohnehin schon in den lokal
  // geladenen (paginierten) rows, wird es einmalig per getImageById
  // nachgeladen. Bewusst NICHT in rows eingefügt (auf Wunsch des Users) —
  // das hätte in der sortierten/paginierten Liste eine Lücke bzw. beim
  // Nachladen einen Sortier-Sprung erzeugt. Landet stattdessen nur in
  // externalRowsById, rein für die Preview-Anzeige; die Kachel-Ansicht
  // bleibt unverändert, wie sie vor dem Kartenklick war. Bereits einmal
  // geladene Bilder werden nicht erneut gefetcht (Map-Treffer reicht) —
  // lokale Bearbeitungen halten den Eintrag ohnehin selbst aktuell (siehe
  // updateRowAnywhere/handleSaved/handleToggleFavorite).
  // Öffnet/wechselt zu einem Vollbild-Preview UND zählt das für die anonyme
  // Registrierungs-Sperre (siehe recordAnonymousImageView in actions.ts,
  // GLOBAL_SETTINGS_REGISTRY: anon_image_view_limit/-window_minutes) —
  // zentrale Stelle statt an jedem setPreviewId(id)-Aufruf einzeln (Grid-
  // Klick, Kartenklick, Weiter/Zurück im Preview selbst zählen alle
  // gleichermaßen als "ein Bild angeschaut"). No-op für eingeloggte User
  // (dort meldet recordAnonymousImageView sofort blocked: false zurück,
  // aber der Request selbst spart sich der Client hier schon). Bei
  // erreichter Grenze aktualisiert router.refresh() den Server Component-
  // Baum (images/page.tsx prüft dort serverseitig erneut) — die Seite
  // ersetzt sich dadurch sofort durch die Sperr-Karte, ohne dass der User
  // manuell neu laden muss.
  function openPreview(id: string) {
    setPreviewId(id);
    if (!user) {
      void recordAnonymousImageView().then((result) => {
        if (result.blocked) router.refresh();
      });
    }
  }

  async function handleSelectMapImage(imageId: string) {
    setHighlightedImageId(imageId);
    setPreviewOpenedFromMap(true);
    const existing = rows.find((row) => row.id === imageId);
    if (existing) {
      openPreview(existing.id);
      return;
    }
    if (externalRowsById.has(imageId)) {
      openPreview(imageId);
      return;
    }
    const fetched = await getImageById(imageId);
    if (!fetched) return;
    setExternalRowsById((prev) => new globalThis.Map(prev).set(imageId, fetched));
    openPreview(fetched.id);
  }

  // Liefert die aktuelle Zeile für eine id, egal ob sie in rows steht oder
  // nur in externalRowsById existiert (siehe handleSelectMapImage) — von
  // den Tag-/Favorit-/Bearbeiten-Handlern genutzt, damit diese Aktionen auch
  // für ein per Kartenklick geöffnetes, noch nicht geladenes Bild
  // funktionieren.
  function findRowAnywhere(id: string): ImageSearchRow | undefined {
    return rows.find((row) => row.id === id) ?? externalRowsById.get(id);
  }

  // Wendet updater auf die Zeile mit id an, egal ob sie gerade in rows oder
  // nur in externalRowsById steht (siehe findRowAnywhere).
  function updateRowAnywhere(id: string, updater: (row: ImageSearchRow) => ImageSearchRow) {
    setRows((prev) => prev.map((row) => (row.id === id ? updater(row) : row)));
    setExternalRowsById((prev) => {
      const existing = prev.get(id);
      return existing ? new globalThis.Map(prev).set(id, updater(existing)) : prev;
    });
  }

  function handleDeleted(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
    setExternalRowsById((prev) => {
      if (!prev.has(id)) return prev;
      const next = new globalThis.Map(prev);
      next.delete(id);
      return next;
    });
    setTotal((prev) => prev - 1);
    setDeleteTarget(null);
  }

  function handleSaved(updated: ImageSearchRow) {
    setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    setExternalRowsById((prev) => (prev.has(updated.id) ? new globalThis.Map(prev).set(updated.id, updated) : prev));
    setEditId(null);
  }

  // Shift-Klick (isRangeSelect) markiert den Bereich seit dem zuletzt einzeln
  // (de-)markierten Bild bis zum jetzt geklickten — wie in Dateimanagern
  // üblich. Nur Bilder, die der User überhaupt löschen darf, werden dabei
  // aufgenommen (nur die haben eine sichtbare Checkbox, siehe ImageGrid).
  function handleToggleSelect(id: string, index: number, isRangeSelect: boolean) {
    if (isRangeSelect && lastSelectedIndexRef.current !== null) {
      const [start, end] = [lastSelectedIndexRef.current, index].sort((a, b) => a - b);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          const candidate = rows[i];
          if (
            candidate &&
            canDeleteImage({ actingUserId: user?.id, actingRole: user?.role, imageUploadedBy: candidate.uploadedBy })
          ) {
            next.add(candidate.id);
          }
        }
        return next;
      });
      return;
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastSelectedIndexRef.current = index;
  }

  function handleBulkDeleted(deletedIds: string[]) {
    const deleted = new Set(deletedIds);
    setRows((prev) => prev.filter((row) => !deleted.has(row.id)));
    setTotal((prev) => prev - deletedIds.length);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of deletedIds) next.delete(id);
      return next;
    });
    setIsBulkDeleteOpen(false);
    // Indizes verschieben sich, sobald Zeilen entfernt werden — der alte
    // Shift-Anker würde sonst auf ein anderes Bild zeigen.
    lastSelectedIndexRef.current = null;
  }

  // Optimistisch: Tag erscheint sofort, wird bei Serverfehler wieder entfernt
  // (Berechtigung/Owner wird server-seitig ohnehin erneut geprüft, siehe
  // addUserTag in actions.ts — hier nur UI-Feedback). updateRowAnywhere statt
  // direktem setRows, damit das auch für ein per Kartenklick geöffnetes,
  // noch nicht geladenes Bild funktioniert (siehe externalRowsById).
  async function handleAddUserTag(imageId: string, tag: string) {
    if (!user?.id) return;
    const optimisticEntry: UserTagEntry = { tag, addedBy: user.id };
    updateRowAnywhere(imageId, (row) => ({ ...row, userTags: [...row.userTags, optimisticEntry] }));

    const result = await addUserTag(imageId, tag);
    if (!result.success || !result.userTags) {
      updateRowAnywhere(imageId, (row) => ({
        ...row,
        userTags: row.userTags.filter((entry) => entry !== optimisticEntry),
      }));
      showAppAlert(result.error ?? "Tag konnte nicht hinzugefügt werden.");
      return;
    }
    const confirmedTags = result.userTags;
    updateRowAnywhere(imageId, (row) => ({ ...row, userTags: confirmedTags }));
  }

  async function handleRemoveUserTag(imageId: string, tag: string, addedBy: string | null) {
    const removedEntry = findRowAnywhere(imageId)?.userTags.find(
      (entry) => entry.tag === tag && entry.addedBy === addedBy
    );
    updateRowAnywhere(imageId, (row) => ({
      ...row,
      userTags: row.userTags.filter((entry) => !(entry.tag === tag && entry.addedBy === addedBy)),
    }));

    const result = await removeUserTag(imageId, tag, addedBy);
    if (!result.success) {
      if (removedEntry) updateRowAnywhere(imageId, (row) => ({ ...row, userTags: [...row.userTags, removedEntry] }));
      showAppAlert(result.error ?? "Tag konnte nicht entfernt werden.");
      return;
    }
    if (result.userTags) {
      const confirmedTags = result.userTags;
      updateRowAnywhere(imageId, (row) => ({ ...row, userTags: confirmedTags }));
    }
  }

  // Optimistisch: das Herz wechselt sofort den Zustand. Erfüllt die Zeile
  // danach einen AKTIVEN favoritesOnly-Filter nicht mehr, verschwindet sie
  // sofort aus der Ergebnisliste (nicht erst nach einem Reload) — vom User
  // explizit für die Abwahl gefordert, hier aus Konsistenzgründen auch
  // symmetrisch für den umgekehrten Fall (Filter "Keine Favoriten" +
  // gerade favorisiert) umgesetzt. Die Filter-Entfernung gilt nur für rows
  // (Teil der gefilterten/gezählten Ergebnismenge) — ein Eintrag in
  // externalRowsById ist per direktem getImageById geladen, unabhängig vom
  // aktiven Filter, und wird deshalb nur aktualisiert, nie herausgefiltert.
  // stillMatchesFilter wird VOR dem setRows-Aufruf aus dem aktuellen
  // (geschlossenen) rows/favoritesOnly berechnet, nicht im Updater selbst
  // gelesen — React führt den Updater asynchron zum Rest dieser Funktion aus.
  async function handleToggleFavorite(imageId: string) {
    if (!user?.id) return;
    const rowInRows = rows.find((row) => row.id === imageId);
    const rowInExternal = externalRowsById.get(imageId);
    const currentRow = rowInRows ?? rowInExternal;
    if (!currentRow) return;
    const nextIsFavorite = !currentRow.isFavorite;
    const stillMatchesFilter =
      favoritesOnly === "all" || (favoritesOnly === "yes" ? nextIsFavorite : !nextIsFavorite);

    const previousRows = rows;
    const previousExternalRowsById = externalRowsById;
    const previousTotal = total;
    if (rowInRows) {
      setRows((prev) =>
        stillMatchesFilter
          ? prev.map((row) => (row.id === imageId ? { ...row, isFavorite: nextIsFavorite } : row))
          : prev.filter((row) => row.id !== imageId)
      );
      if (!stillMatchesFilter) setTotal((prev) => prev - 1);
    }
    if (rowInExternal) {
      setExternalRowsById((prev) => new globalThis.Map(prev).set(imageId, { ...rowInExternal, isFavorite: nextIsFavorite }));
    }

    const result = await toggleFavorite(imageId);
    if (!result.success) {
      setRows(previousRows);
      setExternalRowsById(previousExternalRowsById);
      setTotal(previousTotal);
      showAppAlert(result.error ?? "Favorit konnte nicht geändert werden.");
    }
  }

  // Tatsächlicher Wechsel zur Kartenansicht — sowohl vom direkten Klick
  // (unterhalb der Warnschwelle) als auch vom "Trotzdem wechseln"-Button
  // im Warn-Dialog aufgerufen (siehe isMapWarningDialogOpen unten).
  function openMapView() {
    setIsMapWarningDialogOpen(false);
    setHighlightedImageId(null);
    setViewMode("map");
    void runMapSearch(standort, locationQuery, tagsQuery, hashQuery, favoritesOnly);
  }

  // Siehe map_marker_warning_threshold/map_marker_hard_limit in
  // settings-registry.ts — mapMarkerCount ist die Zahl der Bilder MIT
  // Koordinaten (siehe countImageLocations/runMarkerCountCheck), nicht die
  // allgemeine Grid-Trefferzahl (total): ein Filter mit vielen Bildern ohne
  // Koordinaten soll den Kartenwechsel nicht unnötig blockieren.
  const isMapBlocked = mapMarkerCount > mapMarkerHardLimit;
  const needsMapWarning = !isMapBlocked && mapMarkerCount > mapMarkerWarningThreshold;

  const standortName = resolveStandortName(standort, units, regions);

  // Alle aktuell bekannten Zeilen, egal ob paginiert geladen (rows) oder nur
  // per Kartenklick nachgeladen (externalRowsById, siehe
  // handleSelectMapImage) — EINE gemeinsame Quelle für dotColorById unten
  // UND für die Kartenansicht (images-map-view.tsx, siehe knownRowsById-Prop
  // weiter unten): dort wird die kleine Hover-Vorschau bei Bedarf per
  // eigenem, dauerhaftem Cache nachgeladen (getImageById) — bearbeitet man
  // ein Bild über das große Preview (handleSaved/updateRowAnywhere/
  // handleToggleFavorite oben), weiß dieser Karten-Cache davon nichts und
  // zeigt sonst veraltete Werte (vom User gemeldet). Diese Lookup-Map macht
  // der Karte die hier ohnehin schon aktuellen Zeilen bekannt, damit sie
  // IMMER Vorrang vor ihrem eigenen (potenziell veralteten) Cache bekommen —
  // keine manuelle Invalidierung nötig. rows zuletzt gesetzt, damit die
  // paginierte Liste bei einer id-Überschneidung mit externalRowsById immer
  // gewinnt (die eigentliche Quelle der Wahrheit für geladene Bilder).
  const rowsById = useMemo(() => {
    // globalThis.Map statt Map: "Map" ist in dieser Datei bereits das
    // importierte lucide-react-Icon für den Karte/Grid-Umschalt-Button,
    // würde den globalen Map-Konstruktor sonst verdecken (dieselbe Falle wie
    // in images-map-view.tsx, dort mit dem @vis.gl/react-google-maps-Import).
    const map = new globalThis.Map<string, ImageSearchRow>();
    for (const row of externalRowsById.values()) map.set(row.id, row);
    for (const row of rows) map.set(row.id, row);
    return map;
  }, [rows, externalRowsById]);

  // Dieselbe Farbe wie der zugehörige Karten-Marker (siehe
  // resolveTargetLevel/resolveImageColor in image-map-colors.ts) für den
  // Standort-Punkt auf jeder Kachel/im Preview — einmal pro rowsById-Änderung
  // berechnet statt pro Kachel neu, da targetLevel/unitsById/regionsById für
  // alle Zeilen gleich sind. Iteriert über rowsById (siehe oben) statt einer
  // eigenen rows/externalRowsById-Kombination — sonst fehlt einem per
  // Kartenklick nachgeladenen, noch nicht in rows stehenden Bild sein
  // Eintrag hier, und das große Preview zeigt für dessen Standort-Punkt
  // fälschlich die Fallback-Farbe statt der tatsächlichen (die der
  // Karten-Marker selbst ja bereits korrekt anzeigt).
  const dotColorById = useMemo(() => {
    const targetLevel = resolveTargetLevel(standort, units, regions);
    const unitsById = new globalThis.Map(units.map((unit) => [unit.id, unit]));
    const regionsById = new globalThis.Map(regions.map((region) => [region.id, region]));
    const colorById = new globalThis.Map<string, string>();
    for (const row of rowsById.values()) {
      const color = resolveImageColor(
        { administrativeUnitId: row.administrativeUnitId, regionId: row.regionId },
        targetLevel,
        unitsById,
        regionsById
      );
      colorById.set(row.id, color ?? FALLBACK_MARKER_COLOR);
    }
    return colorById;
  }, [rowsById, standort, units, regions]);

  const editRow = editId ? (findRowAnywhere(editId) ?? null) : null;

  const previewIndex = rows.findIndex((row) => row.id === previewId);
  const previewRow =
    previewIndex >= 0 ? rows[previewIndex] : previewId ? (externalRowsById.get(previewId) ?? null) : null;
  const previewCanEdit = previewRow
    ? canEditImage({ actingUserId: user?.id, actingRole: user?.role, imageUploadedBy: previewRow.uploadedBy })
    : false;
  const previewCanDelete = previewRow
    ? canDeleteImage({ actingUserId: user?.id, actingRole: user?.role, imageUploadedBy: previewRow.uploadedBy })
    : false;
  // Slider-Navigation läuft über die aktuell geladene (Infinite-Scroll-)
  // Liste — kein automatisches Nachladen nur fürs Blättern, dieselbe
  // pragmatische Grenze wie beim Grid selbst.
  const previewHasPrev = previewIndex > 0;
  const previewHasNext = previewIndex >= 0 && previewIndex < rows.length - 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="mt-4 flex items-center gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Images className="size-6 text-primary" />
          Bilder
        </h1>
        <span className="text-sm text-muted-foreground" data-testid="images-total-count">
          · {total.toLocaleString("de-DE")} Treffer
        </span>
        {standortName && (
          <span
            className="ml-auto truncate text-2xl font-semibold text-primary/80"
            data-testid="images-current-standort"
          >
            {standortName}
          </span>
        )}
      </div>

      <StandortFilter
        units={units}
        regions={regions}
        regionLinks={regionLinks}
        initialStandort={initialStandort}
        user={user}
        onStandortChange={handleStandortChange}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-64 flex-1">
          <MapPin className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="images-filter-location"
            placeholder="Nach Ort suchen…"
            value={locationQuery}
            onChange={(event) => setLocationQuery(event.target.value)}
            className="pl-8"
          />
        </div>
        <div className="relative max-w-64 flex-1">
          <Tag className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="images-filter-tags"
            placeholder="Nach Tags suchen…"
            value={tagsQuery}
            onChange={(event) => setTagsQuery(event.target.value)}
            className="pl-8"
          />
        </div>
        {/* Sucht in images.hash — dem User als "ID" bezeichnet (eindeutige
            Kennung zum Identifizieren/Bestellen eines Bilds, siehe
            CopyableIdBadge im Preview-Popup). */}
        <div className="relative max-w-64 flex-1">
          <Hash className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="images-filter-hash"
            placeholder="Nach ID suchen…"
            value={hashQuery}
            onChange={(event) => setHashQuery(event.target.value)}
            className="pl-8"
          />
        </div>

        {/* 3-Zustands-Filter (Alle/Nur Favoriten/Keine Favoriten) statt
            einer einfachen Checkbox — echtes "weiteres Filterkriterium" wie
            gefordert, lässt sich (wie die Text-Suchfelder bei leerer
            Eingabe) auch ganz auf "Alle" zurückstellen. DropdownMenu statt
            Input, da es kein Freitext-, sondern ein diskreter
            Auswahl-Filter ist — gleiches Muster wie der Sortier-Dropdown
            weiter unten. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            data-testid="images-filter-favorites-trigger"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
          >
            <Heart className="size-3.5" />
            {FAVORITES_FILTER_OPTIONS.find((option) => option.value === favoritesOnly)?.label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Favoriten</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {FAVORITES_FILTER_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  data-testid={`images-filter-favorites-${option.value}`}
                  onClick={() => handleFavoritesOnlyChange(option.value)}
                >
                  {option.label}
                  {favoritesOnly === option.value && <Check className="ml-auto size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-3">
          {viewMode === "grid" && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger
                  data-testid="images-sort-trigger"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                >
                  <ArrowUpDown className="size-3.5" />
                  {SORT_OPTIONS.find((option) => option.value === sortBy)?.label}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Sortierung</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    {SORT_OPTIONS.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        data-testid={`images-sort-${option.value}`}
                        onClick={() => handleSortChange(option.value)}
                      >
                        {option.label}
                        {sortBy === option.value && <Check className="ml-auto size-4" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Trennt das Sortierfeld optisch vom Ansicht-Toggle —
                  unterschiedliche Zuständigkeiten (Sortierung vs. Ansicht),
                  Sortierung ergibt bei der Kartenansicht ohnehin keinen Sinn
                  und wird dort ausgeblendet statt nur deaktiviert. */}
              <div aria-hidden="true" className="h-6 w-px bg-border" />
            </>
          )}

          {/* Ein einzelner Button statt eines Button-Paars: zeigt Icon/Label
              der Ansicht, zu der ein Klick wechselt (nicht der aktuellen) —
              spart Platz, da nur zwei Ansichten existieren und die aktuelle
              ohnehin am gerenderten Inhalt darunter erkennbar ist. */}
          {viewMode === "grid" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="images-view-toggle"
              aria-label="Zur Kartenansicht wechseln"
              // Bewusst NICHT disabled — auf Wunsch des Users soll ein
              // Klick bei zu vielen Treffern nicht wirkungslos ins Leere
              // laufen, sondern aktiv erklären, WARUM die Kartenansicht
              // gerade nicht geht (ein deaktivierter Button mit reinem
              // title-Tooltip wird auf Touch-Geräten ohnehin nie sichtbar).
              onClick={() => {
                if (isMapBlocked) {
                  setIsMapBlockedDialogOpen(true);
                  return;
                }
                if (needsMapWarning) {
                  setIsMapWarningDialogOpen(true);
                  return;
                }
                openMapView();
              }}
            >
              <Map className="size-3.5" />
              Karte
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="images-view-toggle"
              aria-label="Zur Grid-Ansicht wechseln"
              // Bewusst OHNE setHighlightedImageId(null): ein auf der Karte
              // angeklicktes Bild soll beim Rücksprung zur Kachel-Ansicht
              // dort angesprungen/hervorgehoben werden (siehe Effekt weiter
              // unten) — der wertet highlightedImageId aus und räumt danach
              // selbst auf.
              onClick={() => {
                setViewMode("grid");
              }}
            >
              <LayoutGrid className="size-3.5" />
              Grid
            </Button>
          )}
        </div>
      </div>

      {viewMode === "grid" ? (
        <ImageGrid
          rows={rows}
          user={user}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onPreview={(row) => {
            setPreviewOpenedFromMap(false);
            openPreview(row.id);
          }}
          onEdit={(row) => setEditId(row.id)}
          onDelete={setDeleteTarget}
          onAddUserTag={handleAddUserTag}
          onRemoveUserTag={handleRemoveUserTag}
          onToggleFavorite={handleToggleFavorite}
          dotColorById={dotColorById}
          onLocateOnMap={handleLocateOnMap}
        />
      ) : (
        <ImagesMapView
          locations={mapLocations}
          units={units}
          regions={regions}
          standort={standort}
          highlightedId={highlightedImageId}
          onSelectImage={handleSelectMapImage}
          isPreviewOpen={previewId !== null}
          knownRowsById={rowsById}
        />
      )}

      {viewMode === "grid" && rows.length === 0 && !isLoading && (
        <p className="text-center text-sm text-muted-foreground" data-testid="images-empty">
          Keine Bilder gefunden.
        </p>
      )}

      {viewMode === "grid" && hasMore && (
        <div ref={sentinelRef} data-testid="images-load-more-sentinel" className="h-1" />
      )}

      {viewMode === "grid" &&
        (isLoadingMore ? (
          <div
            className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-1"
            data-testid="images-loading-skeleton"
          >
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <div key={index} className="aspect-[4/3] animate-pulse rounded-md bg-card" />
            ))}
          </div>
        ) : (
          isLoading && <p className="text-center text-sm text-muted-foreground">Lädt…</p>
        ))}

      <ImageEditDialog
        row={editRow}
        canManagePrintFields={user?.role === "super_admin"}
        currentUser={user}
        onOpenChange={(open) => !open && setEditId(null)}
        onSaved={handleSaved}
        onAddUserTag={(tag) => editRow && handleAddUserTag(editRow.id, tag)}
        onRemoveUserTag={(tag, addedBy) => editRow && handleRemoveUserTag(editRow.id, tag, addedBy)}
      />
      <ImageDeleteDialog
        row={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDeleted={handleDeleted}
      />
      <ImagePreviewPopup
        row={previewRow}
        canEdit={previewCanEdit}
        canDelete={previewCanDelete}
        currentUser={user}
        onOpenChange={(open) => !open && setPreviewId(null)}
        onEdit={(row) => setEditId(row.id)}
        onDelete={setDeleteTarget}
        onAddUserTag={(tag) => previewRow && handleAddUserTag(previewRow.id, tag)}
        onRemoveUserTag={(tag, addedBy) => previewRow && handleRemoveUserTag(previewRow.id, tag, addedBy)}
        onToggleFavorite={() => previewRow && handleToggleFavorite(previewRow.id)}
        onPrev={!previewOpenedFromMap && previewHasPrev ? () => openPreview(rows[previewIndex - 1].id) : undefined}
        onNext={!previewOpenedFromMap && previewHasNext ? () => openPreview(rows[previewIndex + 1].id) : undefined}
        dotColor={previewRow ? (dotColorById.get(previewRow.id) ?? FALLBACK_MARKER_COLOR) : FALLBACK_MARKER_COLOR}
        onLocateOnMap={handleLocateOnMap}
      />
      <BulkDeleteDialog
        ids={isBulkDeleteOpen ? Array.from(selectedIds) : []}
        onOpenChange={(open) => !open && setIsBulkDeleteOpen(false)}
        onDeleted={handleBulkDeleted}
      />
      {/* Warnung vor dem Kartenwechsel bei vielen Markern (siehe
          mapMarkerWarningThreshold in settings-registry.ts) — Wechsel
          bleibt möglich, "Trotzdem wechseln" ruft openMapView() genauso
          auf wie ein direkter Klick unterhalb der Warnschwelle. */}
      <AlertDialog open={isMapWarningDialogOpen} onOpenChange={setIsMapWarningDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Viele Bilder auf der Karte</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser Filter zeigt {mapMarkerCount} Bilder mit Standort. Bei so vielen Markern kann die
              Kartenansicht anfangen zu flackern. Trotzdem wechseln?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction data-testid="images-map-warning-continue" onClick={openMapView}>
              Trotzdem wechseln
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Erklärender Hinweis statt eines stumm deaktivierten Buttons, wenn
          die Obergrenze überschritten ist (siehe mapMarkerHardLimit in
          settings-registry.ts) — kein "Trotzdem"-Ausweg, die Kartenansicht
          bleibt hier bewusst gesperrt, nur der Grund wird erklärt. */}
      <AlertDialog open={isMapBlockedDialogOpen} onOpenChange={setIsMapBlockedDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kartenansicht nicht möglich</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser Filter zeigt {mapMarkerCount} Bilder mit Standort — das liegt über der Obergrenze von{" "}
              {mapMarkerHardLimit} für die Kartenansicht. Bei so vielen Markern würde die Karte kaum noch
              nutzbar sein. Bitte den Filter weiter eingrenzen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* AlertDialogAction ist (anders als AlertDialogCancel) nur ein
                normaler Button, kein Close-Primitive — schließt ohne
                explizites onClick nicht von selbst (per Diagnose bestätigt:
                der Button reagierte auf Klicks sichtbar gar nicht). */}
            <AlertDialogAction
              data-testid="images-map-blocked-acknowledge"
              onClick={() => setIsMapBlockedDialogOpen(false)}
            >
              Verstanden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/20 bg-popover/90 px-4 py-2 shadow-lg backdrop-blur-md"
          data-testid="images-bulk-bar"
        >
          <span className="text-sm font-medium">{selectedIds.size} ausgewählt</span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            // Die Standard-destructive-Variante (kräftiges, gesättigtes Rot)
            // wirkte auf dieser schwebenden Glas-Pille — umgeben vom warmen
            // Coral-Akzent (border-primary/20, Badges etc.) — wie ein
            // Fremdkörper. bg-primary färbt die Fläche in denselben
            // Coral-Ton wie der Rest der Leiste, text-destructive bleibt als
            // Gefahren-Signal (Rot) erhalten — dieselbe "coral-fläche +
            // roter Akzent"-Kombination wie die Badges auf der Kachel, nur
            // mit Rot statt Primary als Textfarbe. Kein eigener Rand (auf
            // Wunsch des Users) — die Fläche grenzt sich allein über die
            // Coral-Füllung von der dunklen Glas-Pille ab. Die
            // dark:bg-destructive/*-Klassen aus der Basisvariante müssen
            // explizit mit dark:-Präfix überschrieben werden — ein
            // unpräfixiertes bg-primary/15 verdrängt ein dark:bg-destructive/20
            // NICHT (unterschiedliche Modifier-Gruppen für tailwind-merge),
            // die App läuft aber standardmäßig im Dark Mode.
            className="border-transparent bg-primary/15 text-destructive hover:bg-primary/25 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-primary/15 dark:hover:bg-primary/25 dark:focus-visible:ring-destructive/40"
            data-testid="images-bulk-delete"
            onClick={() => setIsBulkDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            Löschen
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Auswahl aufheben"
            data-testid="images-bulk-clear"
            onClick={() => {
              setSelectedIds(new Set());
              lastSelectedIndexRef.current = null;
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <ScrollToTopButton />
    </div>
  );
}
