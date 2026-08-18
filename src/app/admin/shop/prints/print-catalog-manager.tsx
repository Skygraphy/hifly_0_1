"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PrintFormatFormDialog,
  DeletePrintFormatDialog,
  PrintQualityFormDialog,
  DeletePrintQualityDialog,
} from "./print-format-dialogs";
import { PrintPriceCell } from "./price-cell";
import { setShopPrintFormatFeatured } from "./actions";
import { showAppAlert } from "@/lib/app-alert";
import { cn } from "@/lib/utils";
import type { ShopPrintFormat, ShopPrintQuality, ShopPrintFormatPrice } from "@/lib/shop";

type FormatDialogState =
  | { mode: "create" }
  | { mode: "edit"; format: ShopPrintFormat }
  | { mode: "delete"; format: ShopPrintFormat }
  | null;
type QualityDialogState =
  | { mode: "create" }
  | { mode: "edit"; quality: ShopPrintQuality }
  | { mode: "delete"; quality: ShopPrintQuality }
  | null;

function formatCm(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

export function PrintCatalogManager({
  formats,
  qualities,
  prices,
}: {
  formats: ShopPrintFormat[];
  qualities: ShopPrintQuality[];
  prices: ShopPrintFormatPrice[];
}) {
  const router = useRouter();
  const [formatDialog, setFormatDialog] = useState<FormatDialogState>(null);
  const [qualityDialog, setQualityDialog] = useState<QualityDialogState>(null);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    startTransition(() => router.refresh());
  }

  function toggleFeatured(format: ShopPrintFormat) {
    startTransition(async () => {
      const result = await setShopPrintFormatFeatured(format.id, !format.isFeatured);
      if (!result.success) {
        showAppAlert(result.error ?? "Aktion fehlgeschlagen.");
        return;
      }
      router.refresh();
    });
  }

  const priceByKey = new Map(prices.map((price) => [`${price.printFormatId}:${price.printQualityId}`, price.priceCents]));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            Druckformate
            <Button
              size="sm"
              variant="outline"
              data-testid="print-format-create-open"
              onClick={() => setFormatDialog({ mode: "create" })}
            >
              <Plus className="size-4" />
              Neues Format
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {formats.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Formate angelegt.</p>}
          {formats.map((format) => (
            <div
              key={format.id}
              data-testid={`print-format-row-${format.id}`}
              className="flex items-center gap-3 rounded-lg border px-3 py-2"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">
                    {format.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({formatCm(format.widthCm)}×{formatCm(format.heightCm)} cm)
                    </span>
                  </p>
                  {format.isFeatured && (
                    <Badge variant="default" className="gap-1" data-testid={`print-format-featured-badge-${format.id}`}>
                      <Star className="size-3" />
                      Am beliebtesten
                    </Badge>
                  )}
                </div>
                {format.description ? (
                  // dangerouslySetInnerHTML: Beschreibung stammt ausschließlich
                  // vom super_admin (RichTextEditor), siehe Begründung bei
                  // ShopCatalogManager (src/app/admin/shop/shop-catalog-manager.tsx).
                  <div
                    className="mt-1 line-clamp-3 text-xs text-muted-foreground [&_em]:italic [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4"
                    data-testid={`print-format-description-${format.id}`}
                    dangerouslySetInnerHTML={{ __html: format.description }}
                  />
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground italic">Keine Beschreibung</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={format.isFeatured ? "Als „Am beliebtesten“ entfernen" : "Als „Am beliebtesten“ markieren"}
                disabled={isPending}
                data-testid={`print-format-toggle-featured-${format.id}`}
                onClick={() => toggleFeatured(format)}
              >
                <Star className={cn("size-4", format.isFeatured && "fill-current text-primary")} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Bearbeiten"
                data-testid={`print-format-edit-${format.id}`}
                onClick={() => setFormatDialog({ mode: "edit", format })}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Löschen"
                data-testid={`print-format-delete-${format.id}`}
                onClick={() => setFormatDialog({ mode: "delete", format })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            Druckqualitäten
            <Button
              size="sm"
              variant="outline"
              data-testid="print-quality-create-open"
              onClick={() => setQualityDialog({ mode: "create" })}
            >
              <Plus className="size-4" />
              Neue Druckqualität
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {qualities.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Druckqualitäten angelegt.</p>}
          {qualities.map((quality) => (
            <div
              key={quality.id}
              data-testid={`print-quality-row-${quality.id}`}
              className="flex items-center gap-3 rounded-lg border px-3 py-2"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{quality.name}</p>
                {quality.description ? (
                  // dangerouslySetInnerHTML: Beschreibung stammt ausschließlich
                  // vom super_admin (RichTextEditor), siehe Begründung bei
                  // ShopCatalogManager (src/app/admin/shop/shop-catalog-manager.tsx).
                  <div
                    className="mt-1 line-clamp-3 text-xs text-muted-foreground [&_em]:italic [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4"
                    data-testid={`print-quality-description-${quality.id}`}
                    dangerouslySetInnerHTML={{ __html: quality.description }}
                  />
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground italic">Keine Beschreibung</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Bearbeiten"
                data-testid={`print-quality-edit-${quality.id}`}
                onClick={() => setQualityDialog({ mode: "edit", quality })}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Löschen"
                data-testid={`print-quality-delete-${quality.id}`}
                onClick={() => setQualityDialog({ mode: "delete", quality })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Preise (Euro)</CardTitle>
        </CardHeader>
        <CardContent>
          {formats.length === 0 || qualities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Es müssen zuerst mindestens ein Format und eine Druckqualität angelegt sein.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Format</TableHead>
                  {qualities.map((quality) => (
                    <TableHead key={quality.id}>{quality.name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {formats.map((format) => (
                  <TableRow key={format.id}>
                    <TableCell className="font-medium">{format.name}</TableCell>
                    {qualities.map((quality) => (
                      <TableCell key={quality.id}>
                        <PrintPriceCell
                          printFormatId={format.id}
                          printQualityId={quality.id}
                          initialPriceCents={priceByKey.get(`${format.id}:${quality.id}`) ?? null}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {formatDialog?.mode === "create" && (
        <PrintFormatFormDialog
          format={null}
          nextSortOrder={formats.length}
          onClose={() => setFormatDialog(null)}
          onSaved={() => {
            setFormatDialog(null);
            refresh();
          }}
        />
      )}
      {formatDialog?.mode === "edit" && (
        <PrintFormatFormDialog
          format={formatDialog.format}
          nextSortOrder={formats.length}
          onClose={() => setFormatDialog(null)}
          onSaved={() => {
            setFormatDialog(null);
            refresh();
          }}
        />
      )}
      {formatDialog?.mode === "delete" && (
        <DeletePrintFormatDialog
          format={formatDialog.format}
          onClose={() => setFormatDialog(null)}
          onDeleted={() => {
            setFormatDialog(null);
            refresh();
          }}
        />
      )}

      {qualityDialog?.mode === "create" && (
        <PrintQualityFormDialog
          quality={null}
          nextSortOrder={qualities.length}
          onClose={() => setQualityDialog(null)}
          onSaved={() => {
            setQualityDialog(null);
            refresh();
          }}
        />
      )}
      {qualityDialog?.mode === "edit" && (
        <PrintQualityFormDialog
          quality={qualityDialog.quality}
          nextSortOrder={qualities.length}
          onClose={() => setQualityDialog(null)}
          onSaved={() => {
            setQualityDialog(null);
            refresh();
          }}
        />
      )}
      {qualityDialog?.mode === "delete" && (
        <DeletePrintQualityDialog
          quality={qualityDialog.quality}
          onClose={() => setQualityDialog(null)}
          onDeleted={() => {
            setQualityDialog(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
