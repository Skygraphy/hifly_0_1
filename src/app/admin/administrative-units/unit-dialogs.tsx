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
import { ADMINISTRATIVE_LEVEL_LABELS } from "@/lib/administrative-units";
import { createAdministrativeUnit, updateAdministrativeUnit, deleteAdministrativeUnit } from "./actions";
import type { AdministrativeUnit, FormState } from "./types";

export function AdministrativeUnitFormDialog({
  formState,
  onClose,
  onSaved,
}: {
  formState: FormState;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const initial = formState.mode === "edit" ? formState.unit : null;
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [shortName, setShortName] = useState(initial?.shortName ?? "");
  const [color, setColor] = useState(initial?.color ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const level = formState.mode === "edit" ? formState.unit.level : formState.level;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = {
        code,
        name,
        shortName: shortName.trim() || null,
        color: color.trim() || null,
      };
      const result =
        formState.mode === "edit"
          ? await updateAdministrativeUnit(formState.unit.id, input)
          : await createAdministrativeUnit(formState.parentId, formState.level, input);

      if (!result.success || !result.id) {
        setError(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onSaved(result.id);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {formState.mode === "edit" ? "Eintrag bearbeiten" : "Neuer Eintrag"}
            </DialogTitle>
            <DialogDescription>{ADMINISTRATIVE_LEVEL_LABELS[level]}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unit-name">Name</Label>
              <Input
                id="unit-name"
                data-testid="unit-form-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unit-code">Code</Label>
              <Input
                id="unit-code"
                data-testid="unit-form-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unit-short-name">Kurzname</Label>
              <Input
                id="unit-short-name"
                data-testid="unit-form-short-name"
                value={shortName}
                onChange={(event) => setShortName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unit-color">Farbe (Hex)</Label>
              <Input
                id="unit-color"
                data-testid="unit-form-color"
                placeholder="#d9603f"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </div>
            {error && (
              <p role="alert" data-testid="unit-form-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Abbrechen
            </Button>
            <Button type="submit" data-testid="unit-form-submit" disabled={isPending}>
              {isPending ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteUnitDialog({
  unit,
  descendantCount,
  levelIndex,
  onClose,
  onDeleted,
}: {
  unit: AdministrativeUnit;
  descendantCount: number;
  levelIndex: number;
  onClose: () => void;
  onDeleted: (levelIndex: number) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>„{unit.name}&rdquo; wirklich löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            {descendantCount > 0
              ? `Damit werden auch alle ${descendantCount} untergeordneten Einträge unwiderruflich gelöscht.`
              : "Das kann nicht rückgängig gemacht werden."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            data-testid="unit-confirm-delete"
            onClick={() => {
              startTransition(async () => {
                const result = await deleteAdministrativeUnit(unit.id);
                if (!result.success) {
                  alert(result.error ?? "Löschen fehlgeschlagen.");
                  return;
                }
                onDeleted(levelIndex);
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
