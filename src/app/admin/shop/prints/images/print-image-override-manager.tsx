"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { searchImagesForShopOverride, type ShopImageSearchResult } from "../../packages/images/actions";
import {
  getPrintImageOverrides,
  getEffectivePrintFormatsForImage,
  setShopImagePrintFormatOverride,
  type PrintImageOverrideMode,
  type EffectivePrintFormatDisplayRow,
} from "./actions";
import { showAppAlert } from "@/lib/app-alert";
import type { ShopPrintFormat, ShopPrintQuality } from "@/lib/shop";

const INHERIT_VALUE = "__inherit__";
const DISABLED_VALUE = "__disabled__";

function labelForValue(value: string, qualities: ShopPrintQuality[]): string {
  if (value === INHERIT_VALUE) return "Standort-Standard";
  if (value === DISABLED_VALUE) return "Für dieses Bild deaktivieren";
  return qualities.find((quality) => quality.id === value)?.name ?? value;
}

// Eigene Funktion statt einer verschachtelten Ternary direkt an der
// Aufrufstelle — siehe Begründung in
// src/app/admin/shop/packages/images/shop-image-override-manager.tsx
// (dortige resolveOverrideSelectValue).
function resolveOverrideSelectValue(currentQualityId: string | null | undefined): string {
  if (currentQualityId === undefined) return INHERIT_VALUE;
  if (currentQualityId === null) return DISABLED_VALUE;
  return currentQualityId;
}

/**
 * Bild-Override-Verwaltung für Druckformate (super_admin, siehe
 * shop_image_print_format_assignments in src/db/schema.ts) — gleiches
 * Muster wie ShopImageOverrideManager
 * (src/app/admin/shop/packages/images/shop-image-override-manager.tsx), inkl.
 * Wiederverwendung derselben Freitextsuche (searchImagesForShopOverride,
 * domänenunabhängig). Pro Format ein Auswahlfeld: "Standort-Standard"
 * (keine Override-Zeile) / eine konkrete Druckqualität / "Für dieses Bild
 * deaktivieren" (printQualityId = null).
 */
export function PrintImageOverrideManager({
  formats,
  qualities,
}: {
  formats: ShopPrintFormat[];
  qualities: ShopPrintQuality[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShopImageSearchResult[]>([]);
  const [selected, setSelected] = useState<ShopImageSearchResult | null>(null);
  const [overrideByFormatId, setOverrideByFormatId] = useState<Map<string, string | null>>(new Map());
  const [effectiveRows, setEffectiveRows] = useState<EffectivePrintFormatDisplayRow[]>([]);
  const [isSearchPending, startSearchTransition] = useTransition();
  const [isOverridePending, startOverrideTransition] = useTransition();

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    startSearchTransition(async () => {
      const rows = await searchImagesForShopOverride(query);
      setResults(rows);
    });
  }

  function handleSelect(result: ShopImageSearchResult) {
    setSelected(result);
    startSearchTransition(async () => {
      const [overrides, effective] = await Promise.all([
        getPrintImageOverrides(result.id),
        getEffectivePrintFormatsForImage(result.id),
      ]);
      setOverrideByFormatId(new Map(overrides.map((override) => [override.printFormatId, override.printQualityId])));
      setEffectiveRows(effective);
    });
  }

  function handleModeChange(printFormatId: string, value: string) {
    if (!selected) return;
    const mode: PrintImageOverrideMode =
      value === INHERIT_VALUE
        ? { type: "inherit" }
        : value === DISABLED_VALUE
          ? { type: "disabled" }
          : { type: "quality", printQualityId: value };

    setOverrideByFormatId((prev) => {
      const next = new Map(prev);
      if (mode.type === "inherit") next.delete(printFormatId);
      else next.set(printFormatId, mode.type === "quality" ? mode.printQualityId : null);
      return next;
    });

    startOverrideTransition(async () => {
      const result = await setShopImagePrintFormatOverride(selected.id, printFormatId, mode);
      if (!result.success) {
        showAppAlert(result.error ?? "Änderung fehlgeschlagen.");
        return;
      }
      setEffectiveRows(await getEffectivePrintFormatsForImage(selected.id));
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ID/Hash oder Hauptort…"
          data-testid="print-image-search-input"
        />
        <Button type="submit" disabled={isSearchPending} data-testid="print-image-search-submit">
          <Search className="size-4" />
          Suchen
        </Button>
      </form>

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="print-image-search-results">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              data-testid={`print-image-search-result-${result.id}`}
              onClick={() => handleSelect(result)}
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- fertige
                  Thumbnail-Datei aus S3, next/image bringt hier keine Optimierung
                  (Konvention wie in image-preview-popup.tsx). */}
              <img src={result.thumbUrl} alt="" className="size-12 shrink-0 rounded object-cover" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{result.mainLocation ?? "—"}</p>
                <p className="text-xs text-muted-foreground">ID {result.hash}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <Card data-testid="print-effective-formats">
          <CardHeader>
            <CardTitle className="text-lg">Effektiv verfügbar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {effectiveRows.length === 0 && <p className="text-sm text-muted-foreground">Kein Format verfügbar.</p>}
            {effectiveRows.map((row) => (
              <p key={row.printFormatId} className="text-sm">
                <span className="font-medium">{row.printFormatName}</span> — {row.printQualityNames.join(", ")}{" "}
                <span className="text-muted-foreground">
                  ({row.source.type === "override" ? "Bild-Override" : `geerbt von ${row.source.label}`})
                </span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Overrides — {selected.mainLocation ?? selected.hash}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {formats.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Formate angelegt.</p>}
            {formats.map((format) => {
              const currentQualityId = overrideByFormatId.has(format.id) ? overrideByFormatId.get(format.id) : undefined;
              const value = resolveOverrideSelectValue(currentQualityId);

              return (
                <div key={format.id} className="flex items-center justify-between gap-4">
                  <span className="text-sm">{format.name}</span>
                  <Select
                    value={value}
                    onValueChange={(next) => handleModeChange(format.id, next ?? INHERIT_VALUE)}
                    disabled={isOverridePending}
                  >
                    <SelectTrigger data-testid={`print-image-override-select-${format.id}`} className="w-48">
                      <SelectValue>{labelForValue(value, qualities)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={INHERIT_VALUE}>Standort-Standard</SelectItem>
                      {qualities.map((quality) => (
                        <SelectItem
                          key={quality.id}
                          value={quality.id}
                          data-testid={`print-image-override-select-${format.id}-option-${quality.id}`}
                        >
                          {quality.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={DISABLED_VALUE}>Für dieses Bild deaktivieren</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
