"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Heart,
  Loader2,
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
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageMapDot } from "@/components/image-map-dot";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { canManageUserTag, type Role } from "@/lib/authorization";
import { BUTTON_GLASS_CLASS, TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS } from "@/lib/badge-glass-style";
import { useFittingCount } from "@/lib/use-fitting-count";
import { useIsTruncated } from "@/lib/use-is-truncated";
import { cn } from "@/lib/utils";
import type { ImageSearchRow } from "@/app/images/actions";

const EMPTY_PLACEHOLDER = "–";

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
 * Bei tatsächlicher Ellipsen-Kürzung (useIsTruncated, per scrollWidth/
 * clientWidth gemessen) wird der Text zum Hover/Klick-Popover-Trigger mit
 * dem VOLLEN Text als Inhalt — derselbe gestylte Tooltip-Look wie auf der
 * Kachel (image-thumbnail-card.tsx), statt eines nativen title-Attributs
 * (dort funktioniert dieselbe Sache, wirkt aber wie ein verzögertes
 * Browser-Tooltip statt einer eigenen gestylten Box). Lokale Kopie statt
 * Import: das Kachel-Original ist dort nicht exportiert und der Bereich
 * ist auf Wunsch des Users eingefroren, siehe [[feedback_thumbnail_badge_truncation_frozen]] —
 * die Messlogik selbst (`useIsTruncated`) bleibt geteilt.
 *
 * Baum (Popover > Trigger > span) wird bewusst immer gleich gerendert, nur
 * `disabled`/`openOnHover`/`open` hängen von isTruncated ab — siehe
 * Kachel-Original für die ausführliche Begründung (Messwert-Oszillation/
 * "Maximum update depth exceeded" bei bedingtem Strukturwechsel).
 */
function TruncatedTooltipText({
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
 * Der "+N"-Chip einer Zeile (Nebenadressen/Tags/User-Tags) — bei Hover ODER
 * Klick öffnet er ein Popover mit ALLEN Einträgen der Kategorie (nicht nur
 * den durch useFittingCount/MAX_VISIBLE_* abgeschnittenen). Lokale Kopie
 * von OverflowBadgesPopover aus image-thumbnail-card.tsx — dort nicht
 * exportiert und die Datei eingefroren, siehe Kommentar bei
 * TruncatedTooltipText oben. `className` bestimmt der Aufrufer (je Zeile
 * die dortige Glas-/Akzentklasse statt der Kachel-eigenen Coral-Literale).
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
        className={cn(badgeVariants({ variant: "secondary" }), "shrink-0 cursor-default text-xs", className)}
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
 * (per useFittingCount) in die Zeile passen — das letzte sichtbare Badge
 * darf sich per Ellipsis in den Restplatz hinein kürzen (`min-w-8 shrink`),
 * statt beim nächsten useFittingCount-Schritt direkt ganz zu verschwinden.
 * Lokale Kopie von FittingBadges aus image-thumbnail-card.tsx — siehe
 * Kommentar bei TruncatedTooltipText oben zur Begründung der Kopie statt
 * eines Imports.
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
            // useFittingCount ein Badge zu viel wegkürzte — siehe
            // Kachel-Original für die per Messung bestätigte Begründung.
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
 * Die "ID" (images.hash) — auf Wunsch des Users NICHT dauerhaft sichtbar,
 * sondern nur beim Hovern links neben der Bearbeiten/Löschen/Standort-
 * Punkt/Schließen-Gruppe erscheint (siehe Platzierung im
 * Hauptkomponenten-JSX, `opacity-0 group-hover:opacity-100` wie beim
 * unteren Info-Panel). Als EIN Button im selben Stil wie der
 * Bearbeiten-Button daneben (size="sm" statt "icon-sm", da hier Text statt
 * nur eines Icons drin steht — gleiche Höhe/Farben trotzdem). Soll Usern
 * helfen, ein Bild eindeutig zu identifizieren, z.B. für eine spätere
 * Bestellung — ein Klick irgendwo auf den Button kopiert den Wert direkt
 * (kein separater kleiner Kopier-Button mehr nötig). Kein Toast-System im
 * Projekt vorhanden, daher zeigt der Button die Bestätigung rein lokal
 * (Copy-Icon wechselt kurz auf Check) statt einer neuen Abhängigkeit.
 *
 * Exportiert (statt lokaler Kopie wie bei TruncatedTooltipText/
 * OverflowBadgesPopover/FittingBadges): auch von der Kachel
 * (image-thumbnail-card.tsx) genutzt — hier gibt es (anders als beim
 * Stil-Vorbild Kachel→Preview) keine gewachsene, abweichende
 * Eigenimplementation, die eine Kopie rechtfertigen würde, daher lieber
 * eine gemeinsame Quelle als eine zweite, potenziell auseinanderdriftende
 * Kopie. `className` optional, damit Aufrufer die Textdarstellung punktuell
 * anpassen können (z.B. font-semibold auf der Kachel für "etwas
 * markanteren" Text), ohne die Basis-Klassen zu duplizieren. `size`
 * optional (Default "sm" — die ursprüngliche Preview-Höhe, siehe unten):
 * auf der Kachel zunächst ebenfalls "sm" genutzt ("genauso wie im
 * Preview"), auf expliziten Folgewunsch des Users dann auf "xs" (h-6)
 * umgestellt, um auf gleicher Höhe wie die dortigen icon-xs-Nachbarn
 * (Bearbeiten/Löschen) zu sitzen.
 *
 * `onOpenPreview` optional (nur von der Kachel gesetzt): ein Klick auf den
 * ID-TEXT öffnet dann zusätzlich das Vollbild-Popup, ein Klick auf das
 * Kopier-Icon daneben bleibt unverändert reines Kopieren. Beides zusammen
 * auf einen einzigen Klick zu legen (erst kopieren, dann Popup öffnen) hätte
 * die "kopiert"-Bestätigung (Check-Icon) unsichtbar gemacht, noch bevor sie
 * zu sehen war — das Vollbild deckt die Kachel sofort ab, und das Popup hat
 * eine eigene, unabhängige CopyableId-Instanz ohne den `copied`-State. Zwei
 * getrennte Klickziele in einem einzigen <button> gehen nicht (kein
 * Button-in-Button in validem HTML) — die äußere Hülle ist deshalb ein
 * <span> mit der bisherigen Button-Optik, innen zwei eigene <button>s statt
 * einem. Ohne `onOpenPreview` (alle anderen Aufrufer: Checkout/Bestellungen/
 * Warenkorb/Preview selbst/Shop-Bilddetail) kopiert ein Klick auf den Text
 * wie bisher ebenfalls.
 */
export function CopyableId({
  id,
  className,
  testId = "image-preview-copy-id",
  size = "sm",
  onOpenPreview,
}: {
  id: string;
  className?: string;
  testId?: string;
  size?: "sm" | "xs";
  onOpenPreview?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // preventDefault zusätzlich zu stopPropagation: dieser Button sitzt
  // inzwischen auch verschachtelt in einem <Link> (CartPageClient,
  // OrdersListClient) — stopPropagation allein verhindert nur, dass Links
  // eigener onClick-Handler (der die Client-Navigation auslöst) feuert,
  // nicht aber die native Standard-Navigation des <a>-Tags. Ohne
  // preventDefault würde ein Klick auf "ID kopieren" den Text zwar
  // kopieren, aber trotzdem zur Bild-Shopseite wechseln.
  async function copyId(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    await navigator.clipboard.writeText(id);
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    // size="sm" (Preview) ist h-7 — dieselbe Höhe wie die icon-sm-Buttons
    // daneben (Bearbeiten/Löschen/Schließen), auf Wunsch des Users
    // vereinheitlicht (vorher h-9, an das Adress-Badge oben links
    // angeglichen — das saß dadurch aber nicht mehr auf gleicher Höhe wie
    // seine direkten Nachbarn in derselben Button-Gruppe). size="xs"
    // (Kachel) entsprechend h-6, dieselbe Höhe wie dortige icon-xs-
    // Nachbarn. BUTTON_GLASS_CLASS statt fester Marken-Farbe — siehe
    // Begründung dort/bei den Nachbar-Buttons oben rechts.
    <span
      className={cn(buttonVariants({ size, variant: "secondary" }), "gap-1.5", BUTTON_GLASS_CLASS, "text-primary", className)}
      data-testid={testId}
    >
      <button
        type="button"
        aria-label={onOpenPreview ? "Vollbild öffnen" : "ID kopieren"}
        onClick={
          onOpenPreview
            ? (event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenPreview();
              }
            : copyId
        }
      >
        ID {id}
      </button>
      <button type="button" aria-label="ID kopieren" data-testid={`${testId}-copy`} onClick={copyId}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  );
}

/**
 * Favoriten-Umschalter — auf Wunsch des Users sowohl auf der Kachel
 * (image-thumbnail-card.tsx) als auch im Preview nutzbar, exportiert wie
 * CopyableId (siehe dortiger Kommentar zur Begründung: gemeinsame Quelle
 * statt einer zweiten, potenziell auseinanderdriftenden Kopie). Anders als
 * user_tags gibt es hier kein Owner-Konzept — jede Session verwaltet
 * ausschließlich ihre eigene Favoriten-Zeile (siehe toggleFavorite in
 * actions.ts), daher kein canManage*-Check nötig.
 *
 * Gefüllt vs. Umriss transportiert den Zustand (kein neuer Farbton nötig —
 * dieselbe BUTTON_GLASS_CLASS+text-primary-Fläche wie die Nachbar-Buttons).
 * Anonyme Besucher: derselbe Hinweis-Popover-Zweig wie beim User-Tag-
 * "+"-Button (siehe dort in dieser Datei bzw. image-thumbnail-card.tsx),
 * nur mit anderem Text — Favorisieren erfordert zwingend eine Session, da
 * die Zeile in image_favorites an eine user_id gebunden ist.
 */
export function FavoriteButton({
  isFavorite,
  onToggle,
  isLoggedIn,
  size = "icon-sm",
  className,
  testId,
  loginLinkTestId,
}: {
  isFavorite: boolean;
  onToggle: () => void;
  isLoggedIn: boolean;
  size?: "icon-sm" | "icon-xs";
  className?: string;
  testId?: string;
  loginLinkTestId?: string;
}) {
  const [isLoginHintOpen, setIsLoginHintOpen] = useState(false);
  const iconClassName = size === "icon-sm" ? "size-4" : "size-3.5";

  if (!isLoggedIn) {
    return (
      <Popover open={isLoginHintOpen} onOpenChange={setIsLoginHintOpen}>
        <PopoverTrigger
          type="button"
          aria-label="Anmelden, um Favoriten zu speichern"
          data-testid={testId}
          onClick={(event) => event.stopPropagation()}
          className={cn(buttonVariants({ variant: "secondary", size }), BUTTON_GLASS_CLASS, "text-primary", className)}
        >
          <Heart className={iconClassName} />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-3 text-xs" onClick={(event) => event.stopPropagation()}>
          <p className="text-muted-foreground">Melde dich an, um Favoriten zu speichern.</p>
          <Link
            href="/login"
            data-testid={loginLinkTestId}
            className="mt-2 inline-block font-medium text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            Jetzt anmelden
          </Link>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Button
      type="button"
      size={size}
      variant="secondary"
      className={cn(BUTTON_GLASS_CLASS, "text-primary", className)}
      aria-label={isFavorite ? "Von Favoriten entfernen" : "Zu Favoriten hinzufügen"}
      data-testid={testId}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Heart className={iconClassName} fill={isFavorite ? "currentColor" : "none"} />
    </Button>
  );
}

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

/**
 * Liefert die max-width/max-height, ab der ein <img> NICHT mehr über seine
 * tatsächliche Auflösung hinaus hochskaliert wird — kombiniert per CSS
 * min() mit der üblichen 85vw/85vh-Deckelung, sodass beide Grenzen
 * gleichzeitig gelten (auf kleinen Viewports weiterhin normal verkleinern,
 * auf großen NIE über die Originalgröße hinaus vergrößern).
 *
 * NICHT einfach naturalWidth/naturalHeight direkt als CSS-px-Grenze zu
 * nehmen (das wäre object-fit: scale-down, siehe frühere Version dieses
 * Kommentars) — das ignoriert devicePixelRatio: auf einem HiDPI/Retina-
 * Display (DPR 1.25–2, sehr verbreitet) braucht eine CSS-Box VOR der
 * DPR-Umrechnung bereits mehr GERÄTE-Pixel, als das Bild überhaupt an
 * Quellpixeln hat, sobald die Box mehr als naturalWidth/DPR CSS-Pixel
 * breit ist — das Bild wirkte dadurch selbst innerhalb der "richtigen"
 * CSS-Pixel-Grenze noch spürbar weich/hochskaliert (vom User bestätigt).
 * Erst die Division durch devicePixelRatio hier liefert die tatsächliche
 * "nie mehr als 1 Quellpixel pro Geräte-Pixel"-Grenze.
 *
 * Nimmt src als Parameter statt (wie in einer früheren Version) die
 * Neuberechnung rein an einen ref-Callback zu hängen: PreviewImage mountet
 * ihr <img>-Element beim Blättern bewusst NICHT neu (für den Crossfade,
 * siehe dortiger Kommentar) — ein ref-Callback feuert aber nur beim
 * tatsächlichen Mounten/Unmounten des DOM-Knotens, nicht wenn nur dessen
 * src-Attribut wechselt. Die Deckelung blieb dadurch beim Blättern auf den
 * Maßen des ALLERERSTEN geladenen Bilds eingefroren — ein neues, eigentlich
 * größeres Bild wurde fälschlich auf die kleinere Größe des ursprünglichen
 * Bilds gedeckelt (vom User gemeldet: Preview "nimmt nicht die Höhe an, die
 * es sollte" nach Weiter/Zurück).
 *
 * Der src-Wechsel wird SYNCHRON WÄHREND DES RENDERNS erkannt (state bündelt
 * src + maxSize, verglichen wie current/row in PreviewImage oben) statt in
 * einem Effekt zurückgesetzt — ein unconditional setState() am Anfang eines
 * Effekt-Bodys triggert unnötige Extra-Renders (react-hooks/set-state-in-effect)
 * und würde für einen Frame die falsche (alte) Deckelung zeigen.
 *
 * useLayoutEffect statt useEffect für die Neuberechnung: bei einem bereits
 * im Browser-Cache liegenden Bild (z.B. Zurück-Blättern zu einem schon
 * gesehenen Bild) ist img.complete sofort wahr, die richtige Deckelung
 * also sofort berechenbar — mit useEffect (läuft NACH dem Browser-Paint)
 * malte der Browser dazwischen kurz die lockere 85vh/85vw-CSS-Deckelung
 * (kein maxSize gesetzt), bevor der Effekt auf die eigentlich richtige,
 * engere Größe zurückschrumpfte. useLayoutEffect läuft synchron VOR dem
 * Paint, der Browser zeigt im Cache-Fall dadurch nie den Zwischenzustand.
 *
 * Bei einem tatsächlich noch ladenden (nicht gecachten) Bild reicht das
 * allein aber NICHT — dort bleibt für die reale Ladezeit unvermeidbar eine
 * Lücke, in der die neue Auflösung noch nicht bekannt ist. Ein `maxSize:
 * null` in dieser Lücke (frühere Version) ließ die AUSSERE Box (die sich
 * an der `current`-Bildgröße orientiert, nicht an der weiterhin sichtbaren,
 * absolut positionierten `previous`) auf die lockere 85vh/85vw-Deckelung
 * aufblähen, WÄHREND das alte Bild darin noch normal sichtbar blieb —
 * dadurch wuchs der sichtbare Rahmen sofort bei jedem Klick auf ein noch
 * nicht gecachtes Bild spürbar auf, bevor er auf die richtige Größe
 * zurückschrumpfte (vom User bestätigt: "flackert noch immer auf", auch
 * nach dem useLayoutEffect-Fix). Der alte, bereits bekannte maxSize-Wert
 * bleibt deshalb als Platzhalter bestehen, bis die neue Größe feststeht —
 * die Box behält währenddessen ihre vorherige, bereits stimmige Größe statt
 * auf die lockere CSS-Deckelung zu springen.
 */
function useNoUpscaleStyle(src: string): [React.RefObject<HTMLImageElement | null>, CSSProperties | undefined] {
  const [state, setState] = useState<{ src: string; maxSize: { width: number; height: number } | null }>({
    src,
    maxSize: null,
  });
  if (state.src !== src) setState({ src, maxSize: state.maxSize });
  const imgRef = useRef<HTMLImageElement | null>(null);

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const apply = () => {
      const dpr = window.devicePixelRatio || 1;
      setState({ src, maxSize: { width: img.naturalWidth / dpr, height: img.naturalHeight / dpr } });
    };
    // Aus dem Browser-Cache bedientes Bild ist schon "complete", bevor React
    // den onLoad-Handler anhängt — derselbe Zwei-Wege-Ansatz wie checkOrientation
    // in image-thumbnail-card.tsx.
    if (img.complete && img.naturalWidth > 0) apply();
    else img.addEventListener("load", apply, { once: true });
    return () => img.removeEventListener("load", apply);
  }, [src]);

  if (!state.maxSize) return [imgRef, undefined];
  return [
    imgRef,
    { maxWidth: `min(85vw, ${state.maxSize.width}px)`, maxHeight: `min(85vh, ${state.maxSize.height}px)` },
  ];
}

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

  const [previousRef, previousStyle] = useNoUpscaleStyle(previous?.previewUrl ?? "");
  const [currentRef, currentStyle] = useNoUpscaleStyle(current.previewUrl);

  // Echtes ALLERERSTES Laden dieser PreviewImage-Instanz (kein previous zum
  // Zwischenhalten, currentStyle noch unbekannt): useNoUpscaleStyle hat hier
  // (anders als beim Blättern, siehe dortiger Kommentar) keinen vorherigen
  // maxSize-Wert, auf den sie sich als Platzhalter stützen könnte — die
  // ALLERERSTE Größe ist per Definition noch nicht bekannt. Ohne eigene
  // Behandlung bliebe die Box in dieser Lücke auf der losen 85vh/85vw-
  // CSS-Deckelung, bis das Bild fertig geladen ist und auf die richtige,
  // meist deutlich kleinere Größe zusammenschrumpft — vom User beim Öffnen
  // per Kartenklick gemeldet ("Preview kurz vergrößert dargestellt, erst
  // dann reduziert sich die Ansicht"). PreviewImage mountet bei JEDEM
  // Öffnen aus geschlossenem Zustand neu (siehe "Bewusst KEIN key={row.id}"-
  // Kommentar am Aufrufer — das <img> darin bleibt zwar über Zeilenwechsel
  // hinweg gemountet, die gesamte PreviewImage-Instanz aber nicht über
  // Schließen/Wiederöffnen), betrifft also jedes Öffnen, nicht nur den
  // allerersten Aufruf der App. Statt der aufgeblähten Box zeigt dieser
  // Zweig einen Spinner in einer bescheidenen, festen Box (dieselbe Idee
  // wie beim Lade-Spinner der Karten-Hover-Vorschau) — das <img> lädt
  // weiterhin unsichtbar im Hintergrund, bis currentStyle bekannt ist.
  const isFirstLoadPending = !previous && !currentStyle;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        isFirstLoadPending ? "size-72" : "max-h-[85vh] max-w-[85vw]"
      )}
    >
      {isFirstLoadPending && <Loader2 className="size-8 animate-spin text-white/70" />}
      {previous && (
        // eslint-disable-next-line @next/next/no-img-element -- fertige
        // Vollbild-Datei aus S3, next/image bringt hier keine Optimierung.
        <img
          ref={previousRef}
          src={previous.previewUrl}
          alt={previous.mainLocation ?? ""}
          className="absolute inset-0 m-auto max-h-[85vh] max-w-[85vw] object-contain"
          {...NO_CASUAL_DOWNLOAD_PROPS}
          style={{ ...NO_CASUAL_DOWNLOAD_PROPS.style, ...previousStyle }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- fertige
          Vollbild-Datei aus S3, next/image bringt hier keine Optimierung. */}
      <img
        ref={currentRef}
        src={current.previewUrl}
        alt={current.mainLocation ?? ""}
        className={cn(
          "relative max-h-[85vh] max-w-[85vw] object-contain",
          isFirstLoadPending && "invisible absolute",
          previous && !isEntering ? "opacity-0" : "transition-opacity duration-300 opacity-100"
        )}
        {...NO_CASUAL_DOWNLOAD_PROPS}
        style={{ ...NO_CASUAL_DOWNLOAD_PROPS.style, ...currentStyle }}
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
 * oben links (Hauptadresse) bleibt — anders als das kleine Adress-Badge
 * auf der Kachel — beim Hovern sichtbar stehen.
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
  onToggleFavorite,
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
  onToggleFavorite?: () => void;
  /** Zum vorherigen/nächsten Bild der aktuell geladenen Liste wechseln —
   * fehlt (undefined), wenn es keins gibt (Rand der Liste), der Slider-
   * Button wird dann gar nicht erst gerendert statt deaktiviert angezeigt. */
  onPrev?: () => void;
  onNext?: () => void;
  /** Standort-Punkt oben rechts, neben Bearbeiten/Löschen/Schließen (siehe
   * ImageMapDot) — dieselbe Farbe wie der zugehörige Karten-Marker. */
  dotColor: string;
  onLocateOnMap: (row: ImageSearchRow) => void;
}) {
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");
  const [isLoginHintOpen, setIsLoginHintOpen] = useState(false);
  // Wie auf der Kachel (image-thumbnail-card.tsx): hält das Hover-Fade-Panel
  // offen, solange eines der per Portal gerenderten Popover (Kürzungs-Tooltip
  // oder "+N"-Übersicht) noch geöffnet ist — sonst könnte das Panel wegrutschen
  // (reines CSS group-hover), während sein eigener Popover-Inhalt noch sichtbar ist.
  const [isOverflowPopoverOpen, setIsOverflowPopoverOpen] = useState(false);
  // Explizites initialFocus auf den Schließen-Button: seit die Hauptadresse
  // bei abgeschnittenem Text einen echten Button (TruncatedTooltipText/
  // PopoverTrigger) enthält, ist SIE das erste fokussierbare Element im
  // Popup — ohne dieses Ref würde Base UI beim Öffnen automatisch dorthin
  // fokussieren (samt sichtbarem Fokusring um die Adresse), statt wie
  // vorher auf gar nichts Auffälliges.
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  function submitNewTag() {
    const trimmed = newTagValue.trim();
    if (trimmed) onAddUserTag?.(trimmed);
    setNewTagValue("");
    setIsAddingTag(false);
  }

  // Anders als auf der schmalen Kachel (dort begrenzt MAX_VISIBLE_* den
  // Kandidaten-Pool VOR jeder Messung, da eine ~300px breite Karte ohnehin
  // nie mehr als eine Handvoll Badges zeigen könnte) gibt es hier KEINEN
  // künstlichen Pool-Deckel: der Kandidaten-Pool ist immer die VOLLSTÄNDIGE
  // Liste. Das breite Preview-Panel hat oft spürbar mehr Platz, als ein
  // kleiner fester Deckel ausnutzen würde — mit einem Deckel blieben Zeilen
  // dann vorzeitig halbleer stehen, obwohl noch echte Badges reingepasst
  // hätten. useFittingCount ermittelt stattdessen per echter Breitenmessung,
  // wie viele TATSÄCHLICH passen (reduziert die sichtbare Anzahl, statt
  // jedes Badge bis zur Unlesbarkeit zu stauchen) — die Zeile füllt sich
  // dadurch immer bis zum tatsächlich verfügbaren Platz, das letzte
  // sichtbare Badge darf sich per FittingBadges zusätzlich per Ellipsis in
  // den Restplatz hinein kürzen. Die Hooks laufen unconditional (row kann
  // null sein, wenn das Popup zu ist) — Rules of Hooks.
  const secondaryLocationCandidates = row?.secondaryLocations ?? [];
  const [secondaryLocationsRowRef, secondaryLocationsFitCount] = useFittingCount(secondaryLocationCandidates.length);
  const visibleSecondaryLocations = secondaryLocationCandidates.slice(0, secondaryLocationsFitCount);
  const hiddenLocationCount = (row?.secondaryLocations.length ?? 0) - visibleSecondaryLocations.length;

  const tagCandidates = row?.tags ?? [];
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
  const userTagCandidates = userTagsWithPermission;
  // isAddingTag als zusätzlicher Reset-Trigger (Parität zur Kachel, siehe
  // dort für die ausführliche Begründung): ohne das bleibt die Zeile nach
  // dem Einklappen des Eingabefelds auf einem zuvor (wegen des breiteren
  // Felds) reduzierten Stand hängen, obwohl wieder mehr Badges passen würden.
  const [userTagsRowRef, userTagsFitCount] = useFittingCount(userTagCandidates.length, isAddingTag);
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
            State-Update. Der Öffnen-Fade (data-open:*) bleibt erhalten.
            backdrop-blur-sm (auf Wunsch des Users, Hintergrund beim
            geöffneten Preview verschwommen) ist bewusst NUR auf diesem
            unanimiert schließenden Overlay gelandet — genau das war beim
            damaligen Flacker-Bug die problematische Kombination
            (backdrop-blur MIT animiertem Entfernen), nicht backdrop-blur an
            sich. */}
        <DialogPrimitive.Backdrop
          data-slot="dialog-overlay"
          className="fixed inset-0 isolate z-50 bg-black/10 backdrop-blur-sm duration-300 data-open:animate-in data-open:fade-in-0"
        />
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          initialFocus={closeButtonRef}
          className="fixed inset-0 z-50 flex items-center justify-center p-8 outline-none data-open:animate-in data-open:fade-in-0"
          // Jeder Klick irgendwo im Fenster schließt das Popup — auch auf
          // dem Bild selbst oder auf nicht-interaktiven Elementen (Badges,
          // Panel-Hintergrund) —, außer ein Button/Popover-Trigger/Link/
          // Eingabefeld auf dem Weg nach oben ruft selbst
          // event.stopPropagation() auf (macht in dieser Datei praktisch
          // jedes interaktive Element bereits). Vorher nur bei einem Klick
          // exakt auf den Rahmen selbst (event.target === currentTarget,
          // also nur außerhalb der Bild-Box) — auf Wunsch des Users jetzt
          // bewusst weiter gefasst.
          onClick={() => onOpenChange(false)}
        >
          {row && (
            <div className="flex items-center gap-4">
              {/* Slider-Buttons als normale Flex-Geschwister der Bild-Box
                  statt fixed am Viewport-Rand — vorher saßen sie IMMER an
                  fester Stelle links/rechts im Viewport, bei einem
                  schmaleren Bild (z.B. Hochformat, das lange nicht die
                  vollen 85vw ausnutzt) dadurch weit außerhalb mit viel
                  Leerraum dazwischen (vom User bemängelt). Als Flex-
                  Geschwister rücken sie automatisch direkt an den
                  tatsächlichen Bildrand heran, unabhängig vom
                  Seitenverhältnis. shrink-0, damit sie bei einem sehr
                  breiten Bild nicht selbst gestaucht werden. Nur
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
                  className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/60 bg-primary/40 text-primary-foreground backdrop-blur-sm outline-none transition-colors hover:bg-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ChevronLeft className="size-5" />
                </button>
              )}

              {/* outline-4 statt border-4: hebt das Bild deutlich vom
                  (ebenfalls dunklen) Overlay-Hintergrund ab, als es die
                  ursprünglich sehr dezente border-white/10 tat (auf Wunsch
                  des Users dicker, 3-4px). Ein ECHTER border-4 hier hätte
                  das Bild/den unteren Info-Panel-Verlauf um genau seine
                  Breite eingerückt (border sitzt INNERHALB der Box, wird
                  von overflow-hidden mitbegrenzt) — sichtbar als heller
                  Streifen ("Spalt") zwischen dem dunklen Panel-Verlauf
                  unten und dem eigentlichen Bildrand (per Pixel-Messung
                  bestätigt: rgb(38,38,38) Rand-Streifen vs. rgb(20,19,17)
                  Panel direkt daneben). outline wird dagegen AUSSERHALB
                  der Box gezeichnet, verkleinert den Bildinhalt nicht und
                  folgt in modernen Browsern trotzdem dem rounded-xl.
                  duration-300 (statt der Tailwind-Standarddauer von
                  150ms): der Öffnen-Fade sollte bewusst spürbar sein,
                  nicht nur angedeutet — [[data-open]_&] liest den
                  offen-Zustand vom Popup-Vorfahren. */}
              <div
                className="group relative flex max-h-[85vh] max-w-[85vw] items-center justify-center overflow-hidden rounded-xl bg-black outline-4 outline-white/15 duration-300 [[data-open]_&]:animate-in [[data-open]_&]:fade-in-0"
                data-testid={`image-preview-${row.id}`}
              >
                {/* Bewusst KEIN key={row.id}: PreviewImage muss über den
                    Zeilenwechsel hinweg gemountet bleiben, damit sie das
                    vorherige Bild für den Crossfade selbst zwischenhält. */}
                <PreviewImage row={row} />

                {/* Oben links: Hauptadresse, dauerhaft sichtbar (nicht wie
                    das kleine Kachel-Badge beim Hovern ausblendend).
                    TruncatedTooltipText sorgt bei abgeschnittenem Text für
                    einen gestylten Tooltip (Popover-Look wie auf der
                    Kachel) statt eines nativen title-Tooltips. Die "ID"
                    (images.hash) sitzt NICHT mehr hier, sondern nur beim
                    Hovern links neben der Button-Gruppe oben rechts (siehe
                    dort, CopyableId) — auf Wunsch des Users. BUTTON_GLASS_CLASS
                    statt der festen Coral-Fläche: nachdem die Button-Gruppe
                    rechts auf neutrales Glas umgestellt wurde, wirkte dieses
                    Badge als einziges noch kräftig coral-farbenes Element
                    wie ein Fremdkörper — jetzt eine durchgängige Glas-Optik
                    über die ganze obere Leiste, Coral bleibt als Akzent nur
                    noch bei Icon/Text (text-primary statt
                    text-primary-foreground, das für die vorherige satte
                    Fläche gedacht war). */}
                <Badge className={cn("absolute top-3 left-3 h-9 cursor-default gap-2 px-3 text-sm text-primary", BUTTON_GLASS_CLASS)}>
                  <MapPin className="size-4 shrink-0" />
                  {/* flex statt eines "nackten" Spans: der PopoverTrigger
                      (<button>) in TruncatedTooltipText ist inline-block
                      mit vertical-align:baseline — das reserviert unterhalb
                      automatisch den Zeilenabstand der Schrift als Lücke
                      (derselbe Effekt wie bei <img> im Textfluss), wodurch
                      der Text gegenüber dem Icon zu weit oben saß. Als
                      Flex-Container mit items-center wird der Trigger
                      stattdessen sauber vertikal zentriert statt an der
                      Baseline ausgerichtet. */}
                  <span className="flex max-w-96 min-w-0 items-center">
                    <TruncatedTooltipText text={row.mainLocation ?? EMPTY_PLACEHOLDER} testId="image-preview-mainlocation-hint" />
                  </span>
                </Badge>

                {/* Oben rechts: Bearbeiten/Löschen/Standort-Punkt/Schließen
                    jetzt als EINE einheitliche Gruppe (vorher: Bearbeiten/
                    Löschen im unteren Hover-Panel, Standort-Punkt unten
                    rechts am Bild, nur Schließen oben) — auf Wunsch des
                    Users zusammengefasst, etwas größer (icon-sm/size-7 statt
                    icon-xs/size-6). Hintergrund neutrales "Frosted Glass"
                    (bg-black/30 + backdrop-blur-sm + border-white/15, siehe
                    BUTTON_GLASS_CLASS) statt einer festen Marken-Farbe: eine
                    frühere Coral-Fläche (bg-primary/40) wirkte wie ein
                    aufgesetztes Chip, unabhängig vom jeweiligen
                    Bildausschnitt dahinter — das neutrale Glas passt sich
                    stattdessen an JEDEN Bildinhalt an (dunkel genug für
                    Kontrast auf hellen Fotostellen, bleibt aber überall
                    gleich). Icon-/Textfarbe bleibt weiterhin Coral
                    (Bearbeiten) bzw. destructive-Rot (Löschen) für die
                    gewohnte Bedeutungs-Farbcodierung — nur die Fläche
                    dahinter ist jetzt neutral. "ID"/Bearbeiten/Löschen
                    blenden erst beim Hovern ein (dieselbe opacity-0/
                    group-hover-Technik wie beim unteren Info-Panel) —
                    Standort-Punkt und Schließen bleiben dagegen dauerhaft
                    sichtbar. */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <CopyableId id={row.hash} />
                    {canEdit && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="secondary"
                        className={cn(BUTTON_GLASS_CLASS, "text-primary")}
                        aria-label="Bearbeiten"
                        data-testid={`image-preview-edit-${row.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(row);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="destructive"
                        className={cn(BUTTON_GLASS_CLASS, "text-destructive")}
                        aria-label="Löschen"
                        data-testid={`image-preview-delete-${row.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(row);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                  {/* Immer sichtbar (nicht im Hover-Fade-Wrapper von
                      Bearbeiten/Löschen/ID oben) — Favorisieren ist eine für
                      jeden Betrachter jederzeit greifbare Aktion, keine
                      Owner-/Admin-Aktion wie Bearbeiten/Löschen. */}
                  <FavoriteButton
                    isFavorite={row.isFavorite}
                    isLoggedIn={Boolean(currentUser?.id)}
                    onToggle={() => onToggleFavorite?.()}
                    testId={`image-preview-favorite-${row.id}`}
                    loginLinkTestId={`image-preview-favorite-login-link-${row.id}`}
                  />
                  {/* Bestellen — dasselbe "immer sichtbar, kein Hover-Fade"-
                      Prinzip wie Favorisieren daneben: eine für jeden
                      Betrachter jederzeit greifbare Aktion. */}
                  <AddToCartButton imageId={row.id} testId={`image-preview-add-to-cart-${row.id}`} />
                  {/* bordered={false}: der dezente weiße Rand (Standard in
                      diesem Popup, siehe ImageMapDot) störte hier laut User —
                      genau wie auf der Kachel (dort ohnehin schon ohne Rand).
                      Der Punkt selbst ist ohnehin voll deckend (siehe
                      ImageMapDot), braucht die Glas-Behandlung der anderen
                      Buttons hier nicht. */}
                  <ImageMapDot className="size-7" color={dotColor} onClick={() => onLocateOnMap(row)} bordered={false} />
                  <DialogPrimitive.Close
                    ref={closeButtonRef}
                    aria-label="Schließen"
                    data-testid="image-preview-close"
                    className={cn(buttonVariants({ variant: "secondary", size: "icon-sm" }), BUTTON_GLASS_CLASS, "text-primary")}
                  >
                    <XIcon className="size-4" />
                  </DialogPrimitive.Close>
                </div>

                {/* Hover-Fade-Panel unten — 1:1 dieselbe Technik wie auf der
                    Kachel (siehe image-thumbnail-card.tsx), nur etwas größer
                    skaliert (mehr Platz) und um Bearbeiten/Löschen ergänzt. */}
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100",
                    // Bleibt offen, solange das Tag-Eingabefeld, der
                    // Login-Hinweis-Popover oder eines der Kürzungs-/"+N"-
                    // Popover aktiv ist — siehe Begründung in
                    // image-thumbnail-card.tsx (dieselbe Technik).
                    (isAddingTag || isLoginHintOpen || isOverflowPopoverOpen) && "translate-y-0 opacity-100"
                  )}
                >
                  <div className="pointer-events-auto space-y-1.5 bg-gradient-to-t from-background/95 via-background/75 to-transparent px-4 pt-8 pb-3">
                    <div className="-mt-8 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />

                    {/* Bearbeiten/Löschen sitzen jetzt oben rechts (siehe
                        dortiger Kommentar) — diese Zeile enthält daher nur
                        noch die Hauptadresse, keine zweite Spalte mehr. */}
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <MapPin className="size-3.5 shrink-0 text-primary" />
                      {/* Badge statt einfachem <span> — sonst fehlt hier das
                          Innenpolster, das jede andere Zeile (Nebenadressen/
                          Tags/User-Tags) durch ihre Badges bekommt, und der
                          Text sitzt eine Nuance weiter links als der Rest
                          ("Einrückung passt nicht"). */}
                      <Badge
                        variant="secondary"
                        // BUTTON_GLASS_CLASS wie Tags/User-Tags — auf Wunsch
                        // des Users nach dem Stiltausch nun einheitlich
                        // überall im unteren Info-Panel dieselbe neutrale
                        // Glas-Optik, für Haupt- UND Nebenadressen hier
                        // identisch.
                        className={cn("min-w-0 shrink cursor-default text-xs text-primary", BUTTON_GLASS_CLASS)}
                      >
                        {/* TruncatedTooltipText statt Span+title: bei echter
                            Ellipsen-Kürzung derselbe gestylte Popover-Look wie
                            die "+N"-Chips statt eines verzögerten nativen
                            Browser-Tooltips (Parität zur Kachel). */}
                        <TruncatedTooltipText
                          text={row.mainLocation ?? EMPTY_PLACEHOLDER}
                          testId={`image-preview-mainlocation-panel-hint-${row.id}`}
                          onOpenChange={setIsOverflowPopoverOpen}
                        />
                      </Badge>
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
                        {/* min-w-0 nötig: ein flex-1-Kind bleibt sonst per
                            CSS-Spec (min-width: auto) mindestens so breit
                            wie sein Inhalt und wächst bei vielen Badges über
                            den tatsächlich verfügbaren Platz hinaus — genau
                            der Fall, seit der Kandidaten-Pool nicht mehr
                            künstlich gedeckelt ist. Ohne min-w-0 melden
                            scrollWidth/clientWidth dann fälschlich "kein
                            Overflow" (beide wachsen gemeinsam mit), obwohl
                            der Inhalt sichtbar aus dem Panel herausläuft. */}
                        <div ref={secondaryLocationsRowRef} className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden">
                          {/* max-w-full statt eines festen px-Werts (siehe
                              gleiche Begründung in image-thumbnail-card.tsx):
                              useFittingCount regelt die Anzahl bereits nach
                              Platz, FittingBadges lässt zusätzlich nur das
                              letzte sichtbare Badge in den Restplatz hinein
                              per Ellipsis schrumpfen (Parität zur Kachel). */}
                          <FittingBadges
                            items={visibleSecondaryLocations}
                            getKey={(location) => location}
                            badgeClassName={cn("max-w-full cursor-default text-xs text-primary", BUTTON_GLASS_CLASS)}
                          >
                            {(location) => (
                              <TruncatedTooltipText
                                text={location}
                                testId={`image-preview-location-hint-${row.id}-${location}`}
                                onOpenChange={setIsOverflowPopoverOpen}
                              />
                            )}
                          </FittingBadges>
                          <OverflowBadgesPopover
                            className={cn("ml-auto text-primary", BUTTON_GLASS_CLASS)}
                            hiddenCount={hiddenLocationCount}
                            items={row.secondaryLocations}
                            testId={`image-preview-locations-overflow-${row.id}`}
                            onOpenChange={setIsOverflowPopoverOpen}
                            renderItem={(location) => (
                              <Badge
                                key={location}
                                variant="secondary"
                                className={cn("max-w-full shrink-0 cursor-default text-xs text-primary", BUTTON_GLASS_CLASS)}
                              >
                                <span className="min-w-0 truncate">{location}</span>
                              </Badge>
                            )}
                          />
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
                        <TagIcon className={cn("mt-0.5 size-3.5 shrink-0", TAG_ACCENT_TEXT_CLASS)} />
                        {/* min-w-0 nötig — siehe Kommentar bei den
                            Nebenadressen oben. */}
                        <div ref={tagsRowRef} className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden">
                          <FittingBadges
                            items={visibleTags}
                            getKey={(tag) => tag}
                            badgeClassName={cn("max-w-full cursor-default text-xs", TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
                          >
                            {(tag) => (
                              <TruncatedTooltipText
                                text={tag}
                                testId={`image-preview-tag-hint-${row.id}-${tag}`}
                                onOpenChange={setIsOverflowPopoverOpen}
                              />
                            )}
                          </FittingBadges>
                          <OverflowBadgesPopover
                            className={cn("ml-auto", TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
                            hiddenCount={hiddenTagCount}
                            items={row.tags}
                            testId={`image-preview-tags-overflow-${row.id}`}
                            onOpenChange={setIsOverflowPopoverOpen}
                            renderItem={(tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className={cn("max-w-full shrink-0 cursor-default text-xs", TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
                              >
                                <span className="min-w-0 truncate">{tag}</span>
                              </Badge>
                            )}
                          />
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
                      <UserTagsIcon className={cn("mt-0.5 size-3.5 shrink-0", TAG_ACCENT_TEXT_CLASS)} />
                      {/* min-w-0 nötig — siehe Kommentar bei den
                          Nebenadressen weiter oben. */}
                      <div ref={userTagsRowRef} className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-hidden">
                        {/* Während der Eingabe (isAddingTag) verschwindet die
                            Badge-Liste zugunsten des Eingabefelds — siehe
                            dessen eigenen Kommentar weiter unten (Parität zur
                            Kachel, siehe dort für die ausführliche
                            Begründung). */}
                        {!isAddingTag && (
                          <FittingBadges
                            items={visibleUserTags}
                            getKey={(entry) => `${entry.tag}-${entry.addedBy ?? "legacy"}`}
                            badgeClassName={cn("max-w-full gap-1 cursor-default text-xs", TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
                          >
                            {(entry) => (
                              <>
                                <TruncatedTooltipText
                                  text={entry.tag}
                                  testId={`image-preview-user-tag-hint-${row.id}-${entry.tag}`}
                                  onOpenChange={setIsOverflowPopoverOpen}
                                />
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
                              </>
                            )}
                          </FittingBadges>
                        )}
                        {/* "+" bleibt IN der normalen Zeilenreihenfolge
                            (shrink-0, kein ml-auto) — sitzt also immer
                            unmittelbar rechts vom letzten sichtbaren
                            User-Tag. Nur "+N" (weiter unten) bekommt sein
                            eigenes ml-auto und rückt für sich an den rechten
                            Rand (Parität zur Kachel — dort war die
                            Reihenfolge früher vertauscht). */}
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
                              // Pill-Stil wie die Tag-Badges daneben statt
                              // eines unauffälligen Rechteck-Feldes (Parität
                              // zur Kachel, dort dasselbe Muster mit deren
                              // eigenem Coral-Stil) — hier mit den bereits
                              // etablierten Zeilen-Klassen (TAG_GLASS_CLASS/
                              // TAG_ACCENT_TEXT_CLASS) statt fester Farb-
                              // Literale. flex-1 statt fester Breite: das
                              // Feld füllt beim Öffnen die ganze Zeile aus
                              // (bis auf den Platz für "+N" rechts).
                              className={cn(
                                "h-5 min-w-0 flex-1 animate-in appearance-none rounded-4xl border bg-clip-padding px-2 text-xs placeholder:text-white/40 outline-none transition-colors duration-150 zoom-in-95 fade-in-0",
                                TAG_ACCENT_TEXT_CLASS,
                                TAG_GLASS_CLASS
                              )}
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
                        <OverflowBadgesPopover
                          className={cn("ml-auto", TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
                          hiddenCount={hiddenUserTagCount}
                          items={userTagsWithPermission}
                          testId={`image-preview-user-tags-overflow-${row.id}`}
                          onOpenChange={setIsOverflowPopoverOpen}
                          renderItem={(entry) => (
                            <Badge
                              key={`${entry.tag}-${entry.addedBy ?? "legacy"}`}
                              variant="secondary"
                              className={cn("max-w-full shrink-0 cursor-default gap-1 text-xs", TAG_ACCENT_TEXT_CLASS, TAG_GLASS_CLASS)}
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
                          )}
                        />
                      </div>
                    </div>
                  </div>
                </div>

              </div>
              {onNext && (
                <button
                  type="button"
                  aria-label="Nächstes Bild"
                  data-testid="image-preview-next"
                  onClick={(event) => {
                    event.stopPropagation();
                    onNext();
                  }}
                  className="z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/60 bg-primary/40 text-primary-foreground backdrop-blur-sm outline-none transition-colors hover:bg-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ChevronRight className="size-5" />
                </button>
              )}
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
