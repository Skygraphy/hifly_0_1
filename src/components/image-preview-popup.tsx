"use client";

import { useEffect, useState, type CSSProperties, type DragEvent, type MouseEvent } from "react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  Plus,
  Signpost,
  Tag as TagIcon,
  Tags as UserTagsIcon,
  Trash2,
  X,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageMapDot } from "@/components/image-map-dot";
import { canManageUserTag, type Role } from "@/lib/authorization";
import { useFittingCount } from "@/lib/use-fitting-count";
import { cn } from "@/lib/utils";
import type { ImageSearchRow } from "@/app/images/actions";

const EMPTY_PLACEHOLDER = "–";
const MAX_VISIBLE_SECONDARY_LOCATIONS = 4;
const MAX_VISIBLE_TAGS = 8;

/** Kein echter Kopierschutz (im Browser prinzipiell nicht durchsetzbar —
 * die Bytes liegen ohnehin im Netzwerk-Tab), sondern nur eine Hürde für
 * Laien: normaler Rechtsklick "Bild speichern unter", Wegziehen per Drag,
 * und das iOS-Long-Press-Menü sind damit weg. */
const NO_CASUAL_DOWNLOAD_PROPS = {
  draggable: false,
  onDragStart: (event: DragEvent) => event.preventDefault(),
  onContextMenu: (event: MouseEvent) => event.preventDefault(),
  style: { WebkitTouchCallout: "none" } as CSSProperties,
} as const;

/**
 * Echter Crossfade beim Prev/Next-Blättern: das alte Bild bleibt (statt
 * sofort zu verschwinden) im Hintergrund voll sichtbar liegen, während das
 * neue darüber von 0 auf volle Deckkraft einblendet — kein Zwischenzustand
 * ohne Bild, und funktioniert unabhängig davon, ob das neue Bild schon im
 * Browser-Cache liegt (anders als ein Fade, der auf onLoad/img.complete
 * wartet: bei einem gecachten Bild feuert das synchron/sofort, die
 * CSS-Transition hätte dann nichts zu überbrücken und ist unsichtbar —
 * genau das hatte der User bemängelt). Die State-Anpassung während des
 * Renders (statt in einem useEffect) ist hier bewusst: ein Effekt reagiert
 * erst NACH dem Commit mit dem neuen row — das alte Bild wäre für einen
 * Frame bereits durch das neue ersetzt, bevor der Crossfade starten könnte.
 * isEntering wird erst nach einem kurzen setTimeout auf true gesetzt, damit
 * der Browser opacity:0 tatsächlich einmal als eigenen Zustand auflöst. Die
 * transition-opacity-Klasse sitzt bewusst NUR auf dem opacity-100-Zweig,
 * NICHT auch auf opacity-0: mit der Transition auf BEIDEN Zweigen (erster
 * Versuch) lief bereits der Wechsel AUF opacity-0 selbst als 300ms-Transition
 * an — nach den paar ms bis zum Flip auf isEntering=true war die Opacity
 * kaum von 1 weg (per getAnimations()/progress direkt nachgewiesen: die
 * "Richtung 0"-Transition wurde bei progress~0 unterbrochen und die neue
 * "Richtung 1"-Transition startete folglich fast wieder bei 1 — de facto
 * kein sichtbarer Fade). Ohne Transition auf dem opacity-0-Zweig springt der
 * Startwert dagegen sofort/unanimiert auf 0, und ERST der Wechsel zu
 * opacity-100 (mit jetzt aktiver Transition) faded sauber über die volle
 * duration-300 von 0 auf 1 — per Opacity-Polling mit exaktem 0→1-Ramp
 * bestätigt.
 */
function PreviewImage({ row }: { row: ImageSearchRow }) {
  const [current, setCurrent] = useState(row);
  const [previous, setPrevious] = useState<ImageSearchRow | null>(null);
  const [isEntering, setIsEntering] = useState(true);

  if (row.id !== current.id) {
    setPrevious(current);
    setCurrent(row);
    setIsEntering(false);
  }

  useEffect(() => {
    if (isEntering) return;
    const timeout = setTimeout(() => setIsEntering(true), 20);
    return () => clearTimeout(timeout);
  }, [isEntering]);

  useEffect(() => {
    if (!previous) return;
    const timeout = setTimeout(() => setPrevious(null), 300);
    return () => clearTimeout(timeout);
  }, [previous]);

  return (
    <div className="relative flex max-h-[85vh] max-w-[85vw] items-center justify-center">
      {previous && (
        // eslint-disable-next-line @next/next/no-img-element -- fertige
        // Vollbild-Datei aus S3, next/image bringt hier keine Optimierung.
        <img
          src={previous.previewUrl}
          alt={previous.mainLocation ?? ""}
          className="absolute inset-0 m-auto max-h-[85vh] max-w-[85vw] object-contain"
          {...NO_CASUAL_DOWNLOAD_PROPS}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- fertige
          Vollbild-Datei aus S3, next/image bringt hier keine Optimierung. */}
      <img
        src={current.previewUrl}
        alt={current.mainLocation ?? ""}
        className={cn(
          "relative max-h-[85vh] max-w-[85vw] object-contain",
          previous && !isEntering ? "opacity-0" : "transition-opacity duration-300 opacity-100"
        )}
        {...NO_CASUAL_DOWNLOAD_PROPS}
      />
    </div>
  );
}

/**
 * Vollbild-Popup beim Klick auf ein Thumbnail — zeigt preview.jpg statt
 * thumb.jpg. Baut bewusst NICHT auf DialogContent auf (hat ein hartes
 * max-w-xs, für ein Bild ungeeignet), sondern direkt auf denselben
 * Basisbausteinen (Dialog/DialogPortal/DialogOverlay aus ui/dialog.tsx plus
 * DialogPrimitive.Popup aus @base-ui/react/dialog) — Fokus-Trap/Escape/
 * Backdrop-Klick kommen dadurch trotzdem "gratis".
 *
 * Hover-Panel unten ist bewusst dieselbe group/group-hover-Technik wie in
 * image-thumbnail-card.tsx (gleiche Klassen/Icons), nur das Ecken-Badge
 * oben links (Hauptadresse + Hash) bleibt — anders als das kleine
 * Adress-Badge auf der Kachel — beim Hovern sichtbar stehen.
 */
export function ImagePreviewPopup({
  row,
  canEdit,
  canDelete,
  currentUser,
  onOpenChange,
  onEdit,
  onDelete,
  onAddUserTag,
  onRemoveUserTag,
  onPrev,
  onNext,
  dotColor,
  onLocateOnMap,
}: {
  row: ImageSearchRow | null;
  canEdit: boolean;
  canDelete: boolean;
  currentUser: { id?: string; role: Role } | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (row: ImageSearchRow) => void;
  onDelete: (row: ImageSearchRow) => void;
  onAddUserTag?: (tag: string) => void;
  onRemoveUserTag?: (tag: string, addedBy: string | null) => void;
  /** Zum vorherigen/nächsten Bild der aktuell geladenen Liste wechseln —
   * fehlt (undefined), wenn es keins gibt (Rand der Liste), der Slider-
   * Button wird dann gar nicht erst gerendert statt deaktiviert angezeigt. */
  onPrev?: () => void;
  onNext?: () => void;
  /** Standort-Punkt unten rechts im Bild (siehe ImageMapDot) — dieselbe
   * Farbe wie der zugehörige Karten-Marker. */
  dotColor: string;
  onLocateOnMap: (row: ImageSearchRow) => void;
}) {
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");
  const [isLoginHintOpen, setIsLoginHintOpen] = useState(false);

  function submitNewTag() {
    const trimmed = newTagValue.trim();
    if (trimmed) onAddUserTag?.(trimmed);
    setNewTagValue("");
    setIsAddingTag(false);
  }

  // MAX_VISIBLE_* begrenzt nur den Kandidaten-Pool (Obergrenze, bevor
  // überhaupt gemessen wird) — wie viele davon TATSÄCHLICH in eine Zeile
  // passen, ermittelt useFittingCount per echter Breitenmessung (siehe
  // dort: reduziert die sichtbare Anzahl, statt jedes Badge bis zur
  // Unlesbarkeit zu stauchen). hiddenCount bezieht sich bewusst auf die
  // GESAMTE Liste, nicht nur den Kandidaten-Pool, da "+N" beide
  // Kürzungsgründe (Obergrenze UND Platzmangel) zusammenfassen muss. Die
  // Hooks laufen unconditional (row kann null sein, wenn das Popup zu ist)
  // — Rules of Hooks.
  const secondaryLocationCandidates = row?.secondaryLocations.slice(0, MAX_VISIBLE_SECONDARY_LOCATIONS) ?? [];
  const [secondaryLocationsRowRef, secondaryLocationsFitCount] = useFittingCount(secondaryLocationCandidates.length);
  const visibleSecondaryLocations = secondaryLocationCandidates.slice(0, secondaryLocationsFitCount);
  const hiddenLocationCount = (row?.secondaryLocations.length ?? 0) - visibleSecondaryLocations.length;

  const tagCandidates = row?.tags.slice(0, MAX_VISIBLE_TAGS) ?? [];
  const [tagsRowRef, tagsFitCount] = useFittingCount(tagCandidates.length);
  const visibleTags = tagCandidates.slice(0, tagsFitCount);
  const hiddenTagCount = (row?.tags.length ?? 0) - visibleTags.length;

  const userTagsWithPermission = (row?.userTags ?? []).map((entry) => ({
    ...entry,
    canManage: canManageUserTag({
      actingUserId: currentUser?.id,
      actingRole: currentUser?.role,
      tagAddedBy: entry.addedBy,
      imageUploadedBy: row?.uploadedBy ?? "",
    }),
  }));
  const userTagCandidates = userTagsWithPermission.slice(0, MAX_VISIBLE_TAGS);
  const [userTagsRowRef, userTagsFitCount] = useFittingCount(userTagCandidates.length);
  const visibleUserTags = userTagCandidates.slice(0, userTagsFitCount);
  const hiddenUserTagCount = userTagsWithPermission.length - visibleUserTags.length;

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogPortal>
        {/* Kein DialogOverlay (das hätte einen data-closed:fade-out mit
            backdrop-blur): dieses Popup deckt als einziges im ganzen Projekt
            den GESAMTEN Viewport über dem vollen, detailreichen Bilder-Grid
            ab. Jede ANIMIERTE fixed-position-Ebene in dieser Größe zwingt
            Chromium beim Entfernen zu einem Neu-Rastern der freigelegten
            Fläche in mehreren Schritten — sichtbar als kurzes doppeltes
            Aufblitzen der darunterliegenden Kacheln (gemeldeter "Thumbs
            flackern"-Bug, per Video-Capture bestätigt). Ein späterer Versuch,
            das Schließen stattdessen manuell zu verzögern und nur die
            Bild-Box separat auszufaden, führte zu einem NEUEN, leichteren
            Flacker-Effekt (die Box faded über dem unveränderten dunklen
            Overlay aus, das dann am Ende abrupt verschwindet — ein
            spürbarer Hell/Dunkel-Sprung). Da nur das Öffnen gefadet werden
            sollte (nicht das Schließen), bleibt es hier bei der einfachen,
            robusten Lösung: KEINE data-closed:animate-out/fade-out-0 auf
            Overlay und Popup — beide verschwinden synchron mit dem
            State-Update. Der Öffnen-Fade (data-open:*) bleibt erhalten. */}
        <DialogPrimitive.Backdrop
          data-slot="dialog-overlay"
          className="fixed inset-0 isolate z-50 bg-black/10 duration-300 data-open:animate-in data-open:fade-in-0"
        />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className="fixed inset-0 z-50 flex items-center justify-center p-8 outline-none data-open:animate-in data-open:fade-in-0"
          // Klick auf den Popup-Rahmen selbst (nicht auf ein Kind-Element,
          // also außerhalb des Bildes) schließt das Popup — dieselbe
          // "außerhalb klicken schließt"-Erwartung wie bei einer normalen
          // Lightbox, die der volle Viewport-Wrapper sonst verdecken würde.
          onClick={(event) => {
            if (event.target === event.currentTarget) onOpenChange(false);
          }}
        >
          {row && (
            <>
              {/* Slider-Buttons — außerhalb der Bild-Box (fixed relativ zum
                  Viewport), damit sie unabhängig vom Bild-Seitenverhältnis
                  immer an derselben Stelle links/rechts sitzen. Nur
                  gerendert, wenn es tatsächlich ein Nachbar-Bild gibt (siehe
                  onPrev/onNext), statt sichtbar aber deaktiviert. */}
              {onPrev && (
                <button
                  type="button"
                  aria-label="Vorheriges Bild"
                  data-testid="image-preview-prev"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPrev();
                  }}
                  className="fixed top-1/2 left-4 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-primary/60 bg-primary/40 text-primary-foreground backdrop-blur-sm outline-none transition-colors hover:bg-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ChevronLeft className="size-5" />
                </button>
              )}
              {onNext && (
                <button
                  type="button"
                  aria-label="Nächstes Bild"
                  data-testid="image-preview-next"
                  onClick={(event) => {
                    event.stopPropagation();
                    onNext();
                  }}
                  className="fixed top-1/2 right-4 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-primary/60 bg-primary/40 text-primary-foreground backdrop-blur-sm outline-none transition-colors hover:bg-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ChevronRight className="size-5" />
                </button>
              )}

              {/* border-white/10: hebt das Bild vom (ebenfalls dunklen)
                  Overlay-Hintergrund ab, dieselbe dezente Umrandung wie bei
                  Hochformat-Bildern auf der Kachel. duration-300 (statt der
                  Tailwind-Standarddauer von 150ms): der Öffnen-Fade sollte
                  bewusst spürbar sein, nicht nur angedeutet — [[data-open]_&]
                  liest den offen-Zustand vom Popup-Vorfahren. */}
              <div
                className="group relative flex max-h-[85vh] max-w-[85vw] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black duration-300 [[data-open]_&]:animate-in [[data-open]_&]:fade-in-0"
                data-testid={`image-preview-${row.id}`}
              >
                {/* Bewusst KEIN key={row.id}: PreviewImage muss über den
                    Zeilenwechsel hinweg gemountet bleiben, damit sie das
                    vorherige Bild für den Crossfade selbst zwischenhält. */}
                <PreviewImage row={row} />

                {/* Oben links: Hauptadresse + Hash in einem Badge (statt
                    zwei getrennten), dauerhaft sichtbar (nicht wie das
                    kleine Kachel-Badge beim Hovern ausblendend). */}
                <Badge className="absolute top-3 left-3 h-9 cursor-default gap-2 border-primary/60 bg-primary/40 px-3 text-sm text-primary-foreground backdrop-blur-sm">
                  <MapPin className="size-4 shrink-0" />
                  <span className="max-w-96 truncate">
                    {row.mainLocation ?? EMPTY_PLACEHOLDER} - {row.hash}
                  </span>
                </Badge>

                {/* Oben rechts: Schließen-Button im selben Stil wie
                    Bearbeiten/Löschen auf der Kachel (icon-xs/secondary),
                    statt eines eigenen Badge-Looks. */}
                <DialogPrimitive.Close
                  aria-label="Schließen"
                  data-testid="image-preview-close"
                  className={cn(buttonVariants({ variant: "secondary", size: "icon-xs" }), "absolute top-3 right-3 bg-primary/20 text-primary hover:bg-primary/30")}
                >
                  <XIcon className="size-3.5" />
                </DialogPrimitive.Close>

                {/* Hover-Fade-Panel unten — 1:1 dieselbe Technik wie auf der
                    Kachel (siehe image-thumbnail-card.tsx), nur etwas größer
                    skaliert (mehr Platz) und um Bearbeiten/Löschen ergänzt. */}
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100",
                    // Bleibt offen, solange das Tag-Eingabefeld oder der
                    // Login-Hinweis-Popover aktiv ist — siehe Begründung in
                    // image-thumbnail-card.tsx (dieselbe Technik).
                    (isAddingTag || isLoginHintOpen) && "translate-y-0 opacity-100"
                  )}
                >
                  <div className="pointer-events-auto space-y-1.5 bg-gradient-to-t from-background/95 via-background/75 to-transparent px-4 pt-8 pb-3">
                    <div className="-mt-8 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />

                    {/* items-end statt items-center: die Bearbeiten-/
                        Löschen-Buttons (nur bei canEdit/canDelete) sind
                        höher als das Adress-Badge und machen dadurch DIESE
                        Zeile höher als die Nebenorte-/Tags-/User-Tags-
                        Zeilen darunter. Bei items-center hätte das Badge
                        dadurch unten UND oben etwas Luft ("zentriert" in
                        der höheren Zeile) — der Abstand zur nächsten Zeile
                        (space-y-1.5, überall gleich 6px Marge) wirkte
                        dadurch hier sichtbar größer als zwischen den
                        anderen Zeilen. items-end lässt das Badge stattdessen
                        bündig mit dem Zeilenende abschließen, genau wie bei
                        den anderen (dort füllt der Zeileninhalt die Zeile
                        exakt aus) — die 6px Marge wirkt dadurch überall
                        gleich. */}
                    <div className="flex items-end justify-between gap-2">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <MapPin className="size-3.5 shrink-0 text-primary" />
                        {/* Badge statt einfachem <span> — sonst fehlt hier das
                            Innenpolster, das jede andere Zeile (Nebenadressen/
                            Tags/User-Tags) durch ihre Badges bekommt, und der
                            Text sitzt eine Nuance weiter links als der Rest
                            ("Einrückung passt nicht"). */}
                        <Badge
                          variant="secondary"
                          // Exakt derselbe Stil wie das dauerhaft sichtbare
                          // Adress-Badge auf der Kachel ohne Hover (siehe
                          // image-thumbnail-card.tsx) — auf Wunsch des Users
                          // für Haupt- UND Nebenadressen, auf beiden
                          // Oberflächen identisch: text-primary-foreground
                          // löst sich automatisch je nach Theme in Weiß
                          // (Light) bzw. Schwarz (Dark) auf, passend zum
                          // satten primary/40-Hintergrund.
                          className="min-w-0 shrink cursor-default border-primary/60 bg-primary/40 text-[11px] text-primary-foreground backdrop-blur-sm"
                          title={row.mainLocation ?? undefined}
                        >
                          {/* truncate auf einem eigenen inneren <span> statt
                              direkt auf dem Badge: Badge ist selbst ein
                              Flex-Container (inline-flex, siehe badge.tsx) —
                              text-overflow:ellipsis wirkt auf einem
                              Flex-Element NICHT auf dessen eigenen Text, der
                              würde nur hart ohne "…" abgeschnitten. Als Kind
                              des Flex-Badges wird der Span geblockified
                              (CSS-Spec) und ist damit ein gültiger Block-
                              Container, in dem Ellipsis tatsächlich greift. */}
                          <span className="min-w-0 truncate">{row.mainLocation ?? EMPTY_PLACEHOLDER}</span>
                        </Badge>
                      </div>
                      {(canEdit || canDelete) && (
                        <div className="flex shrink-0 gap-1.5">
                          {canEdit && (
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="secondary"
                              className="bg-primary/20 text-primary hover:bg-primary/30"
                              aria-label="Bearbeiten"
                              data-testid={`image-preview-edit-${row.id}`}
                              onClick={() => onEdit(row)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="destructive"
                              // Kräftiger als die Standard-destructive-
                              // Variante — dieselbe Verstärkung wie beim
                              // Papierkorb-Button auf der Kachel (siehe
                              // image-thumbnail-card.tsx), auf Wunsch des
                              // Users deutlicher als Gefahren-/Warnaktion.
                              className="border border-destructive/40 bg-destructive/30 hover:bg-destructive/50"
                              aria-label="Löschen"
                              data-testid={`image-preview-delete-${row.id}`}
                              onClick={() => onDelete(row)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {visibleSecondaryLocations.length > 0 && (
                      <div className="flex items-start gap-1.5">
                        {/* Eigenes Icon statt nochmal MapPin — zwei MapPin-
                            Icons direkt untereinander (Haupt- vs. Neben-
                            adresse) ließen die Zeilen wie Duplikate wirken
                            statt wie zwei unterschiedliche Informationen.
                            Signpost (Wegweiser zu mehreren benannten Orten)
                            passt inhaltlich zu "alternative/weitere Adressen". */}
                        <Signpost className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        {/* flex-nowrap + echte Breitenmessung (useFittingCount)
                            statt flex-wrap ODER flex-shrink auf jedem Badge:
                            eine einzige Zeile pro Kategorie (User-Vorgabe),
                            aber OHNE dass Badges bis zur Unlesbarkeit
                            gestaucht werden (das war das Problem am reinen
                            CSS-shrink-Ansatz) — stattdessen sinkt bei
                            Platzmangel die ANZAHL der gezeigten Badges,
                            jedes einzelne bleibt an seiner eigenen max-w-
                            Grenze lesbar. */}
                        <div ref={secondaryLocationsRowRef} className="flex flex-nowrap items-center gap-1 overflow-hidden">
                          {visibleSecondaryLocations.map((location) => (
                            <Badge
                              key={location}
                              variant="secondary"
                              // max-w-full statt eines festen px-Werts (siehe
                              // gleiche Begründung in image-thumbnail-card.tsx):
                              // Ellipsis greift nur noch, wenn ein einzelner
                              // Ortsname allein breiter als die ganze Zeile
                              // ist — useFittingCount regelt die Anzahl
                              // bereits nach Platz, shrink-0 verhindert, dass
                              // mehrere Badges sich gegenseitig stauchen.
                              className="max-w-full shrink-0 cursor-default border-primary/60 bg-primary/40 text-[11px] text-primary-foreground backdrop-blur-sm"
                              title={location}
                            >
                              {/* truncate auf innerem <span>, nicht direkt
                                  auf dem (Flex-)Badge — siehe Kommentar bei
                                  der Hauptadresse oben. */}
                              <span className="min-w-0 truncate">{location}</span>
                            </Badge>
                          ))}
                          {hiddenLocationCount > 0 && (
                            <Badge
                              variant="secondary"
                              className="shrink-0 cursor-default border-primary/60 bg-primary/40 text-[11px] text-primary-foreground backdrop-blur-sm"
                            >
                              +{hiddenLocationCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Zeile verschwindet komplett, wenn keine Tags da sind
                        — genau wie die Nebenadressen-Zeile darüber, statt
                        Icon + "–"-Platzhalter für nichts zu zeigen (anders
                        als bei User-Tags gibt es hier keine Aktion wie einen
                        "+"-Button, die die Zeile trotzdem rechtfertigen
                        würde). */}
                    {visibleTags.length > 0 && (
                      <div className="flex items-start gap-1.5">
                        <TagIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        <div ref={tagsRowRef} className="flex flex-nowrap items-center gap-1 overflow-hidden">
                          {visibleTags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="secondary"
                              className="max-w-full shrink-0 cursor-default border-primary/30 bg-primary/20 text-xs text-primary"
                            >
                              {/* truncate auf innerem <span>, nicht direkt
                                  auf dem (Flex-)Badge — siehe Kommentar bei
                                  der Hauptadresse. */}
                              <span className="min-w-0 truncate">{tag}</span>
                            </Badge>
                          ))}
                          {hiddenTagCount > 0 && (
                            <Badge variant="secondary" className="shrink-0 cursor-default border-primary/30 bg-primary/20 text-xs text-primary">
                              +{hiddenTagCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Zeile verschwindet nie mehr komplett (anders als bei
                        den System-Tags oben): der "+"-Button bietet
                        angemeldet das echte Eingabefeld, anonym stattdessen
                        einen Hinweis-Popover Richtung Login (siehe unten) —
                        in beiden Fällen eine echte Aktion statt eines reinen
                        Platzhalters. */}
                    <div className="flex items-start gap-1.5" data-testid={`image-preview-user-tags-${row.id}`}>
                      <UserTagsIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <div ref={userTagsRowRef} className="flex flex-1 flex-nowrap items-center gap-1 overflow-hidden">
                        {visibleUserTags.map((entry) => (
                          // Badge bleibt shrink-0 (die ANZAHL passt sich über
                          // useFittingCount an, nicht die Breite jedes
                          // einzelnen Badges) — truncate sitzt auf einem
                          // eigenen inneren <span> statt direkt auf dem
                          // Badge: hier steckt (anders als bei Neben-
                          // adressen/Tags) noch der Entfernen-Button mit im
                          // Badge, truncate träfe sonst den ganzen Flex-
                          // Inhalt inkl. Button statt nur den Tag-Text.
                          <Badge
                            key={`${entry.tag}-${entry.addedBy ?? "legacy"}`}
                            variant="secondary"
                            className="max-w-full shrink-0 cursor-default gap-1 border-primary/30 bg-primary/20 text-xs text-primary"
                          >
                            <span className="min-w-0 truncate">{entry.tag}</span>
                            {entry.canManage && (
                              <button
                                type="button"
                                aria-label={`Tag "${entry.tag}" entfernen`}
                                data-testid={`image-preview-user-tag-remove-${row.id}-${entry.tag}`}
                                className="shrink-0 cursor-pointer rounded-full hover:text-destructive"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onRemoveUserTag?.(entry.tag, entry.addedBy);
                                }}
                              >
                                <X className="size-3" />
                              </button>
                            )}
                          </Badge>
                        ))}
                        {hiddenUserTagCount > 0 && (
                          <Badge variant="secondary" className="shrink-0 cursor-default border-primary/30 bg-primary/20 text-xs text-primary">
                            +{hiddenUserTagCount}
                          </Badge>
                        )}
                        {currentUser?.id ? (
                          isAddingTag ? (
                            <input
                              autoFocus
                              value={newTagValue}
                              data-testid={`image-preview-user-tag-input-${row.id}`}
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
                              className="w-20 shrink-0 rounded border border-primary/30 bg-transparent px-1.5 py-0.5 text-xs text-white outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              aria-label="Eigenen Tag hinzufügen"
                              data-testid={`image-preview-user-tag-add-${row.id}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setIsAddingTag(true);
                              }}
                              className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/10"
                            >
                              <Plus className="size-3" />
                            </button>
                          )
                        ) : (
                          // Anonyme Besucher: "+"-Button bleibt sichtbar,
                          // öffnet statt des Eingabefelds einen Hinweis-
                          // Popover Richtung Login (siehe gleiche Begründung
                          // in image-thumbnail-card.tsx).
                          <Popover open={isLoginHintOpen} onOpenChange={setIsLoginHintOpen}>
                            <PopoverTrigger
                              type="button"
                              aria-label="Anmelden, um eigene Tags hinzuzufügen"
                              data-testid={`image-preview-user-tag-add-${row.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/10"
                            >
                              <Plus className="size-3" />
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="w-56 p-3 text-xs"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <p className="text-muted-foreground">Melde dich an, um eigene Tags hinzuzufügen.</p>
                              <Link
                                href="/login"
                                data-testid={`image-preview-user-tag-login-link-${row.id}`}
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

                {/* Standort-Punkt unten rechts, dieselbe Farbe wie der
                    zugehörige Karten-Marker — dauerhaft sichtbar, nach dem
                    Hover-Panel im JSX (steht damit über dessen Gradient-
                    Fläche). */}
                <ImageMapDot
                  className="absolute right-3 bottom-3"
                  color={dotColor}
                  onClick={() => onLocateOnMap(row)}
                />
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
