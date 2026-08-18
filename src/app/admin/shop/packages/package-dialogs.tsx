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
import { TagInputField } from "@/components/tag-input-field";
import { RichTextEditor } from "@/components/rich-text-editor";
import {
  createShopPackage,
  updateShopPackage,
  deleteShopPackage,
  createShopPackageCategory,
  updateShopPackageCategory,
  deleteShopPackageCategory,
} from "./actions";
import { showAppAlert } from "@/lib/app-alert";
import type { ShopPackage, ShopPackageCategory } from "@/lib/shop";

export function PackageFormDialog({
  pkg,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  /** null = Neuanlage. */
  pkg: ShopPackage | null;
  /** Vorschlag für sortOrder bei Neuanlage (ans Ende der bestehenden Liste). */
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(pkg?.name ?? "");
  const [description, setDescription] = useState(pkg?.description ?? "");
  const [includedFiles, setIncludedFiles] = useState<string[]>(pkg?.includedFiles ?? []);
  const [sortOrder, setSortOrder] = useState(pkg?.sortOrder ?? nextSortOrder);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = { name, description, includedFiles, sortOrder };
      const result = pkg ? await updateShopPackage(pkg.id, input) : await createShopPackage(input);
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
            <DialogTitle>{pkg ? "Paket bearbeiten" : "Neues Paket"}</DialogTitle>
            <DialogDescription>
              Bundle aus Dateivarianten, das Bildern zugewiesen und pro Kategorie bepreist wird.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="package-name">Name</Label>
              <Input
                id="package-name"
                data-testid="package-form-name"
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
              placeholder="Für wen eignet sich dieses Paket, was kann man damit machen…"
              testId="package-form-description"
            />
            <TagInputField
              id="package-included-files"
              testId="package-form-included-files"
              label="Enthaltene Dateien"
              values={includedFiles}
              onChange={setIncludedFiles}
              placeholder="z.B. medium.jpg…"
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="package-sort-order">Reihenfolge</Label>
              <NumberInput
                id="package-sort-order"
                data-testid="package-form-sort-order"
                value={sortOrder}
                onChange={(event) => setSortOrder(Number(event.target.value))}
              />
            </div>
            {error && (
              <p role="alert" data-testid="package-form-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Abbrechen
            </Button>
            <Button type="submit" data-testid="package-form-submit" disabled={isPending}>
              {isPending ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePackageDialog({
  pkg,
  onClose,
  onDeleted,
}: {
  pkg: ShopPackage;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>„{pkg.name}&rdquo; wirklich löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Damit werden auch alle Preise sowie sämtliche Standort- und Bild-Zuordnungen dieses Pakets unwiderruflich
            gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            data-testid="package-confirm-delete"
            onClick={() => {
              startTransition(async () => {
                const result = await deleteShopPackage(pkg.id);
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

export function CategoryFormDialog({
  category,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  /** null = Neuanlage. */
  category: ShopPackageCategory | null;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [sortOrder, setSortOrder] = useState(category?.sortOrder ?? nextSortOrder);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const input = { name, sortOrder };
      const result = category ? await updateShopPackageCategory(category.id, input) : await createShopPackageCategory(input);
      if (!result.success) {
        setError(result.error ?? "Speichern fehlgeschlagen.");
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
            <DialogTitle>{category ? "Kategorie bearbeiten" : "Neue Kategorie"}</DialogTitle>
            <DialogDescription>Gemeinsame Kategorie, die jedes Paket unabhängig bepreist.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                data-testid="category-form-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category-sort-order">Reihenfolge</Label>
              <NumberInput
                id="category-sort-order"
                data-testid="category-form-sort-order"
                value={sortOrder}
                onChange={(event) => setSortOrder(Number(event.target.value))}
              />
            </div>
            {error && (
              <p role="alert" data-testid="category-form-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Abbrechen
            </Button>
            <Button type="submit" data-testid="category-form-submit" disabled={isPending}>
              {isPending ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCategoryDialog({
  category,
  onClose,
  onDeleted,
}: {
  category: ShopPackageCategory;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>„{category.name}&rdquo; wirklich löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Damit werden auch alle Preise sowie sämtliche Standort- und Bild-Zuordnungen, die diese Kategorie
            verwenden, unwiderruflich gelöscht.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            data-testid="category-confirm-delete"
            onClick={() => {
              startTransition(async () => {
                const result = await deleteShopPackageCategory(category.id);
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
