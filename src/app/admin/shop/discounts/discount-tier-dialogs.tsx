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
import { createShopDiscountTier, updateShopDiscountTier, deleteShopDiscountTier } from "./actions";
import { showAppAlert } from "@/lib/app-alert";
import { formatPriceCents } from "@/lib/shop";
import type { ShopDiscountTier } from "@/lib/orders";

/** Cent-Betrag <-> Euro-Textfeld, gleiches Muster wie price-cell.tsx. */
function centsToEuroString(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

function euroStringToCents(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

export function DiscountTierFormDialog({
  tier,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  /** null = Neuanlage. */
  tier: ShopDiscountTier | null;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [thresholdEuro, setThresholdEuro] = useState(centsToEuroString(tier?.thresholdCents ?? null));
  const [discountPercent, setDiscountPercent] = useState(tier?.discountPercent ?? 10);
  const [sortOrder, setSortOrder] = useState(tier?.sortOrder ?? nextSortOrder);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const thresholdCents = euroStringToCents(thresholdEuro);
  const isThresholdInvalid = thresholdEuro.trim() !== "" && thresholdCents === null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (thresholdCents === null) {
      setError("Bestellwert ist ein Pflichtfeld.");
      return;
    }
    startTransition(async () => {
      const input = { thresholdCents, discountPercent, sortOrder };
      const result = tier ? await updateShopDiscountTier(tier.id, input) : await createShopDiscountTier(input);
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
            <DialogTitle>{tier ? "Rabattstufe bearbeiten" : "Neue Rabattstufe"}</DialogTitle>
            <DialogDescription>
              Ab diesem Warenwert (Zwischensumme der Bestellpositionen, vor Versand) gilt der Rabatt automatisch für
              die gesamte Bestellung.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="discount-tier-threshold">Ab Bestellwert (Euro)</Label>
              <Input
                id="discount-tier-threshold"
                type="text"
                inputMode="decimal"
                data-testid="discount-tier-form-threshold"
                value={thresholdEuro}
                onChange={(event) => setThresholdEuro(event.target.value)}
                className={isThresholdInvalid ? "border-destructive" : undefined}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="discount-tier-percent">Rabatt (%)</Label>
              <NumberInput
                id="discount-tier-percent"
                min={1}
                max={100}
                data-testid="discount-tier-form-percent"
                value={discountPercent}
                onChange={(event) => setDiscountPercent(Number(event.target.value))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="discount-tier-sort-order">Reihenfolge</Label>
              <NumberInput
                id="discount-tier-sort-order"
                data-testid="discount-tier-form-sort-order"
                value={sortOrder}
                onChange={(event) => setSortOrder(Number(event.target.value))}
              />
            </div>
            {error && (
              <p role="alert" data-testid="discount-tier-form-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Abbrechen
            </Button>
            <Button type="submit" data-testid="discount-tier-form-submit" disabled={isPending}>
              {isPending ? "Speichert…" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDiscountTierDialog({
  tier,
  onClose,
  onDeleted,
}: {
  tier: ShopDiscountTier;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Rabattstufe „ab {formatPriceCents(tier.thresholdCents)}&rdquo; wirklich löschen?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Bereits abgeschlossene Bestellungen behalten ihren eingefrorenen Rabatt-Snapshot — nur zukünftige
            Bestellungen erhalten diese Stufe dann nicht mehr.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            data-testid="discount-tier-confirm-delete"
            onClick={() => {
              startTransition(async () => {
                const result = await deleteShopDiscountTier(tier.id);
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
