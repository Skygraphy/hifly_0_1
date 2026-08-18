"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorField } from "@/components/ui/color-field";
import { ADMINISTRATIVE_LEVEL_LABELS, pathToRoot, type AdministrativeUnit } from "@/lib/administrative-units";
import { createRegion, updateRegion, deleteRegion, setRegionUnitsWithinScope } from "./region-actions";
import type { Region } from "@/lib/regions";
import type { ColumnRegionsTarget } from "./types";
import { showAppAlert } from "@/lib/app-alert";

function pathLabel(unit: AdministrativeUnit, byId: Map<string, AdministrativeUnit>): string {
  return pathToRoot(unit.id, byId)
    .map((id) => byId.get(id)?.name)
    .filter(Boolean)
    .join(" › ");
}

/**
 * Bearbeiten einer BESTEHENDEN Region — über das Stift-Icon einer
 * Gegend-Zeile geöffnet (nicht über "+ Neu anlegen", das ist ausschließlich
 * für Neuanlagen). Kombiniert die Stammdaten (Name/Beschreibung/Farbe) mit
 * der Verknüpfung: eine Checkbox-Liste der Einheiten GENAU der Spalte, in
 * der die Zeile angeklickt wurde (candidateUnits aus target), dazu eine
 * Übersicht aller tatsächlich verknüpften Einheiten (auch außerhalb dieser
 * Spalte), damit die Checkbox-Vorbelegung nie unerklärlich leer wirkt (siehe
 * setRegionUnitsWithinScope: Speichern rührt nie Verknüpfungen außerhalb
 * dieser Spalte an).
 */
export function RegionFormDialog({
  region,
  target,
  unitIdsByRegion,
  byId,
  onClose,
  onSaved,
}: {
  region: Region;
  target: ColumnRegionsTarget;
  unitIdsByRegion: Map<string, Set<string>>;
  byId: Map<string, AdministrativeUnit>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(region.name);
  const [description, setDescription] = useState(region.description ?? "");
  const [color, setColor] = useState(region.color ?? "");
  const linked = unitIdsByRegion.get(region.id) ?? new Set<string>();
  const [checked, setChecked] = useState<Set<string>>(
    new Set(target.candidateUnits.filter((unit) => linked.has(unit.id)).map((unit) => unit.id))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const linkedUnits = Array.from(linked)
    .map((id) => byId.get(id))
    .filter((unit): unit is AdministrativeUnit => Boolean(unit));
  // Eine Region ohne jede Verknüpfung darf es per Definition nicht geben —
  // Verknüpfungen außerhalb dieser Spalte (linkedUnits, die nicht in
  // target.candidateUnits liegen) bleiben von diesem Speichern unberührt
  // und zählen daher mit.
  const candidateIds = new Set(target.candidateUnits.map((unit) => unit.id));
  const willHaveNoLinks = checked.size === 0 && linkedUnits.every((unit) => candidateIds.has(unit.id));

  function toggle(unitId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const updateResult = await updateRegion(region.id, {
        name,
        description: description.trim() || null,
        color: color.trim() || null,
      });
      if (!updateResult.success) {
        setError(updateResult.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      const linksResult = await setRegionUnitsWithinScope(
        region.id,
        target.candidateUnits.map((unit) => unit.id),
        Array.from(checked)
      );
      if (!linksResult.success) {
        setError(linksResult.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Region bearbeiten</DialogTitle>
            <DialogDescription>
              Die Verknüpfung wirkt sich nur auf die {ADMINISTRATIVE_LEVEL_LABELS[target.level]}-Einheiten
              dieser Spalte aus — Verknüpfungen zu Einheiten in anderen Ästen bleiben unverändert.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="region-name">Name</Label>
              <Input
                id="region-name"
                data-testid="region-form-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="region-description">Beschreibung</Label>
              <Input
                id="region-description"
                data-testid="region-form-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <ColorField id="region-color" data-testid="region-form-color" value={color} onChange={setColor} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Verknüpfte {ADMINISTRATIVE_LEVEL_LABELS[target.level]}-Einheiten dieser Spalte</Label>
            <p data-testid="column-regions-current-links" className="text-xs text-muted-foreground">
              {linkedUnits.length > 0
                ? `Insgesamt aktuell verknüpft mit: ${linkedUnits.map((unit) => pathLabel(unit, byId)).join(", ")}`
                : "Noch mit keiner Einheit verknüpft."}
            </p>
            <div className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded border p-2">
              {target.candidateUnits.map((unit) => (
                <label key={unit.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    data-testid={`column-regions-unit-checkbox-${unit.id}`}
                    checked={checked.has(unit.id)}
                    onChange={() => toggle(unit.id)}
                  />
                  {unit.name}
                </label>
              ))}
            </div>
            {willHaveNoLinks && (
              <p data-testid="region-form-no-links-hint" className="text-xs text-destructive">
                Eine Region braucht mindestens eine Verknüpfung.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" data-testid="region-form-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Abbrechen
            </Button>
            <Button type="submit" data-testid="region-form-submit" disabled={isPending || willHaveNoLinks}>
              {isPending ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRegionDialog({
  region,
  onClose,
  onDeleted,
}: {
  region: Region;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>„{region.name}&rdquo; wirklich löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Damit werden auch alle Verknüpfungen zu Verwaltungseinheiten entfernt. Das kann
            nicht rückgängig gemacht werden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            data-testid="region-confirm-delete"
            onClick={() => {
              startTransition(async () => {
                const result = await deleteRegion(region.id);
                if (!result.success) {
                  showAppAlert(result.error ?? "Löschen fehlgeschlagen.");
                  return;
                }
                onDeleted();
              });
            }}
          >
            {isPending ? "Wird gelöscht…" : "Endgültig löschen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Ausschließlich für die NEUANLAGE einer Region, von "+ Neu anlegen"
 * geöffnet — zeigt bewusst KEINE bestehenden Regionen zur Auswahl (dafür ist
 * "+ Neu anlegen" nicht da; bestehende Regionen werden über deren eigenes
 * Stift-Icon bearbeitet/verknüpft, siehe RegionFormDialog oben). Die
 * Kandidatenliste ist dadurch immer kurz (nur die Geschwister dieser einen
 * Spalte) und Speichern rührt nie Verknüpfungen zu Einheiten in anderen
 * Ästen an (siehe setRegionUnitsWithinScope).
 */
export function CreateColumnRegionDialog({
  target,
  onClose,
  onSaved,
}: {
  target: ColumnRegionsTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(unitId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createRegion(
        { name, description: description.trim() || null, color: color.trim() || null },
        { parentId: target.parentId, level: target.level },
        Array.from(checked)
      );
      if (!result.success) {
        setError(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="column-regions-dialog">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Neue Region</DialogTitle>
            <DialogDescription>
              Verknüpft nur mit den {ADMINISTRATIVE_LEVEL_LABELS[target.level]}-Einheiten dieser Spalte —
              mindestens eine Einheit muss angehakt sein. Weitere Verknüpfungen lassen sich später über
              das Bearbeiten-Icon der Region hier ergänzen.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="column-regions-new-name">Name</Label>
              <Input
                id="column-regions-new-name"
                data-testid="column-regions-new-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="column-regions-new-description">Beschreibung</Label>
              <Input
                id="column-regions-new-description"
                data-testid="column-regions-new-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <ColorField
              id="column-regions-new-color"
              data-testid="column-regions-new-color"
              value={color}
              onChange={setColor}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Einheiten dieser Spalte verknüpfen</Label>
            <div className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded border p-2">
              {target.candidateUnits.map((unit) => (
                <label key={unit.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    data-testid={`column-regions-unit-checkbox-${unit.id}`}
                    checked={checked.has(unit.id)}
                    onChange={() => toggle(unit.id)}
                  />
                  {unit.name}
                </label>
              ))}
            </div>
            {checked.size === 0 && (
              <p data-testid="column-regions-no-links-hint" className="text-xs text-destructive">
                Eine Region braucht mindestens eine Verknüpfung.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" data-testid="column-regions-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Abbrechen
            </Button>
            <Button type="submit" data-testid="column-regions-submit" disabled={isPending || checked.size === 0}>
              {isPending ? "Speichert…" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

