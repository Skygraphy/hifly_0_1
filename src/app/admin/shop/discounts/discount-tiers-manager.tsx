"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiscountTierFormDialog, DeleteDiscountTierDialog } from "./discount-tier-dialogs";
import { formatPriceCents } from "@/lib/shop";
import type { ShopDiscountTier } from "@/lib/orders";

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; tier: ShopDiscountTier }
  | { mode: "delete"; tier: ShopDiscountTier }
  | null;

/**
 * Verwaltung der Staffel-Rabatte auf den Warenwert einer Bestellung (siehe
 * Konzept-Plan Abschnitt 7) — gleiches Listen-/Dialog-Muster wie
 * ShopCatalogManager (src/app/admin/shop/packages/shop-catalog-manager.tsx),
 * bewusst als eigene, kleinere Seite statt in die Paket-/Druck-Verwaltung
 * gemischt: Rabattstufen gelten für die GESAMTE Bestellung (Pakete UND
 * Drucke zusammen), nicht für eine der beiden Produktlinien.
 */
export function DiscountTiersManager({ tiers }: { tiers: ShopDiscountTier[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(() => router.refresh());
  }

  const sortedTiers = [...tiers].sort((a, b) => a.thresholdCents - b.thresholdCents);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            Rabattstufen
            <Button
              size="sm"
              variant="outline"
              data-testid="discount-tier-create-open"
              onClick={() => setDialog({ mode: "create" })}
            >
              <Plus className="size-4" />
              Neue Stufe
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {sortedTiers.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Rabattstufen angelegt.</p>
          )}
          {sortedTiers.map((tier) => (
            <div
              key={tier.id}
              data-testid={`discount-tier-row-${tier.id}`}
              className="flex items-center gap-3 rounded-lg border px-3 py-2"
            >
              <p className="flex-1 text-sm font-medium">
                Ab {formatPriceCents(tier.thresholdCents)} → {tier.discountPercent} % Rabatt
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Bearbeiten"
                data-testid={`discount-tier-edit-${tier.id}`}
                onClick={() => setDialog({ mode: "edit", tier })}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Löschen"
                data-testid={`discount-tier-delete-${tier.id}`}
                onClick={() => setDialog({ mode: "delete", tier })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {dialog?.mode === "create" && (
        <DiscountTierFormDialog
          tier={null}
          nextSortOrder={tiers.length}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog?.mode === "edit" && (
        <DiscountTierFormDialog
          tier={dialog.tier}
          nextSortOrder={tiers.length}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog?.mode === "delete" && (
        <DeleteDiscountTierDialog
          tier={dialog.tier}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
