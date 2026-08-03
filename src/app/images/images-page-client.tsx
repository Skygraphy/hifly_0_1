"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Check, Images, LayoutGrid, Map, MapPin, Tag, Trash2, X } from "lucide-react";
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
import type { StandortRef } from "@/lib/standort";
import type { Region, RegionAdministrativeUnitLink } from "@/lib/regions";
import type { UserTagEntry } from "@/db/schema";
import type { AccountMenuUser } from "@/components/account-menu";
import { StandortFilter } from "./standort-filter";
import {
  searchImages,
  searchImageLocations,
  addUserTag,
  removeUserTag,
  type ImageSearchRow,
  type ImageSortBy,
  type ImageLocation,
} from "./actions";

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
}: {
  units: AdministrativeUnit[];
  regions: Region[];
  regionLinks: RegionAdministrativeUnitLink[];
  initialStandort: StandortRef | null;
  initialRows: ImageSearchRow[];
  initialHasMore: boolean;
  initialTotal: number;
  user: AccountMenuUser | null;
}) {
  const byParent = useMemo(() => groupByParent(units), [units]);

  const [standort, setStandort] = useState<StandortRef | null>(initialStandort);
  const [locationQuery, setLocationQuery] = useState("");
  const [tagsQuery, setTagsQuery] = useState("");
  const [sortBy, setSortBy] = useState<ImageSortBy>("address-asc");
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const [mapLocations, setMapLocations] = useState<ImageLocation[]>([]);
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
    async (nextStandort: StandortRef | null, nextLocationQuery: string, nextTagsQuery: string) => {
      const seq = ++mapRequestSeq.current;
      const result = await searchImageLocations({
        administrativeUnitIds:
          nextStandort?.type === "unit" ? collectDescendantIds(nextStandort.id, byParent) : undefined,
        regionId: nextStandort?.type === "region" ? nextStandort.id : undefined,
        locationQuery: nextLocationQuery,
        tagsQuery: nextTagsQuery,
        offset: 0,
      });
      if (seq !== mapRequestSeq.current) return;
      setMapLocations(result);
    },
    [byParent]
  );

  function handleStandortChange(next: StandortRef | null) {
    setStandort(next);
    void runSearch(next, locationQuery, tagsQuery, 0, false, sortBy);
    if (viewMode === "map") void runMapSearch(next, locationQuery, tagsQuery);
  }

  // Diskrete Auswahl statt Texteingabe: löst wie handleStandortChange sofort
  // eine neue Suche aus, nicht debounced.
  function handleSortChange(next: ImageSortBy) {
    setSortBy(next);
    void runSearch(standort, locationQuery, tagsQuery, 0, false, next);
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
      void runSearch(standort, locationQuery, tagsQuery, 0, false, sortBy);
      if (viewMode === "map") void runMapSearch(standort, locationQuery, tagsQuery);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // standort/sortBy/runSearch bewusst nicht in den deps: Standort- und
    // Sortier-Änderungen laufen sofort über handleStandortChange/
    // handleSortChange, nicht debounced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationQuery, tagsQuery]);

  const handleLoadMore = useCallback(() => {
    void runSearch(standort, locationQuery, tagsQuery, rows.length, true, sortBy);
  }, [runSearch, standort, locationQuery, tagsQuery, rows.length, sortBy]);

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
  }, [hasMore, isLoading, handleLoadMore]);

  // Standort-Punkt (Kachel/Preview) angeklickt: schließt ein offenes Preview,
  // markiert das Bild auf der Karte und lädt die Kartendaten neu für den
  // aktuellen Filter — dieselbe Aktualisierung wie beim normalen Grid/Karte-
  // Button, nur zusätzlich mit gesetztem highlightedImageId.
  function handleLocateOnMap(row: ImageSearchRow) {
    setPreviewId(null);
    setHighlightedImageId(row.id);
    setViewMode("map");
    void runMapSearch(standort, locationQuery, tagsQuery);
  }

  function handleDeleted(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
    setTotal((prev) => prev - 1);
    setDeleteTarget(null);
  }

  function handleSaved(updated: ImageSearchRow) {
    setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
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
  // addUserTag in actions.ts — hier nur UI-Feedback).
  async function handleAddUserTag(imageId: string, tag: string) {
    if (!user?.id) return;
    const optimisticEntry: UserTagEntry = { tag, addedBy: user.id };
    setRows((prev) =>
      prev.map((row) => (row.id === imageId ? { ...row, userTags: [...row.userTags, optimisticEntry] } : row))
    );

    const result = await addUserTag(imageId, tag);
    if (!result.success || !result.userTags) {
      setRows((prev) =>
        prev.map((row) =>
          row.id === imageId ? { ...row, userTags: row.userTags.filter((entry) => entry !== optimisticEntry) } : row
        )
      );
      alert(result.error ?? "Tag konnte nicht hinzugefügt werden.");
      return;
    }
    const confirmedTags = result.userTags;
    setRows((prev) => prev.map((row) => (row.id === imageId ? { ...row, userTags: confirmedTags } : row)));
  }

  async function handleRemoveUserTag(imageId: string, tag: string, addedBy: string | null) {
    let removedEntry: UserTagEntry | undefined;
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== imageId) return row;
        removedEntry = row.userTags.find((entry) => entry.tag === tag && entry.addedBy === addedBy);
        return { ...row, userTags: row.userTags.filter((entry) => !(entry.tag === tag && entry.addedBy === addedBy)) };
      })
    );

    const result = await removeUserTag(imageId, tag, addedBy);
    if (!result.success) {
      setRows((prev) =>
        prev.map((row) => (row.id === imageId && removedEntry ? { ...row, userTags: [...row.userTags, removedEntry] } : row))
      );
      alert(result.error ?? "Tag konnte nicht entfernt werden.");
      return;
    }
    if (result.userTags) {
      const confirmedTags = result.userTags;
      setRows((prev) => prev.map((row) => (row.id === imageId ? { ...row, userTags: confirmedTags } : row)));
    }
  }

  const standortName = resolveStandortName(standort, units, regions);

  // Dieselbe Farbe wie der zugehörige Karten-Marker (siehe
  // resolveTargetLevel/resolveImageColor in image-map-colors.ts) für den
  // Standort-Punkt auf jeder Kachel/im Preview — einmal pro rows-Änderung
  // berechnet statt pro Kachel neu, da targetLevel/unitsById/regionsById für
  // alle Zeilen gleich sind.
  const dotColorById = useMemo(() => {
    const targetLevel = resolveTargetLevel(standort, units, regions);
    // globalThis.Map statt Map: "Map" ist in dieser Datei bereits das
    // importierte lucide-react-Icon für den Karte/Grid-Umschalt-Button,
    // würde den globalen Map-Konstruktor sonst verdecken (dieselbe Falle wie
    // in images-map-view.tsx, dort mit dem @vis.gl/react-google-maps-Import).
    const unitsById = new globalThis.Map(units.map((unit) => [unit.id, unit]));
    const regionsById = new globalThis.Map(regions.map((region) => [region.id, region]));
    const colorById = new globalThis.Map<string, string>();
    for (const row of rows) {
      const color = resolveImageColor(
        { administrativeUnitId: row.administrativeUnitId, regionId: row.regionId },
        targetLevel,
        unitsById,
        regionsById
      );
      colorById.set(row.id, color ?? FALLBACK_MARKER_COLOR);
    }
    return colorById;
  }, [rows, standort, units, regions]);

  const editRow = editId ? (rows.find((row) => row.id === editId) ?? null) : null;

  const previewIndex = rows.findIndex((row) => row.id === previewId);
  const previewRow = previewIndex >= 0 ? rows[previewIndex] : null;
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

      <div className="flex flex-wrap gap-3">
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
              onClick={() => {
                setHighlightedImageId(null);
                setViewMode("map");
                void runMapSearch(standort, locationQuery, tagsQuery);
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
              onClick={() => {
                setHighlightedImageId(null);
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
          onPreview={(row) => setPreviewId(row.id)}
          onEdit={(row) => setEditId(row.id)}
          onDelete={setDeleteTarget}
          onAddUserTag={handleAddUserTag}
          onRemoveUserTag={handleRemoveUserTag}
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
        onPrev={previewHasPrev ? () => setPreviewId(rows[previewIndex - 1].id) : undefined}
        onNext={previewHasNext ? () => setPreviewId(rows[previewIndex + 1].id) : undefined}
        dotColor={previewRow ? (dotColorById.get(previewRow.id) ?? FALLBACK_MARKER_COLOR) : FALLBACK_MARKER_COLOR}
        onLocateOnMap={handleLocateOnMap}
      />
      <BulkDeleteDialog
        ids={isBulkDeleteOpen ? Array.from(selectedIds) : []}
        onOpenChange={(open) => !open && setIsBulkDeleteOpen(false)}
        onDeleted={handleBulkDeleted}
      />

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
