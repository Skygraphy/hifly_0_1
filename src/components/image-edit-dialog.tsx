"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateImageMetadata, type ImageSearchRow } from "@/app/images/actions";

function toCommaList(values: string[]): string {
  return values.join(", ");
}

function fromCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Ändert NUR Anzeige-/Sichtbarkeits-Metadaten (siehe updateImageMetadata) —
 * kein Standort-Feld hier, das bleibt Aufgabe des "Abgleich"-Flows. Keine
 * user_tags hier — die haben jetzt eine eigene Eigentümerschaft pro Tag und
 * werden direkt in der Kachel verwaltet (siehe image-thumbnail-card.tsx),
 * nicht per Freitext-Bulk-Ersetzung.
 */
export function ImageEditDialog({
  row,
  canManagePrintFields,
  onOpenChange,
  onSaved,
}: {
  row: ImageSearchRow | null;
  /** print_visible/print_ranking dürfen nur vom super_admin geändert werden
   * — auch der Owner-admin eines Bildes nicht (siehe updateImageMetadata). */
  canManagePrintFields: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: ImageSearchRow) => void;
}) {
  const [mainLocation, setMainLocation] = useState("");
  const [secondaryLocations, setSecondaryLocations] = useState("");
  const [tags, setTags] = useState("");
  const [webVisible, setWebVisible] = useState(false);
  const [webRanking, setWebRanking] = useState("");
  const [printVisible, setPrintVisible] = useState(false);
  const [printRanking, setPrintRanking] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!row) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMainLocation(row.mainLocation ?? "");
    setSecondaryLocations(toCommaList(row.secondaryLocations));
    setTags(toCommaList(row.tags));
    setWebVisible(row.webVisible ?? false);
    setWebRanking(row.webRanking?.toString() ?? "");
    setPrintVisible(row.printVisible ?? false);
    setPrintRanking(row.printRanking?.toString() ?? "");
    setError(null);
  }, [row]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!row) return;
    setError(null);
    startTransition(async () => {
      const input = {
        id: row.id,
        mainLocation: mainLocation.trim() || null,
        secondaryLocations: fromCommaList(secondaryLocations),
        tags: fromCommaList(tags),
        webVisible,
        webRanking: toNumberOrNull(webRanking),
        printVisible,
        printRanking: toNumberOrNull(printRanking),
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
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="image-main-location">Hauptort</Label>
              <Input
                id="image-main-location"
                data-testid="image-edit-main-location"
                value={mainLocation}
                onChange={(event) => setMainLocation(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="image-secondary-locations">Nebenorte (kommagetrennt)</Label>
              <Input
                id="image-secondary-locations"
                data-testid="image-edit-secondary-locations"
                value={secondaryLocations}
                onChange={(event) => setSecondaryLocations(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="image-tags">Tags (kommagetrennt)</Label>
              <Input
                id="image-tags"
                data-testid="image-edit-tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="image-web-visible">Im Web sichtbar</Label>
              <Switch
                id="image-web-visible"
                data-testid="image-edit-web-visible"
                checked={webVisible}
                onCheckedChange={setWebVisible}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="image-web-ranking">Web-Ranking</Label>
              <Input
                id="image-web-ranking"
                data-testid="image-edit-web-ranking"
                type="number"
                value={webRanking}
                onChange={(event) => setWebRanking(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="image-print-visible">
                Für Druck sichtbar
                {!canManagePrintFields && <span className="ml-1 text-xs text-muted-foreground">(nur super_admin)</span>}
              </Label>
              <Switch
                id="image-print-visible"
                data-testid="image-edit-print-visible"
                checked={printVisible}
                disabled={!canManagePrintFields}
                onCheckedChange={setPrintVisible}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="image-print-ranking">
                Druck-Ranking
                {!canManagePrintFields && <span className="ml-1 text-xs text-muted-foreground">(nur super_admin)</span>}
              </Label>
              <Input
                id="image-print-ranking"
                data-testid="image-edit-print-ranking"
                type="number"
                value={printRanking}
                disabled={!canManagePrintFields}
                onChange={(event) => setPrintRanking(event.target.value)}
              />
            </div>
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
