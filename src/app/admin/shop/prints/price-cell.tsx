"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setShopPrintFormatPrice } from "./actions";
import { showAppAlert } from "@/lib/app-alert";

/** Cent-Betrag <-> Euro-Textfeld, z.B. 1900 <-> "19.00". */
function centsToEuroString(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toFixed(2);
}

function euroStringToCents(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

/**
 * Eine Zelle der Preis-Matrix (Format × Druckqualität) — dieselbe Logik wie
 * PriceCell im Paket-Bereich (src/app/admin/shop/price-cell.tsx), nur an
 * setShopPrintFormatPrice/printFormatId/printQualityId angepasst.
 */
export function PrintPriceCell({
  printFormatId,
  printQualityId,
  initialPriceCents,
}: {
  printFormatId: string;
  printQualityId: string;
  initialPriceCents: number | null;
}) {
  const [value, setValue] = useState(centsToEuroString(initialPriceCents));
  const [lastSavedValue, setLastSavedValue] = useState(centsToEuroString(initialPriceCents));
  const [isPending, startTransition] = useTransition();

  const cents = euroStringToCents(value);
  const isInvalid = value.trim() !== "" && cents === null;
  const hasUnsavedChange = value !== lastSavedValue;

  function save() {
    if (cents === null) return;
    startTransition(async () => {
      const result = await setShopPrintFormatPrice(printFormatId, printQualityId, cents);
      if (!result.success) {
        showAppAlert(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setLastSavedValue(value);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={isPending}
        placeholder="—"
        className={cn("w-20", isInvalid && "border-destructive")}
        data-testid={`print-price-cell-${printFormatId}-${printQualityId}`}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={isPending || isInvalid || !hasUnsavedChange || value.trim() === ""}
        onClick={save}
        data-testid={`print-price-cell-save-${printFormatId}-${printQualityId}`}
      >
        ✓
      </Button>
    </div>
  );
}
