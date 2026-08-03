"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { TagInputField } from "@/components/tag-input-field";
import { StarRatingField } from "@/components/star-rating-field";
import { canManageUserTag, type Role } from "@/lib/authorization";
import { updateImageMetadata, type ImageSearchRow } from "@/app/images/actions";

// Der Standard-Label-Stil (text-sm, volle Vordergrundfarbe) wirkte in
// diesem Formular zu groß/hell neben den eigentlichen Werten — dieselbe
// kleinere, gedämpfte Kombination wie bei Popup-Menü-Sektionsköpfen
// (siehe DropdownMenuLabel/SelectLabel in ui/dropdown-menu.tsx bzw.
// ui/select.tsx: text-xs font-medium text-muted-foreground).
const FIELD_LABEL_CLASS = "text-xs font-medium text-muted-foreground";

/**
 * User-Tags-Sektion: anders als Nebenorte/Tags (Bulk-Ersetzung erst beim
 * "Speichern") ist jeder User-Tag eine unabhängige, sofort persistierte
 * Aktion — genau wie auf der Kachel/im Vollbild-Popup (siehe
 * image-thumbnail-card.tsx/image-preview-popup.tsx). onAddUserTag wird
 * daher direkt beim Enter aufgerufen, nicht erst beim Formular-Submit.
 * Kein Formularfeld für anonyme Besucher — die Server-Action verlangt
 * ohnehin eine Session (siehe addUserTag in src/app/images/actions.ts).
 */
function UserTagsField({
  row,
  currentUser,
  onAddUserTag,
  onRemoveUserTag,
}: {
  row: ImageSearchRow;
  currentUser: { id?: string; role: Role } | null;
  onAddUserTag?: (tag: string) => void;
  onRemoveUserTag?: (tag: string, addedBy: string | null) => void;
}) {
  const [draft, setDraft] = useState("");

  if (!currentUser?.id) return null;

  function commitDraft() {
    const trimmed = draft.trim();
    if (trimmed) onAddUserTag?.(trimmed);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="image-edit-user-tag-input" className={FIELD_LABEL_CLASS}>
        User-Tags
      </Label>
      {/* Kein focus-within:ring (box-shadow) — siehe Begründung in
          tag-input-field.tsx (derselbe Rand-Überlauf-Effekt). */}
      <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 transition-colors focus-within:border-ring dark:bg-input/30">
        {row.userTags.map((entry) => {
          const canManage = canManageUserTag({
            actingUserId: currentUser?.id,
            actingRole: currentUser?.role,
            tagAddedBy: entry.addedBy,
            imageUploadedBy: row.uploadedBy,
          });
          return (
            <Badge
              key={`${entry.tag}-${entry.addedBy ?? "legacy"}`}
              variant="secondary"
              className="gap-1 border-primary/30 bg-primary/20 text-primary"
            >
              <span className="max-w-40 truncate">{entry.tag}</span>
              {canManage && (
                <button
                  type="button"
                  aria-label={`Tag "${entry.tag}" entfernen`}
                  data-testid={`image-edit-user-tag-remove-${entry.tag}`}
                  onClick={() => onRemoveUserTag?.(entry.tag, entry.addedBy)}
                  className="shrink-0 rounded-full hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          );
        })}
        <input
          id="image-edit-user-tag-input"
          data-testid="image-edit-user-tag-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft();
            }
          }}
          onBlur={commitDraft}
          placeholder="Eigenen Tag hinzufügen…"
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}

/**
 * Ändert Anzeige-/Sichtbarkeits-Metadaten (siehe updateImageMetadata) —
 * kein Standort-Feld hier, das bleibt Aufgabe des "Abgleich"-Flows.
 * User-Tags sind hier zusätzlich verwaltbar (siehe UserTagsField oben),
 * aber bewusst NICHT Teil der Bulk-"Speichern"-Aktion der übrigen Felder —
 * jeder User-Tag hat eine eigene Eigentümerschaft und wird einzeln über
 * addUserTag/removeUserTag persistiert, nicht per Freitext-Bulk-Ersetzung.
 */
export function ImageEditDialog({
  row,
  canManagePrintFields,
  currentUser,
  onOpenChange,
  onSaved,
  onAddUserTag,
  onRemoveUserTag,
}: {
  row: ImageSearchRow | null;
  /** print_visible/print_ranking dürfen nur vom super_admin geändert werden
   * — auch der Owner-admin eines Bildes nicht (siehe updateImageMetadata). */
  canManagePrintFields: boolean;
  /** Für die Owner-only-Prüfung pro User-Tag (canManageUserTag) und das
   * Eingabefeld (nur sichtbar, wenn überhaupt eine Session existiert). */
  currentUser: { id?: string; role: Role } | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: ImageSearchRow) => void;
  onAddUserTag?: (tag: string) => void;
  onRemoveUserTag?: (tag: string, addedBy: string | null) => void;
}) {
  const [mainLocation, setMainLocation] = useState("");
  const [secondaryLocations, setSecondaryLocations] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [webVisible, setWebVisible] = useState(false);
  const [webRanking, setWebRanking] = useState<number | null>(null);
  const [printVisible, setPrintVisible] = useState(false);
  const [printRanking, setPrintRanking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const mainLocationRef = useRef<HTMLInputElement>(null);

  // Abhängigkeit bewusst row?.id, nicht row selbst: der Aufrufer leitet row
  // live aus rows ab (siehe editRow in images-page-client.tsx), damit ein im
  // Dialog hinzugefügter User-Tag sofort sichtbar wird — dadurch bekommt
  // row bei JEDER Änderung an rows eine neue Objekt-Referenz, auch wenn nur
  // userTags sich geändert hat. Bei Abhängigkeit auf row selbst hätte genau
  // das hier die Felder zurückgesetzt und dabei ungespeicherte Nebenorte/
  // Tags-Eingaben verworfen, sobald parallel ein User-Tag hinzugefügt wird
  // (per Test reproduziert). Mit row?.id läuft der Reset nur beim
  // tatsächlichen Wechsel auf ein anderes Bild.
  useEffect(() => {
    if (!row) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMainLocation(row.mainLocation ?? "");
    setSecondaryLocations(row.secondaryLocations);
    setTags(row.tags);
    setWebVisible(row.webVisible ?? false);
    setWebRanking(row.webRanking ?? null);
    setPrintVisible(row.printVisible ?? false);
    setPrintRanking(row.printRanking ?? null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id]);

  // Ein programmatisch (per React) gesetzter input.value verschiebt die
  // Cursor-Position auf das Ende des Texts, auch ohne Fokus — bei einem zu
  // langen Hauptort scrollte das Feld dadurch ans Textende statt (wie
  // erwartet) linksbündig den Anfang zu zeigen. requestAnimationFrame statt
  // direkt im selben Effekt: der neue value ist erst nach dem Commit des
  // durch setMainLocation ausgelösten Re-Renders tatsächlich im DOM.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      mainLocationRef.current?.setSelectionRange(0, 0);
    });
    return () => cancelAnimationFrame(raf);
  }, [row?.id]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!row) return;
    setError(null);
    startTransition(async () => {
      const input = {
        id: row.id,
        mainLocation: mainLocation.trim() || null,
        secondaryLocations,
        tags,
        webVisible,
        webRanking,
        printVisible,
        printRanking,
      };
      const result = await updateImageMetadata(input);
      if (!result.success) {
        setError(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      // Bei fehlender Berechtigung hat der Server die print-Felder
      // unverändert gelassen — hier nicht blind input übernehmen, sonst
      // würde die UI kurz die (abgelehnte) neue Eingabe zeigen.
      onSaved({
        ...row,
        ...input,
        printVisible: canManagePrintFields ? input.printVisible : row.printVisible,
        printRanking: canManagePrintFields ? input.printRanking : row.printRanking,
      });
    });
  }

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Bild bearbeiten</DialogTitle>
          </DialogHeader>
          {/* max-h/overflow-y: mit der User-Tags-Sektion dazu ist das Formular
              lang genug, um auf kleinen Viewports über den Bildschirmrand zu
              wachsen — DialogContent selbst hat kein eingebautes
              Scroll-Verhalten. overflow-x-hidden dazu: overflow-y ungleich
              visible lässt Browser die x-Achse sonst automatisch mit-
              scrollbar werden (CSS-Spec-Kopplung der beiden Achsen), auch
              wenn gar kein Kind wirklich breiter als der Dialog ist — ohne
              das hier erschien unten ein horizontaler Scrollbalken. */}
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-x-hidden overflow-y-auto">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="image-main-location" className={FIELD_LABEL_CLASS}>
                Hauptort
              </Label>
              <Input
                ref={mainLocationRef}
                id="image-main-location"
                data-testid="image-edit-main-location"
                value={mainLocation}
                onChange={(event) => setMainLocation(event.target.value)}
              />
            </div>
            <TagInputField
              id="image-secondary-locations"
              testId="image-edit-secondary-locations"
              label="Nebenorte"
              values={secondaryLocations}
              onChange={setSecondaryLocations}
              placeholder="Nebenort…"
            />
            <TagInputField
              id="image-tags"
              testId="image-edit-tags"
              label="Tags"
              values={tags}
              onChange={setTags}
              placeholder="Tag…"
            />
            {row && (
              <UserTagsField
                row={row}
                currentUser={currentUser}
                onAddUserTag={onAddUserTag}
                onRemoveUserTag={onRemoveUserTag}
              />
            )}
            {/* Trennt die Inhalts-Felder (Orte/Tags) sichtbar von den
                Sichtbarkeits-/Ranking-Einstellungen darunter — vorher klebten
                User-Tags und "Im Web sichtbar" nur durch den Standard-gap
                getrennt aneinander. Extra my-2 zusätzlich zum Eltern-gap-3:
                die Trennlinie selbst (bg-border) ist im Dark Mode bewusst
                dezent (10% Weiß, wie überall sonst im Projekt) und bräuchte
                allein etwas mehr Platz drumherum, um wirklich als
                Abschnitts-Umbruch statt als weiteres Feld zu wirken. */}
            <div className="my-2 h-px bg-border" />
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="image-web-visible" className={FIELD_LABEL_CLASS}>
                Im Web sichtbar
              </Label>
              <Switch
                id="image-web-visible"
                data-testid="image-edit-web-visible"
                checked={webVisible}
                onCheckedChange={setWebVisible}
              />
            </div>
            <StarRatingField
              id="image-web-ranking"
              testId="image-edit-web-ranking"
              label="Web-Ranking"
              value={webRanking}
              onChange={setWebRanking}
            />
            {/* Trennt den Web- vom Druck-Block, dieselbe Begründung wie beim
                Trenner oben. */}
            <div className="my-2 h-px bg-border" />
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="image-print-visible" className={FIELD_LABEL_CLASS}>
                Für Druck sichtbar
                {!canManagePrintFields && <span className="ml-1">(nur super_admin)</span>}
              </Label>
              <Switch
                id="image-print-visible"
                data-testid="image-edit-print-visible"
                checked={printVisible}
                disabled={!canManagePrintFields}
                onCheckedChange={setPrintVisible}
              />
            </div>
            <StarRatingField
              id="image-print-ranking"
              testId="image-edit-print-ranking"
              label={
                <>
                  Druck-Ranking
                  {!canManagePrintFields && <span className="ml-1">(nur super_admin)</span>}
                </>
              }
              value={printRanking}
              onChange={setPrintRanking}
              disabled={!canManagePrintFields}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" data-testid="image-edit-error">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isPending} data-testid="image-edit-save">
              {isPending ? "Wird gespeichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
