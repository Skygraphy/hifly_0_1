"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  searchImagesForShopOverride,
  getShopImageOverrides,
  getEffectivePackagesForImage,
  setShopImagePackageOverride,
  type ShopImageSearchResult,
  type ShopImageOverrideMode,
  type EffectivePackageDisplayRow,
} from "./actions";
import { showAppAlert } from "@/lib/app-alert";
import type { ShopPackage, ShopPackageCategory } from "@/lib/shop";

const INHERIT_VALUE = "__inherit__";
const DISABLED_VALUE = "__disabled__";

function labelForValue(value: string, categories: ShopPackageCategory[]): string {
  if (value === INHERIT_VALUE) return "Standort-Standard";
  if (value === DISABLED_VALUE) return "Für dieses Bild deaktivieren";
  return categories.find((category) => category.id === value)?.name ?? value;
}

// Eigene Funktion statt einer verschachtelten Ternary direkt an der
// Aufrufstelle: TS narrowt currentCategoryId (Map<string, string | null>.get())
// innerhalb einer verschachtelten Ternary nicht zuverlässig auf string,
// obwohl beide Sonderfälle (undefined/null) bereits behandelt sind — mit
// echten if-Returns in einer eigenen Funktion funktioniert die Engführung.
function resolveOverrideSelectValue(currentCategoryId: string | null | undefined): string {
  if (currentCategoryId === undefined) return INHERIT_VALUE;
  if (currentCategoryId === null) return DISABLED_VALUE;
  return currentCategoryId;
}

/**
 * Bild-Override-Verwaltung (super_admin, siehe shop_image_package_
 * assignments in src/db/schema.ts) — anders als die Standort-Zuordnung
 * keine Baum-Navigation (es geht um einzelne, gezielt herausgegriffene
 * Bilder), sondern eine kompakte Freitextsuche (ID/Hash oder Hauptort) mit
 * Trefferliste. Klick auf einen Treffer lädt dessen aktuelle Overrides und
 * zeigt pro Paket ein Auswahlfeld: "Standort-Standard" (keine
 * Override-Zeile) / eine konkrete Kategorie / "Für dieses Bild
 * deaktivieren" (categoryId = null).
 */
export function ShopImageOverrideManager({
  packages,
  categories,
}: {
  packages: ShopPackage[];
  categories: ShopPackageCategory[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShopImageSearchResult[]>([]);
  const [selected, setSelected] = useState<ShopImageSearchResult | null>(null);
  const [overrideByPackageId, setOverrideByPackageId] = useState<Map<string, string | null>>(new Map());
  const [effectiveRows, setEffectiveRows] = useState<EffectivePackageDisplayRow[]>([]);
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
        getShopImageOverrides(result.id),
        getEffectivePackagesForImage(result.id),
      ]);
      setOverrideByPackageId(new Map(overrides.map((override) => [override.packageId, override.categoryId])));
      setEffectiveRows(effective);
    });
  }

  function handleModeChange(packageId: string, value: string) {
    if (!selected) return;
    const mode: ShopImageOverrideMode =
      value === INHERIT_VALUE
        ? { type: "inherit" }
        : value === DISABLED_VALUE
          ? { type: "disabled" }
          : { type: "category", categoryId: value };

    setOverrideByPackageId((prev) => {
      const next = new Map(prev);
      if (mode.type === "inherit") next.delete(packageId);
      else next.set(packageId, mode.type === "category" ? mode.categoryId : null);
      return next;
    });

    startOverrideTransition(async () => {
      const result = await setShopImagePackageOverride(selected.id, packageId, mode);
      if (!result.success) {
        showAppAlert(result.error ?? "Änderung fehlgeschlagen.");
        return;
      }
      setEffectiveRows(await getEffectivePackagesForImage(selected.id));
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ID/Hash oder Hauptort…"
          data-testid="shop-image-search-input"
        />
        <Button type="submit" disabled={isSearchPending} data-testid="shop-image-search-submit">
          <Search className="size-4" />
          Suchen
        </Button>
      </form>

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="shop-image-search-results">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              data-testid={`shop-image-search-result-${result.id}`}
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
        <Card data-testid="shop-effective-packages">
          <CardHeader>
            <CardTitle className="text-lg">Effektiv verfügbar</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {effectiveRows.length === 0 && <p className="text-sm text-muted-foreground">Kein Paket verfügbar.</p>}
            {effectiveRows.map((row) => (
              <p key={row.packageId} className="text-sm">
                <span className="font-medium">{row.packageName}</span> — {row.categoryName}{" "}
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
            {packages.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Pakete angelegt.</p>}
            {packages.map((pkg) => {
              const currentCategoryId = overrideByPackageId.has(pkg.id) ? overrideByPackageId.get(pkg.id) : undefined;
              const value = resolveOverrideSelectValue(currentCategoryId);

              return (
                <div key={pkg.id} className="flex items-center justify-between gap-4">
                  <span className="text-sm">{pkg.name}</span>
                  <Select
                    value={value}
                    onValueChange={(next) => handleModeChange(pkg.id, next ?? INHERIT_VALUE)}
                    disabled={isOverridePending}
                  >
                    <SelectTrigger data-testid={`image-override-select-${pkg.id}`} className="w-48">
                      <SelectValue>{labelForValue(value, categories)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={INHERIT_VALUE}>Standort-Standard</SelectItem>
                      {categories.map((category) => (
                        <SelectItem
                          key={category.id}
                          value={category.id}
                          data-testid={`image-override-select-${pkg.id}-option-${category.id}`}
                        >
                          {category.name}
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
