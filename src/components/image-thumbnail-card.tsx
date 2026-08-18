"use client";

import { useCallback, useState, type CSSProperties, type DragEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Check, MapPin, Pencil, Plus, Signpost, Tag as TagIcon, Tags as UserTagsIcon, Trash2, X } from "lucide-react";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageMapDot } from "@/components/image-map-dot";
import { CopyableId, FavoriteButton } from "@/components/image-preview-popup";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { BUTTON_GLASS_CLASS, TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS } from "@/lib/badge-glass-style";
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
  className,
}: {
  hiddenCount: number;
  items: T[];
  testId: string;
  renderItem: (item: T) => ReactNode;
  onOpenChange?: (open: boolean) => void;
  className?: string;
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
        // data-popup-open statt hover: — dieser Chip sitzt direkt neben dem
        // "+"-Eingabefeld, das beim Speichern eines neuen Tags wieder zum
        // kleinen Button einklappt. Bleibt die Maus dabei stehen (Finger
        // tippt weiter auf der Tastatur), landet der Cursor rein geometrisch
        // auf dem jetzt dorthin gerutschten Chip — echtes CSS-:hover
        // reagiert auf reine Positions-Überschneidung, unabhängig davon, ob
        // sich die Maus tatsächlich bewegt hat, und blieb dadurch optisch
        // "hängen" (per Test reproduziert: matches(':hover') === true, ohne
        // reales Zeigerereignis). data-[popup-open] hängt dagegen an Base
        // UIs eigener Interaktionslogik, die ein echtes Pointer-Event
        // braucht — bleibt in genau diesem Fall korrekt aus.
        //
        // Keine eigene Farbe mehr fest codiert (früher Coral inkl.
        // data-[popup-open]:bg-primary/30) — jede Aufrufstelle bringt jetzt
        // ihren eigenen Zeilen-Stil per `className` mit (BUTTON_GLASS_CLASS/
        // TAG_GLASS_CLASS, siehe die drei Aufrufer unten), analog zum
        // Preview-Vorbild (image-preview-popup.tsx). Ein fest codierter
        // data-[popup-open]-Coral-Ton hätte sonst beim Öffnen durch den
        // Glass-Hintergrund der Aufrufer "durchgeschienen".
        className={cn(badgeVariants({ variant: "secondary" }), "shrink-0", className)}
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
 * Die Badges einer Zeile (Nebenadressen/Tags/User-Tags), die tatsächlich
 * (per useFittingCount) in die Zeile passen — flex-nowrap + shrink-0 pro
 * Badge, damit die ANZAHL der gezeigten Badges auf Platzmangel reagiert statt
 * jedes einzelne bis zur Unlesbarkeit zu stauchen. Ausnahme: das letzte
 * sichtbare Badge — das darf sich per Ellipsis in den Restplatz hinein
 * kürzen, statt komplett zu verschwinden (min-w-8 nur als harte Untergrenze
 * gegen ein auf 0 kollabierendes Badge, keine "Lesbarkeits"-Schwelle —
 * sobald irgendein Rest an Platz übrig ist, soll er per Ellipsis genutzt
 * werden, nicht das ganze Badge in den "+N"-Zähler wandern). Das gilt
 * UNBEDINGT, auch wenn `hiddenCount` (noch) 0 ist: bei genau so vielen
 * Kandidaten, dass der Pool-Deckel (MAX_VISIBLE_*) nie greift, ist
 * hiddenCount beim allerersten Passform-Check (alle Kandidaten sichtbar)
 * zwangsläufig 0 — ein `hiddenCount > 0`-Gate hätte dem letzten Badge genau
 * in diesem Moment die Schrumpf-Fähigkeit verweigert und es bei Platzmangel
 * direkt ganz versteckt, statt es erst zu kürzen (per Messung bestätigt: 2
 * User-Tags, von denen eines nicht mehr passte, verschwand ohne Ellipsis
 * komplett). Schadet nicht, wenn ohnehin alles passt: `shrink`+`min-w-8`
 * wird dann einfach nie wirksam. Der Aufrufer muss das nachfolgende Element
 * (i.d.R. der "+N"-Chip) selbst mit `ml-auto` rechtsbündig verankern — das
 * garantiert unabhängig von der genauen Kürzungs-/Zählungs-Mathematik, dass
 * dort nie eine Lücke bleibt.
 *
 * Der `ref`-Container selbst braucht `flex-1`: ohne flex-grow schrumpft ein
 * Flex-Item standardmäßig auf die Breite seines EIGENEN Inhalts, sobald der
 * kleiner ist als der verfügbare Platz — die per useFittingCount gemessene
 * `clientWidth` wäre dann selbstreferenziell (schrumpft mit dem Inhalt mit)
 * statt den tatsächlich verfügbaren Platz widerzuspiegeln, wodurch ein
 * Badge, das eigentlich (ggf. gekürzt) noch gepasst hätte, fälschlich schon
 * vorher ganz im "+N"-Zähler verschwindet (per Messung bestätigt: dieselbe
 * Zeile maß 208px Container-Breite bei 4 sichtbaren Badges, aber nur 200px
 * bei 3 — 8px echter Restplatz blieben so ungenutzt).
 */
function FittingBadges<T>({
  items,
  getKey,
  badgeClassName,
  children,
}: {
  items: T[];
  getKey: (item: T) => string;
  badgeClassName: string;
  children: (item: T) => ReactNode;
}) {
  return (
    <>
      {items.map((item, index) => {
        const isTrailing = index === items.length - 1;
        return (
          <Badge
            // Suffix im Key, der sich mit isTrailing ändert: ein
            // wiederverwendetes DOM-Element behielt beim Wechsel von
            // shrink-0 zu shrink seine vorherige (volle) Breite, wodurch
            // useFittingCount ein Badge zu viel wegkürzte (per Messung
            // bestätigt) — der Key-Wechsel erzwingt stattdessen ein
            // frisches Element.
            key={`${getKey(item)}-${isTrailing ? "trailing" : "full"}`}
            variant="secondary"
            className={cn(badgeClassName, isTrailing ? "min-w-8 shrink" : "shrink-0")}
          >
            {children(item)}
          </Badge>
        );
      })}
    </>
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
  onToggleFavorite,
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
  onToggleFavorite?: () => void;
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
  // Echtes onMouseEnter/-Leave statt CSS hover: — dasselbe Problem wie beim
  // "+N"-Chip (siehe OverflowBadgesPopover-Kommentar): dieser Button
  // erscheint erst NACH einem Layout-Reflow (Eingabefeld → "+"-Button,
  // nach Absenden eines Tags) wieder an dieser Stelle. Bleibt der Mauszeiger
  // dabei unbewegt genau über der neuen Button-Position, aktiviert der
  // Browser CSS :hover rein geometrisch nach, ganz ohne echtes Pointer-
  // Event — JS-Mouse-Events feuern dagegen nur bei tatsächlicher
  // Mausbewegung und sind dagegen immun.
  const [isAddButtonHovered, setIsAddButtonHovered] = useState(false);
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
  // isAddingTag als zusätzlicher Reset-Trigger: siehe Kommentar in
  // use-fitting-count.ts — ohne das bleibt die Zeile nach dem Einklappen des
  // Eingabefelds auf einem zuvor (wegen des breiteren Felds) reduzierten
  // Stand hängen, obwohl wieder mehr Badges passen würden.
  const [userTagsRowRef, userTagsFitCount] = useFittingCount(userTagCandidates.length, isAddingTag);
  const visibleUserTags = userTagCandidates.slice(0, userTagsFitCount);
  const hiddenUserTagCount = userTagsWithPermission.length - visibleUserTags.length;

  function submitNewTag() {
    const trimmed = newTagValue.trim();
    if (trimmed) onAddUserTag?.(trimmed);
    setNewTagValue("");
    setIsAddingTag(false);
    // Das Eingabefeld ersetzt den "+"-Button, solange isAddingTag true ist —
    // der Button wird dabei aus dem DOM entfernt, BEVOR ein mouseleave darauf
    // feuern kann. Ohne dieses Zurücksetzen bliebe isAddButtonHovered auf dem
    // Stand vom letzten echten mouseenter hängen (meist true, weil man den
    // Button ja anklickt, um das Feld zu öffnen) — der Button käme dauerhaft
    // eingefärbt zurück, unabhängig von der tatsächlichen Mausposition.
    setIsAddButtonHovered(false);
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
          // size-4 (statt size-6/size-5 zuvor) — spürbar kleiner als die
          // icon-xs-Buttons (size-6) oben rechts. top-2/left-2 statt top-1/
          // left-1: die Button-Zeile ist 24px hoch und beginnt bei top-1
          // (4px), ihr Zentrum liegt also bei 4+12=16px. Eine 16px-Box
          // (size-4) landet mit demselben Zentrum, wenn sie bei 8px beginnt
          // (top-2) — rein größengleich (top-1 + size-6) UND rein optisch
          // (top-1 + size-5) saß sie zuvor jeweils zu weit oben.
          className={cn(
            "absolute top-2 left-2 z-10 flex size-4 cursor-pointer items-center justify-center rounded border border-white/20 bg-black/40 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100",
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
          {isSelected && <Check className="size-3 text-primary-foreground" />}
        </label>
      )}

      {row.mainLocation && (
        <Badge
          className={cn(
            "pointer-events-none absolute bottom-1 left-1 max-w-[70%] gap-1 text-[11px] text-primary opacity-100 transition-opacity group-hover:opacity-0",
            BUTTON_GLASS_CLASS
          )}
        >
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
            {/* size="xs" (h-6) statt des Preview-Standards "sm" (h-7) — auf
                Wunsch des Users an die Höhe der icon-xs-Nachbar-Buttons
                (Bearbeiten/Löschen) angeglichen, siehe CopyableId-Kommentar
                in image-preview-popup.tsx. font-semibold statt dem
                Button-Standard font-medium: "etwas markanter" auf Wunsch
                des Users. */}
            <CopyableId id={row.hash} size="xs" className="font-semibold" testId={`image-copy-id-${row.id}`} />
            {canEdit && (
              <Button
                type="button"
                size="icon-xs"
                variant="secondary"
                // BUTTON_GLASS_CLASS statt fester Coral-Fläche — auf Wunsch
                // des Users an den Preview-Stil angeglichen
                // (image-preview-popup.tsx).
                className={cn(BUTTON_GLASS_CLASS, "text-primary")}
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
                // BUTTON_GLASS_CLASS statt fester Coral-/Rot-Fläche — auf
                // Wunsch des Users an den Preview-Stil angeglichen
                // (image-preview-popup.tsx). Ersetzt die frühere, kräftigere
                // randlose Coral-Variante (bg-destructive/30, kein Rand);
                // der dezente helle Rand kommt jetzt aus BUTTON_GLASS_CLASS
                // dazu, identisch zum Löschen-Button im Preview.
                className={cn(BUTTON_GLASS_CLASS, "text-destructive")}
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
        {/* Immer sichtbar (nicht im Hover-Fade-Wrapper von Bearbeiten/
            Löschen/ID oben) — Favorisieren ist eine für jeden Betrachter
            jederzeit greifbare Aktion, keine Owner-/Admin-Aktion. */}
        <FavoriteButton
          isFavorite={row.isFavorite}
          isLoggedIn={Boolean(currentUser?.id)}
          onToggle={() => onToggleFavorite?.()}
          size="icon-xs"
          testId={`image-favorite-${row.id}`}
          loginLinkTestId={`image-favorite-login-link-${row.id}`}
        />
        {/* Bestellen — dasselbe "immer sichtbar, kein Hover-Fade"-Prinzip wie
            Favorisieren daneben: eine für jeden Betrachter jederzeit
            greifbare Aktion. Führt auf die eigene Produktseite für dieses
            Bild (siehe AddToCartButton), kein Popover mehr. */}
        <AddToCartButton imageId={row.id} size="icon-xs" testId={`image-add-to-cart-${row.id}`} />
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
              // Hover-)Adress-Badge unten links auf der Kachel, für Haupt-
              // UND Nebenadressen. BUTTON_GLASS_CLASS (neutrales Frosted-
              // Glass) statt fester Coral-Fläche — auf Wunsch des Users an
              // den Preview-Stil angeglichen (image-preview-popup.tsx):
              // passt sich jedem Bildausschnitt an, statt als fester
              // Coral-Chip unabhängig vom Fotoinhalt zu wirken.
              className={cn("min-w-0 shrink text-[11px] text-primary", BUTTON_GLASS_CLASS)}
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
              <div ref={secondaryLocationsRowRef} className="flex flex-1 flex-nowrap items-center gap-1 overflow-hidden">
                <FittingBadges
                  items={visibleSecondaryLocations}
                  getKey={(location) => location}
                  badgeClassName={cn("max-w-full text-[11px] text-primary", BUTTON_GLASS_CLASS)}
                >
                  {(location) => (
                    <TruncatedBadgeText
                      text={location}
                      testId={`image-location-hint-${row.id}-${location}`}
                      onOpenChange={setIsOverflowPopoverOpen}
                    />
                  )}
                </FittingBadges>
                <OverflowBadgesPopover
                  className={cn("ml-auto text-[11px] text-primary", BUTTON_GLASS_CLASS)}
                  hiddenCount={hiddenLocationCount}
                  items={row.secondaryLocations}
                  testId={`image-locations-overflow-${row.id}`}
                  onOpenChange={setIsOverflowPopoverOpen}
                  renderItem={(location) => (
                    <Badge
                      key={location}
                      variant="secondary"
                      className={cn("max-w-full shrink-0 text-[11px] text-primary", BUTTON_GLASS_CLASS)}
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
              <TagIcon className={cn("mt-0.5 size-3 shrink-0", TAG_ACCENT_TEXT_CLASS)} />
              <div ref={tagsRowRef} className="flex flex-1 flex-nowrap items-center gap-1 overflow-hidden">
                <FittingBadges
                  items={visibleTags}
                  getKey={(tag) => tag}
                  badgeClassName={cn("max-w-full text-[10px]", TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
                >
                  {(tag) => (
                    <TruncatedBadgeText
                      text={tag}
                      testId={`image-tag-hint-${row.id}-${tag}`}
                      onOpenChange={setIsOverflowPopoverOpen}
                    />
                  )}
                </FittingBadges>
                <OverflowBadgesPopover
                  className={cn("ml-auto text-[10px]", TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
                  hiddenCount={hiddenTagCount}
                  items={row.tags}
                  testId={`image-tags-overflow-${row.id}`}
                  onOpenChange={setIsOverflowPopoverOpen}
                  renderItem={(tag) => (
                    <Badge key={tag} variant="secondary" className={cn("max-w-full shrink-0 text-[10px]", TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}>
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
            <UserTagsIcon className={cn("mt-0.5 size-3 shrink-0", TAG_ACCENT_TEXT_CLASS)} />
            <div ref={userTagsRowRef} className="flex flex-1 flex-nowrap items-center gap-1 overflow-hidden">
              {/* Während der Eingabe (isAddingTag) verschwindet die
                  Badge-Liste zugunsten des Eingabefelds — siehe dessen
                  eigenen Kommentar weiter unten. Außerhalb der Eingabe
                  bleibt diese Zeile exakt die eingefrorene FittingBadges-
                  Anzeige (siehe Kommentar dort), unverändert. */}
              {!isAddingTag && (
                <FittingBadges
                  items={visibleUserTags}
                  getKey={(entry) => `${entry.tag}-${entry.addedBy ?? "legacy"}`}
                  badgeClassName={cn("max-w-full gap-1 text-[10px]", TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
                >
                  {(entry) => (
                    <>
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
                    </>
                  )}
                </FittingBadges>
              )}
              {/* "+" bleibt IN der normalen Zeilenreihenfolge (shrink-0,
                  kein ml-auto) — sitzt also immer unmittelbar rechts vom
                  letzten sichtbaren User-Tag, nicht an den Zeilenrand
                  verschoben. Nur "+N" (weiter unten) bekommt sein eigenes
                  ml-auto und rückt dadurch für sich an den rechten Rand —
                  ist die Zeile ohnehin randvoll, bleibt zwischen "+" und
                  "+N" kein Platz für die Marge, beide landen dann von
                  selbst direkt nebeneinander. Während der Eingabe
                  (isAddingTag) ersetzt das Eingabefeld den Button an
                  gleicher Stelle, bekommt aber flex-1: die Badge-Liste ist
                  ja ausgeblendet (s.o.), das Feld füllt dadurch den
                  kompletten Platz von ganz links bis kurz vor "+N", das
                  weiterhin shrink-0 bleibt und so sein Plätzchen ganz
                  rechts behält. */}
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
                        setIsAddButtonHovered(false);
                      }
                    }}
                    onBlur={submitNewTag}
                    placeholder="Tag…"
                    // Vorher ein unauffälliges, transparentes Feld mit
                    // dünnem grauem Rand — wirkte neben den satten
                    // Coral-Badges wie ein Fremdkörper. Jetzt derselbe
                    // Pill-Stil wie die Tag-Badges daneben (rounded-4xl,
                    // h-5), dazu ein kurzes Einblenden beim Öffnen
                    // (zoom-in/fade-in). appearance-none/bg-clip-padding
                    // gegen native Browser-Eigendarstellung von <input>.
                    // KEIN focus:ring (box-shadow) — bei diesem großen
                    // border-radius (rounded-4xl/Pille) folgt der
                    // Ring-Schatten die Ecken sichtbar eckiger als der
                    // Rand selbst und wirkte dadurch wie ein über den Rand
                    // hinauslaufender Hintergrund (vom User bestätigt).
                    // Fokus zeigt sich stattdessen allein über die
                    // TAG_GLASS_CLASS-Hover-Fläche. flex-1/min-w-0 statt
                    // fester w-20: das Feld soll beim Öffnen die ganze
                    // Zeile ausfüllen (bis auf den Platz für "+N" rechts,
                    // siehe Kommentar oben). Glas-Stil (TAG_GLASS_CLASS/
                    // TAG_ACCENT_TEXT_CLASS) statt fester Coral-Fläche — auf
                    // Wunsch des Users an den Preview-Stil angeglichen.
                    className={cn(
                      "h-5 min-w-0 flex-1 animate-in appearance-none rounded-4xl border bg-clip-padding px-2 text-[10px] placeholder:text-white/40 outline-none transition-colors duration-150 zoom-in-95 fade-in-0",
                      TAG_ACCENT_TEXT_CLASS,
                      TAG_GLASS_CLASS
                    )}
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
                    onMouseEnter={() => setIsAddButtonHovered(true)}
                    onMouseLeave={() => setIsAddButtonHovered(false)}
                    className={cn(
                      // outline-none nötig: sonst bleibt bei Fokus (ein Klick
                      // auf <button>/PopoverTrigger fokussiert es in Chrome)
                      // der native Browser-Fokusring sichtbar, der dem
                      // rounded-full hier nicht sauber folgt und wie ein
                      // heller Extra-Rand um den gestrichelten Kreis wirkt —
                      // derselbe Fund wie bei ui/badge.tsx.
                      "flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/40 text-primary outline-none focus-visible:border-primary",
                      isAddButtonHovered && "bg-primary/10"
                    )}
                  >
                    <Plus className="size-3" />
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
                    onMouseEnter={() => setIsAddButtonHovered(true)}
                    onMouseLeave={() => setIsAddButtonHovered(false)}
                    className={cn(
                      // outline-none nötig: sonst bleibt bei Fokus (ein Klick
                      // auf <button>/PopoverTrigger fokussiert es in Chrome)
                      // der native Browser-Fokusring sichtbar, der dem
                      // rounded-full hier nicht sauber folgt und wie ein
                      // heller Extra-Rand um den gestrichelten Kreis wirkt —
                      // derselbe Fund wie bei ui/badge.tsx.
                      "flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/40 text-primary outline-none focus-visible:border-primary",
                      isAddButtonHovered && "bg-primary/10"
                    )}
                  >
                    <Plus className="size-3" />
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
              <OverflowBadgesPopover
                className={cn("ml-auto text-[10px]", TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
                hiddenCount={hiddenUserTagCount}
                items={userTagsWithPermission}
                testId={`image-user-tags-overflow-${row.id}`}
                onOpenChange={setIsOverflowPopoverOpen}
                renderItem={(entry) => (
                  <Badge
                    key={`${entry.tag}-${entry.addedBy ?? "legacy"}`}
                    variant="secondary"
                    className={cn("max-w-full shrink-0 gap-1 text-[10px]", TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
