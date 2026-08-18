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
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/rich-text-editor";
import {
  createShopPrintFormat,
  updateShopPrintFormat,
  deleteShopPrintFormat,
  createShopPrintQuality,
  updateShopPrintQuality,
  deleteShopPrintQuality,
} from "./actions";
import { showAppAlert } from "@/lib/app-alert";
import type { ShopPrintFormat, ShopPrintQuality } from "@/lib/shop";

export function PrintFormatFormDialog({
  format,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  /** null = Neuanlage. */
  format: ShopPrintFormat | null;
  /** Vorschlag für sortOrder bei Neuanlage (ans Ende der bestehenden Liste). */
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(format?.name ?? "");
  const [description, setDescription] = useState(format?.description ?? "");
  const [widthCm, setWidthCm] = useState(format?.widthCm ?? 0);
  const [heightCm, setHeightCm] = useState(format?.heightCm ?? 0);
  const [sortOrder, setSortOrder] = useState(format?.sortOrder ?? nextSortOrder);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = { name, description, widthCm, heightCm, sortOrder };
      const result = format ? await updateShopPrintFormat(format.id, input) : await createShopPrintFormat(input);
      if (!result.success) {
        setError(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{format ? "Druckformat bearbeiten" : "Neues Druckformat"}</DialogTitle>
            <DialogDescription>
              Physisches Ausdruck-Format, das Bildern zugewiesen und pro Druckqualität bepreist wird.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="print-format-name">Name</Label>
              <Input
                id="print-format-name"
                data-testid="print-format-form-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
              />
            </div>
            <RichTextEditor
              label="Beschreibung"
              value={description}
              onChange={setDescription}
              placeholder="Für wen eignet sich dieses Format, was kann man damit machen…"
              testId="print-format-form-description"
            />
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="print-format-width">Breite (cm)</Label>
                <NumberInput
                  id="print-format-width"
                  step="0.1"
                  data-testid="print-format-form-width"
                  value={widthCm}
                  onChange={(event) => setWidthCm(Number(event.target.value))}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="print-format-height">Höhe (cm)</Label>
                <NumberInput
                  id="print-format-height"
                  step="0.1"
                  data-testid="print-format-form-height"
                  value={heightCm}
                  onChange={(event) => setHeightCm(Number(event.target.value))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="print-format-sort-order">Reihenfolge</Label>
              <NumberInput
                id="print-format-sort-order"
                data-testid="print-format-form-sort-order"
                value={sortOrder}
                onChange={(event) => setSortOrder(Number(event.target.value))}
              />
            </div>
            {error && (
              <p role="alert" data-testid="print-format-form-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Abbrechen
            </Button>
            <Button type="submit" data-testid="print-format-form-submit" disabled={isPending}>
              {isPending ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePrintFormatDialog({
  format,
  onClose,
  onDeleted,
}: {
  format: ShopPrintFormat;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>„{format.name}&rdquo; wirklich löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Damit werden auch alle Preise sowie sämtliche Standort- und Bild-Zuordnungen dieses Formats
            unwiderruflich gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            data-testid="print-format-confirm-delete"
            onClick={() => {
              startTransition(async () => {
                const result = await deleteShopPrintFormat(format.id);
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

export function PrintQualityFormDialog({
  quality,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  /** null = Neuanlage. */
  quality: ShopPrintQuality | null;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(quality?.name ?? "");
  const [description, setDescription] = useState(quality?.description ?? "");
  const [sortOrder, setSortOrder] = useState(quality?.sortOrder ?? nextSortOrder);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = { name, description, sortOrder };
      const result = quality
        ? await updateShopPrintQuality(quality.id, input)
        : await createShopPrintQuality(input);
      if (!result.success) {
        setError(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{quality ? "Druckqualität bearbeiten" : "Neue Druckqualität"}</DialogTitle>
            <DialogDescription>Gemeinsame Qualität, die jedes Format unabhängig bepreist.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="print-quality-name">Name</Label>
              <Input
                id="print-quality-name"
                data-testid="print-quality-form-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
              />
            </div>
            <RichTextEditor
              label="Beschreibung"
              value={description}
              onChange={setDescription}
              placeholder="Was zeichnet diese Druckqualität aus…"
              testId="print-quality-form-description"
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="print-quality-sort-order">Reihenfolge</Label>
              <NumberInput
                id="print-quality-sort-order"
                data-testid="print-quality-form-sort-order"
                value={sortOrder}
                onChange={(event) => setSortOrder(Number(event.target.value))}
              />
            </div>
            {error && (
              <p role="alert" data-testid="print-quality-form-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Abbrechen
            </Button>
            <Button type="submit" data-testid="print-quality-form-submit" disabled={isPending}>
              {isPending ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePrintQualityDialog({
  quality,
  onClose,
  onDeleted,
}: {
  quality: ShopPrintQuality;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>„{quality.name}&rdquo; wirklich löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Damit werden auch alle Preise sowie sämtliche Standort- und Bild-Zuordnungen, die diese Druckqualität
            verwenden, unwiderruflich gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            data-testid="print-quality-confirm-delete"
            onClick={() => {
              startTransition(async () => {
                const result = await deleteShopPrintQuality(quality.id);
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
