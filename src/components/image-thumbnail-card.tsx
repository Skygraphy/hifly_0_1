"use client";

import { useCallback, useState, type CSSProperties, type DragEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Check, MapPin, Pencil, Plus, Signpost, Tag as TagIcon, Tags as UserTagsIcon, Trash2, X } from "lucide-react";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageMapDot } from "@/components/image-map-dot";
import { canManageUserTag, type Role } from "@/lib/authorization";
import { useFittingCount } from "@/lib/use-fitting-count";
import { useIsTruncated } from "@/lib/use-is-truncated";
import { cn } from "@/lib/utils";
import type { ImageSearchRow } from "@/app/images/actions";

const EMPTY_PLACEHOLDER = "–";

/** Kein echter Kopierschutz (im Browser prinzipiell nicht durchsetzbar — die
 * Bytes liegen ohnehin im Netzwerk-Tab), sondern nur eine Hürde für Laien:
 * normaler Rechtsklick "Bild speichern unter", Wegziehen per Drag, und das
 * iOS-Long-Press-Menü sind damit weg. Dieselben Props auch im Vollbild-Popup
 * (image-preview-popup.tsx). */
const NO_CASUAL_DOWNLOAD_PROPS = {
  draggable: false,
  onDragStart: (event: DragEvent) => event.preventDefault(),
  onContextMenu: (event: MouseEvent) => event.preventDefault(),
  style: { WebkitTouchCallout: "none" } as CSSProperties,
} as const;

// Feste Obergrenzen statt echter Overflow-Messung: bei vielen Tags/
// Nebenorten oder langen Adressen bleibt die Info-Leiste dadurch garantiert
// auf eine Zeile pro Reihe beschränkt (kein Umbruch, kein Aufblähen über die
// Kachel hinaus) — überzählige Einträge werden als "+N"-Chip zusammengefasst.
const MAX_VISIBLE_SECONDARY_LOCATIONS = 2;
const MAX_VISIBLE_TAGS = 4;

/**
 * Der "+N"-Chip einer Zeile (Nebenadressen/Tags/User-Tags) — bei Hover ODER
 * Klick öffnet er ein Popover mit ALLEN Einträgen der Kategorie (nicht nur
 * den durch useFittingCount/MAX_VISIBLE_* abgeschnittenen), da man sonst
 * erst zwischen der Kachel-Zeile und dem Popover-Inhalt hin- und herlesen
 * müsste, um die vollständige Liste zusammenzusetzen. `openOnHover` auf dem
 * Trigger statt eigener onMouseEnter/-Leave-Handler: Base UI koordiniert
 * Hover- und Klick-Interaktion dort intern (safePolygon lässt die Maus
 * diagonal zum Popover-Inhalt wandern, ohne zwischendurch zu schließen) —
 * ein selbstgebauter Hover-State hätte einen Klick auf einen bereits per
 * Hover geöffneten Chip sofort wieder zugeklappt (Klick = Toggle, Hover
 * hatte gerade erst geöffnet). `onOpenChange` meldet den Zustand zusätzlich
 * nach außen, damit die Karte ihr Hover-Panel offen halten kann, auch wenn
 * die Maus dabei die Kachel selbst verlässt (Popup ist per Portal
 * außerhalb).
 */
function OverflowBadgesPopover<T>({
  hiddenCount,
  items,
  testId,
  renderItem,
  onOpenChange,
}: {
  hiddenCount: number;
  items: T[];
  testId: string;
  renderItem: (item: T) => ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (hiddenCount <= 0) return null;

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        onOpenChange?.(open);
      }}
    >
      <PopoverTrigger
        type="button"
        openOnHover
        aria-label={`Alle ${items.length} anzeigen`}
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          badgeVariants({ variant: "secondary" }),
          "shrink-0 border-primary/30 bg-primary/20 text-[10px] text-primary hover:bg-primary/30"
        )}
      >
        +{hiddenCount}
      </PopoverTrigger>
      <PopoverContent onClick={(event) => event.stopPropagation()} className="flex max-w-64 flex-wrap gap-1 p-2">
        {items.map(renderItem)}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Der Text-Span innerhalb eines einzelnen Adress-/Tag-Badges — bei
 * tatsächlicher Ellipsen-Kürzung (useIsTruncated, per scrollWidth/
 * clientWidth gemessen) wird er zum selben Hover/Klick-Popover-Trigger wie
 * die "+N"-Chips, mit dem VOLLEN Text als Inhalt. Passt der Text bereits
 * vollständig, bleibt der Trigger einfach deaktiviert (kein Popover) — ein
 * natives title-Attribut hätte hier zwar auch funktioniert, aber inkonsistent
 * zum gerade gebauten Popover-Look der "+N"-Chips gewirkt (verzögertes
 * Browser-Tooltip statt derselben gestylten Box).
 *
 * Der Baum (Popover > Trigger > span) wird bewusst IMMER gleich gerendert,
 * nur `disabled`/`openOnHover`/`open` hängen von isTruncated ab — nicht ein
 * bedingtes Umschalten zwischen "nacktem <span>" und "in <button> gewickeltem
 * <span>": ein Strukturwechsel bei JEDEM Render (je nachdem, was der
 * vorherige Messwert war) hätte scrollWidth/clientWidth selbst verändert und
 * den Wert dadurch bei jedem Render erneut umkippen lassen — React brach das
 * mit "Maximum update depth exceeded" ab (per Test reproduziert).
 *
 * `block` auf dem Span ist kein Stil-Detail, sondern nötig für die Messung
 * selbst: clientWidth/scrollWidth sind für ECHTE inline-Elemente (display:
 * inline) per Spec 0 — in den unverpackten Badges (siehe z.B. die
 * Hauptadresse weiter unten) funktioniert die Messung trotzdem, weil deren
 * <span> DIREKTES Kind eines Flex-Containers (Badge) ist und dadurch von CSS
 * automatisch "blockifiziert" wird. Hier sitzt der Span aber im <button>
 * (PopoverTrigger), das selbst blockifiziert wird, der Span DARIN bleibt
 * jedoch normal inline — ohne explizites `block` liefert er dauerhaft 0,
 * isTruncated wäre dann immer false.
 */
function TruncatedBadgeText({
  text,
  testId,
  onOpenChange,
}: {
  text: string;
  testId?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ref, isTruncated] = useIsTruncated<HTMLSpanElement>();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover
      open={isTruncated && isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        onOpenChange?.(open && isTruncated);
      }}
    >
      <PopoverTrigger
        type="button"
        disabled={!isTruncated}
        openOnHover={isTruncated}
        aria-label={isTruncated ? text : undefined}
        data-testid={testId}
        onClick={(event) => event.stopPropagation()}
        className="min-w-0 max-w-full border-0 bg-transparent p-0 text-left disabled:cursor-default"
      >
        <span ref={ref} className="block min-w-0 truncate">
          {text}
        </span>
      </PopoverTrigger>
      <PopoverContent onClick={(event) => event.stopPropagation()} className="max-w-64 p-2 text-xs">
        {text}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Eine Kachel im Grid (siehe ImageGrid): feste Zellgröße (aspect-[4/3]),
 * Bild wird per object-fit: contain nie beschnitten — "ohne Rahmen soweit
 * möglich, im Original-Seitenverhältnis". Die meisten Bilder (Querformat
 * 512×384) füllen die Zelle dadurch bereits vollständig aus. Hochformat-
 * Bilder (384×512) sind schmaler als die Zelle — der seitliche Freiraum
 * bekommt bewusst einen nur minimal helleren Ton als der Seitenhintergrund
 * (bg-card statt bg-background/bg-muted: bg-background allein wirkte zu
 * dunkel/leblos, bg-muted stach zu deutlich als eigener Kasten hervor),
 * plus einen sehr dezenten Rand direkt um das Bild als einzigen sichtbaren
 * Hinweis auf die Kachel-Grenze. Erkennung rein clientseitig über das
 * geladene Bild (naturalWidth/naturalHeight) — die images-Tabelle speichert
 * keine Bildmaße.
 */
export function ImageThumbnailCard({
  row,
  canEdit,
  canDelete,
  isSelected,
  onToggleSelect,
  onPreview,
  onEdit,
  onDelete,
  currentUser,
  onAddUserTag,
  onRemoveUserTag,
  dotColor,
  onLocateOnMap,
}: {
  row: ImageSearchRow;
  canEdit: boolean;
  canDelete: boolean;
  /** Nur gesetzt, wenn canDelete true ist — steuert, ob die Auswahl-Checkbox
   * für die Bulk-Löschen-Leiste überhaupt gerendert wird (siehe ImageGrid). */
  isSelected: boolean;
  /** `isRangeSelect=true` (Shift gehalten) wählt den Bereich seit der letzten
   * Auswahl, sonst wird nur dieses eine Bild getoggelt (Standard-Verhalten:
   * Klick auf die Checkbox selbst ignoriert Modifier-Tasten bewusst — nur
   * Strg/Cmd- oder Shift-Klick irgendwo auf der Kachel lösen es aus, damit
   * ein normaler Klick nichts verändert). */
  onToggleSelect?: (isRangeSelect: boolean) => void;
  /** Einfacher Klick (keine Modifier-Taste) — öffnet das Vollbild-Popup,
   * unabhängig von Berechtigungen (jeder darf sich das Bild ansehen). */
  onPreview: (row: ImageSearchRow) => void;
  onEdit: (row: ImageSearchRow) => void;
  onDelete: (row: ImageSearchRow) => void;
  /** Für die Owner-only-Prüfung pro user_tag (canManageUserTag) und das
   * "+"-Feld (nur sichtbar, wenn überhaupt eine Session existiert). */
  currentUser: { id?: string; role: Role } | null;
  onAddUserTag?: (tag: string) => void;
  onRemoveUserTag?: (tag: string, addedBy: string | null) => void;
  /** Standort-Punkt unten rechts (siehe ImageMapDot) — dieselbe Farbe wie der
   * zugehörige Karten-Marker. */
  dotColor: string;
  onLocateOnMap: (row: ImageSearchRow) => void;
}) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");
  const [isLoginHintOpen, setIsLoginHintOpen] = useState(false);
  const [isOverflowPopoverOpen, setIsOverflowPopoverOpen] = useState(false);
  const isPortrait = dimensions !== null && dimensions.width < dimensions.height;

  const checkOrientation = useCallback((img: HTMLImageElement) => {
    const { naturalWidth, naturalHeight } = img;
    if (naturalWidth > 0 && naturalHeight > 0) setDimensions({ width: naturalWidth, height: naturalHeight });
    // Aus dem Cache bediente Bilder sind sofort "geladen" (kein Fade nötig),
    // frisch nachgeladene (z.B. beim Infinite Scroll) faden erst beim
    // tatsächlichen onLoad ein — siehe className unten.
    setIsLoaded(true);
  }, []);

  // Aus dem Browser-Cache bediente Bilder sind schon "complete", bevor React
  // den onLoad-Handler anhängt — der feuert dann nie, die Rundung bleibt aus.
  // Der Callback-Ref prüft direkt beim Mount, onLoad bleibt für den
  // Erst-Ladefall zuständig.
  const imgRef = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete) checkOrientation(img);
    },
    [checkOrientation]
  );

  // MAX_VISIBLE_* begrenzt nur den Kandidaten-Pool (Obergrenze, bevor
  // überhaupt gemessen wird) — wie viele davon TATSÄCHLICH in eine Zeile
  // passen, ermittelt useFittingCount per echter Breitenmessung (siehe dort:
  // reduziert die sichtbare Anzahl, statt jedes Badge bis zur Unlesbarkeit
  // zu stauchen). hiddenCount bezieht sich bewusst auf die GESAMTE Liste,
  // nicht nur den Kandidaten-Pool, da "+N" beide Kürzungsgründe (Obergrenze
  // UND Platzmangel) zusammenfassen muss.
  const secondaryLocationCandidates = row.secondaryLocations.slice(0, MAX_VISIBLE_SECONDARY_LOCATIONS);
  const [secondaryLocationsRowRef, secondaryLocationsFitCount] = useFittingCount(secondaryLocationCandidates.length);
  const visibleSecondaryLocations = secondaryLocationCandidates.slice(0, secondaryLocationsFitCount);
  const hiddenLocationCount = row.secondaryLocations.length - visibleSecondaryLocations.length;

  const tagCandidates = row.tags.slice(0, MAX_VISIBLE_TAGS);
  const [tagsRowRef, tagsFitCount] = useFittingCount(tagCandidates.length);
  const visibleTags = tagCandidates.slice(0, tagsFitCount);
  const hiddenTagCount = row.tags.length - visibleTags.length;

  const userTagsWithPermission = row.userTags.map((entry) => ({
    ...entry,
    canManage: canManageUserTag({
      actingUserId: currentUser?.id,
      actingRole: currentUser?.role,
      tagAddedBy: entry.addedBy,
      imageUploadedBy: row.uploadedBy,
    }),
  }));
  const userTagCandidates = userTagsWithPermission.slice(0, MAX_VISIBLE_TAGS);
  const [userTagsRowRef, userTagsFitCount] = useFittingCount(userTagCandidates.length);
  const visibleUserTags = userTagCandidates.slice(0, userTagsFitCount);
  const hiddenUserTagCount = userTagsWithPermission.length - visibleUserTags.length;

  function submitNewTag() {
    const trimmed = newTagValue.trim();
    if (trimmed) onAddUserTag?.(trimmed);
    setNewTagValue("");
    setIsAddingTag(false);
  }

  return (
    <div
      className="group relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-md bg-card"
      data-testid={`image-thumbnail-${row.id}`}
      // Strg/Cmd-Klick = einzeln togglen (bequemer, größerer Klickbereich als
      // die kleine Checkbox), Shift-Klick = Bereich seit letzter Auswahl —
      // wie in Dateimanagern/Google Fotos üblich. Eine gehaltene Modifier-
      // Taste ist IMMER reserviert (auch ohne onToggleSelect, z.B. anonym
      // ohne Lösch-Recht — sonst würde ein Shift-Klick dort überraschend das
      // Popup statt gar nichts auslösen). Nur ein Klick GANZ OHNE gehaltene
      // Taste öffnet das Vollbild-Popup (siehe onPreview).
      onClick={(event) => {
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          if (event.shiftKey) onToggleSelect?.(true);
          else onToggleSelect?.(false);
          return;
        }
        onPreview(row);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fertige,
          feste Thumbnail-Größe (512x384/384x512), next/image bringt hier
          keine Optimierung, verlangt aber vorab bekannte Maße, die genau
          das Problem wären, das die Hochformat-Erkennung erst löst. */}
      <img
        ref={imgRef}
        src={row.thumbUrl}
        alt={row.mainLocation ?? ""}
        loading="lazy"
        decoding="async"
        // max-h-full/max-w-full statt size-full: die Bild-BOX selbst soll
        // auf die tatsächlich sichtbare (object-contain-verkleinerte)
        // Größe schrumpfen, sonst bleibt sie exakt zellengroß und
        // rounded-md/border auf dem <img> fallen mit der (bereits
        // gerundeten) Zelle zusammen — unsichtbar bei Hochformat-Bildern.
        className={cn(
          "max-h-full max-w-full object-contain transition-all duration-500",
          isLoaded ? "scale-100 opacity-100" : "scale-95 opacity-0",
          isPortrait && "rounded-md border border-white/10"
        )}
        onLoad={(event) => checkOrientation(event.currentTarget)}
        {...NO_CASUAL_DOWNLOAD_PROPS}
      />

      {onToggleSelect && (
        <label
          className={cn(
            "absolute top-1 left-1 z-10 flex size-5 cursor-pointer items-center justify-center rounded border border-white/20 bg-black/40 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100",
            isSelected && "border-primary bg-primary/80 opacity-100"
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={isSelected}
            aria-label="Bild auswählen"
            data-testid={`image-select-${row.id}`}
            onClick={(event) => event.stopPropagation()}
            onChange={() => onToggleSelect?.(false)}
          />
          {isSelected && <Check className="size-3.5 text-primary-foreground" />}
        </label>
      )}

      {row.mainLocation && (
        <Badge className="pointer-events-none absolute bottom-1 left-1 max-w-[70%] gap-1 border-primary/60 bg-primary/40 text-[11px] text-primary-foreground opacity-100 backdrop-blur-sm transition-opacity group-hover:opacity-0">
          <MapPin data-icon="inline-start" className="size-3 shrink-0" />
          <span className="truncate">{row.mainLocation}</span>
        </Badge>
      )}

      {/* Standort-Punkt (siehe ImageMapDot) jetzt gleichwertig neben
          Bearbeiten/Löschen ganz oben rechts, statt separat unten rechts —
          bleibt dabei aber bewusst dauerhaft sichtbar (jeder darf den
          Standort ansehen, unabhängig von canEdit/canDelete), während NUR
          die Bearbeiten/Löschen-Gruppe daneben weiterhin beim Hovern ein-
          blendet. Deshalb ein eigener innerer Wrapper nur um die beiden mit
          eigenem opacity-Fade, statt alle drei gemeinsam zu faden. */}
      <div className="absolute top-1 right-1 flex items-center gap-1">
        {(canEdit || canDelete) && (
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {canEdit && (
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                className="bg-primary/20 text-primary hover:bg-primary/30"
                aria-label="Bearbeiten"
                data-testid={`image-edit-${row.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onEdit(row);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                size="icon-xs"
                variant="destructive"
                // Kräftiger als die Standard-destructive-Variante (nur 10%
                // Deckkraft) — auf Wunsch des Users, damit dieser Papierkorb-
                // Icon-Button (der einzige reine Trash-Icon-Button im Projekt,
                // sonst nutzt "destructive" überall Text-Buttons wie "Löschen"
                // in AlertDialogs) deutlicher als Gefahren-/Warnaktion wirkt.
                className="border border-destructive/40 bg-destructive/30 hover:bg-destructive/50"
                aria-label="Löschen"
                data-testid={`image-delete-${row.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(row);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        )}
        <ImageMapDot className="size-6" color={dotColor} onClick={() => onLocateOnMap(row)} bordered={false} />
      </div>

      {/* Theme-Farben (background/foreground/primary) statt hart codiertem
          Schwarz/Weiß: der Verlauf blendet damit in Light und Dark Mode
          gleichermaßen stimmig ab, die Icons tragen den Marken-Akzent
          (--primary, dieselbe Farbe wie der Hover-Ring/Logo). */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100",
          // Bleibt an Ort und Stelle offen, solange das Tag-Eingabefeld oder
          // der Login-Hinweis-Popover aktiv ist — sonst rutscht das Panel
          // beim Verlassen des Hovers (reines CSS :hover, siehe group-hover
          // oben) unter dem noch offenen Feld/Popover weg, dessen eigene
          // Position sich an den (dann wandernden) Trigger-Button anhängt
          // und optisch "abrutscht".
          (isAddingTag || isLoginHintOpen || isOverflowPopoverOpen) && "translate-y-0 opacity-100"
        )}
      >
        <div className="pointer-events-auto space-y-1 bg-gradient-to-t from-background/95 via-background/75 to-transparent px-2 pt-5 pb-1.5">
          {/* Getaperte Coral-Linie statt durchgehendem border-t — an den
              Rändern transparent, in der Mitte satt, wirkt als gezielter
              Marken-Akzent statt als flacher Trennstrich. */}
          <div className="-mt-5 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />
          <div className="flex items-center gap-1 overflow-hidden">
            <MapPin className="size-3 shrink-0 text-primary" />
            {/* Badge statt einfachem <span> — sonst fehlt hier das
                Innenpolster, das jede andere Zeile (Nebenadressen/Tags/
                User-Tags) durch ihre Badges bekommt, und der Text sitzt eine
                Nuance weiter links als der Rest ("Einrückung passt nicht"). */}
            <Badge
              variant="secondary"
              // Exakt derselbe Stil wie das dauerhaft sichtbare (Nicht-
              // Hover-)Adress-Badge unten links auf der Kachel — auf Wunsch
              // des Users für Haupt- UND Nebenadressen: text-primary-
              // foreground löst sich automatisch je nach Theme in Weiß
              // (Light) bzw. Schwarz (Dark) auf, passend zum satten
              // primary/40-Hintergrund. font-medium/px-2 nicht extra
              // gesetzt — kommt schon aus Badges eigener Basis (badge.tsx).
              className="min-w-0 shrink border-primary/60 bg-primary/40 text-[11px] text-primary-foreground backdrop-blur-sm"
            >
              {/* truncate auf einem eigenen inneren <span> statt direkt auf
                  dem Badge: Badge ist selbst ein Flex-Container (inline-flex,
                  siehe badge.tsx) — text-overflow:ellipsis wirkt auf einem
                  Flex-Element NICHT auf dessen eigenen Text, der Text würde
                  nur hart ohne "…" abgeschnitten. Als Kind des Flex-Badges
                  wird der Span geblockified (CSS-Spec) und ist damit ein
                  gültiger Block-Container, in dem Ellipsis tatsächlich
                  greift. TruncatedBadgeText statt festem title-Attribut: bei
                  echter Kürzung derselbe Popover-Look wie die "+N"-Chips
                  statt eines verzögerten nativen Browser-Tooltips. */}
              <TruncatedBadgeText
                text={row.mainLocation ?? EMPTY_PLACEHOLDER}
                testId={`image-mainlocation-hint-${row.id}`}
                onOpenChange={setIsOverflowPopoverOpen}
              />
            </Badge>
          </div>

          {visibleSecondaryLocations.length > 0 && (
            <div className="flex items-start gap-1">
              {/* Eigenes Icon statt nochmal MapPin — zwei MapPin-Icons
                  direkt untereinander (Haupt- vs. Nebenadresse) ließen die
                  Zeilen wie Duplikate wirken statt wie zwei unterschiedliche
                  Informationen. Signpost (Wegweiser zu mehreren benannten
                  Orten) passt inhaltlich zu "alternative/weitere Adressen". */}
              <Signpost className="mt-0.5 size-3 shrink-0 text-primary" />
              {/* flex-nowrap + echte Breitenmessung (useFittingCount) statt
                  flex-wrap ODER flex-shrink auf jedem Badge: eine einzige
                  Zeile pro Kategorie (User-Vorgabe), aber OHNE dass Badges
                  bis zur Unlesbarkeit gestaucht werden (das war das Problem
                  am reinen CSS-shrink-Ansatz) — stattdessen sinkt bei
                  Platzmangel die ANZAHL der gezeigten Badges, jedes einzelne
                  bleibt an seiner eigenen max-w-Grenze lesbar. */}
              <div ref={secondaryLocationsRowRef} className="flex flex-nowrap items-center gap-1 overflow-hidden">
                {visibleSecondaryLocations.map((location) => (
                  <Badge
                    key={location}
                    variant="secondary"
                    // max-w-full statt eines festen px-Werts: jedes Badge
                    // bekommt so viel Platz wie sein Inhalt braucht, bis hin
                    // zur vollen Zeilenbreite — Ellipsis greift dadurch nur
                    // noch, wenn ein einzelner Ortsname allein schon breiter
                    // als die ganze Zeile ist, nicht mehr bei einer
                    // willkürlichen festen Grenze (die z.B. "Diese Gasse"
                    // unnötig abgeschnitten hatte, obwohl Platz da war).
                    // shrink-0 bleibt: die ANZAHL der Badges passt sich schon
                    // über useFittingCount an, nicht die Breite der
                    // einzelnen — sonst würden mehrere Badges gemeinsam bis
                    // zur Unlesbarkeit gestaucht.
                    className="max-w-full shrink-0 border-primary/60 bg-primary/40 text-[11px] text-primary-foreground backdrop-blur-sm"
                  >
                    {/* truncate auf innerem <span>, nicht direkt auf dem
                        (Flex-)Badge — siehe Kommentar bei der Hauptadresse
                        oben. */}
                    <TruncatedBadgeText
                      text={location}
                      testId={`image-location-hint-${row.id}-${location}`}
                      onOpenChange={setIsOverflowPopoverOpen}
                    />
                  </Badge>
                ))}
                <OverflowBadgesPopover
                  hiddenCount={hiddenLocationCount}
                  items={row.secondaryLocations}
                  testId={`image-locations-overflow-${row.id}`}
                  onOpenChange={setIsOverflowPopoverOpen}
                  renderItem={(location) => (
                    <Badge
                      key={location}
                      variant="secondary"
                      className="max-w-full shrink-0 border-primary/60 bg-primary/40 text-[11px] text-primary-foreground"
                      title={location}
                    >
                      <span className="min-w-0 truncate">{location}</span>
                    </Badge>
                  )}
                />
              </div>
            </div>
          )}

          {/* Zeile verschwindet komplett, wenn keine Tags da sind — genau wie
              die Nebenadressen-Zeile darüber, statt Icon + "–"-Platzhalter
              für nichts zu zeigen (es gibt hier, anders als bei User-Tags,
              keine Aktion wie ein "+"-Button, die die Zeile trotzdem
              rechtfertigen würde). */}
          {visibleTags.length > 0 && (
            <div className="flex items-start gap-1">
              <TagIcon className="mt-0.5 size-3 shrink-0 text-primary" />
              <div ref={tagsRowRef} className="flex flex-nowrap items-center gap-1 overflow-hidden">
                {visibleTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="max-w-full shrink-0 border-primary/30 bg-primary/20 text-[10px] text-primary"
                  >
                    {/* truncate auf innerem <span>, nicht direkt auf dem
                        (Flex-)Badge — siehe Kommentar bei der Hauptadresse. */}
                    <TruncatedBadgeText
                      text={tag}
                      testId={`image-tag-hint-${row.id}-${tag}`}
                      onOpenChange={setIsOverflowPopoverOpen}
                    />
                  </Badge>
                ))}
                <OverflowBadgesPopover
                  hiddenCount={hiddenTagCount}
                  items={row.tags}
                  testId={`image-tags-overflow-${row.id}`}
                  onOpenChange={setIsOverflowPopoverOpen}
                  renderItem={(tag) => (
                    <Badge key={tag} variant="secondary" className="max-w-full shrink-0 border-primary/30 bg-primary/20 text-[10px] text-primary">
                      <span className="min-w-0 truncate">{tag}</span>
                    </Badge>
                  )}
                />
              </div>
            </div>
          )}

          {/* User-Tags: eigene Zeile statt mit den System-Tags gemischt, da
              jetzt interaktiv (pro Tag eigener Owner, siehe canManageUserTag) —
              "×" nur bei Berechtigung, "+"-Feld für jede Session (angemeldet
              zum direkten Hinzufügen, anonym als Hinweis-Popover Richtung
              Login — siehe unten). Die Zeile verschwindet daher nie mehr
              komplett (anders als bei den System-Tags oben), da der
              "+"-Button/Hinweis unabhängig von vorhandenen Tags immer eine
              Aktion anbietet. */}
          <div className="flex items-start gap-1" data-testid={`image-user-tags-${row.id}`}>
            <UserTagsIcon className="mt-0.5 size-3 shrink-0 text-primary" />
            <div ref={userTagsRowRef} className="flex flex-1 flex-nowrap items-center gap-1 overflow-hidden">
              {visibleUserTags.map((entry) => (
                // Badge bleibt shrink-0 (die ANZAHL passt sich über
                // useFittingCount an, nicht die Breite jedes einzelnen
                // Badges) — truncate sitzt auf einem eigenen inneren <span>
                // statt direkt auf dem Badge: hier steckt (anders als bei
                // Nebenadressen/Tags) noch der Entfernen-Button mit im
                // Badge, truncate träfe sonst den ganzen Flex-Inhalt inkl.
                // Button statt nur den Tag-Text.
                <Badge
                  key={`${entry.tag}-${entry.addedBy ?? "legacy"}`}
                  variant="secondary"
                  className="max-w-full shrink-0 gap-1 border-primary/30 bg-primary/20 text-[10px] text-primary"
                >
                  <TruncatedBadgeText
                    text={entry.tag}
                    testId={`image-user-tag-hint-${row.id}-${entry.tag}`}
                    onOpenChange={setIsOverflowPopoverOpen}
                  />
                  {entry.canManage && (
                    <button
                      type="button"
                      aria-label={`Tag "${entry.tag}" entfernen`}
                      data-testid={`image-user-tag-remove-${row.id}-${entry.tag}`}
                      className="shrink-0 rounded-full hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveUserTag?.(entry.tag, entry.addedBy);
                      }}
                    >
                      <X className="size-2.5" />
                    </button>
                  )}
                </Badge>
              ))}
              <OverflowBadgesPopover
                hiddenCount={hiddenUserTagCount}
                items={userTagsWithPermission}
                testId={`image-user-tags-overflow-${row.id}`}
                onOpenChange={setIsOverflowPopoverOpen}
                renderItem={(entry) => (
                  <Badge
                    key={`${entry.tag}-${entry.addedBy ?? "legacy"}`}
                    variant="secondary"
                    className="max-w-full shrink-0 gap-1 border-primary/30 bg-primary/20 text-[10px] text-primary"
                  >
                    <span className="min-w-0 truncate">{entry.tag}</span>
                    {entry.canManage && (
                      <button
                        type="button"
                        aria-label={`Tag "${entry.tag}" entfernen`}
                        data-testid={`image-user-tag-remove-${row.id}-${entry.tag}`}
                        className="shrink-0 rounded-full hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRemoveUserTag?.(entry.tag, entry.addedBy);
                        }}
                      >
                        <X className="size-2.5" />
                      </button>
                    )}
                  </Badge>
                )}
              />
              {currentUser?.id ? (
                isAddingTag ? (
                  <input
                    autoFocus
                    value={newTagValue}
                    data-testid={`image-user-tag-input-${row.id}`}
                    onChange={(event) => setNewTagValue(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitNewTag();
                      }
                      if (event.key === "Escape") {
                        setIsAddingTag(false);
                        setNewTagValue("");
                      }
                    }}
                    onBlur={submitNewTag}
                    placeholder="Tag…"
                    className="w-16 shrink-0 rounded border border-primary/30 bg-transparent px-1 text-[10px] text-white outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    aria-label="Eigenen Tag hinzufügen"
                    data-testid={`image-user-tag-add-${row.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsAddingTag(true);
                    }}
                    className="flex size-4 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <Plus className="size-2.5" />
                  </button>
                )
              ) : (
                // Anonyme Besucher dürfen keine Tags anlegen (onAddUserTag
                // greift serverseitig ohnehin nur mit Session) — der
                // "+"-Button bleibt trotzdem sichtbar, öffnet aber statt des
                // Eingabefelds einen Hinweis-Popover Richtung Login, damit
                // die Möglichkeit ("man könnte hier taggen") überhaupt erst
                // entdeckt wird.
                <Popover open={isLoginHintOpen} onOpenChange={setIsLoginHintOpen}>
                  <PopoverTrigger
                    type="button"
                    aria-label="Anmelden, um eigene Tags hinzuzufügen"
                    data-testid={`image-user-tag-add-${row.id}`}
                    onClick={(event) => event.stopPropagation()}
                    className="flex size-4 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <Plus className="size-2.5" />
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-52 p-3 text-xs"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <p className="text-muted-foreground">Melde dich an, um eigene Tags hinzuzufügen.</p>
                    <Link
                      href="/login"
                      data-testid={`image-user-tag-login-link-${row.id}`}
                      className="mt-2 inline-block font-medium text-primary hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Jetzt anmelden
                    </Link>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
