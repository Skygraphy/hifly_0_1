"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PackageFormDialog, DeletePackageDialog, CategoryFormDialog, DeleteCategoryDialog } from "./package-dialogs";
import { PriceCell } from "./price-cell";
import { setShopPackageFeatured } from "./actions";
import { showAppAlert } from "@/lib/app-alert";
import { cn } from "@/lib/utils";
import type { ShopPackage, ShopPackageCategory, ShopPackagePrice } from "@/lib/shop";

type PackageDialogState = { mode: "create" } | { mode: "edit"; pkg: ShopPackage } | { mode: "delete"; pkg: ShopPackage } | null;
type CategoryDialogState =
  | { mode: "create" }
  | { mode: "edit"; category: ShopPackageCategory }
  | { mode: "delete"; category: ShopPackageCategory }
  | null;

export function ShopCatalogManager({
  packages,
  categories,
  prices,
}: {
  packages: ShopPackage[];
  categories: ShopPackageCategory[];
  prices: ShopPackagePrice[];
}) {
  const router = useRouter();
  const [packageDialog, setPackageDialog] = useState<PackageDialogState>(null);
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState>(null);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    startTransition(() => router.refresh());
  }

  function toggleFeatured(pkg: ShopPackage) {
    startTransition(async () => {
      const result = await setShopPackageFeatured(pkg.id, !pkg.isFeatured);
      if (!result.success) {
        showAppAlert(result.error ?? "Aktion fehlgeschlagen.");
        return;
      }
      router.refresh();
    });
  }

  const priceByKey = new Map(prices.map((price) => [`${price.packageId}:${price.categoryId}`, price.priceCents]));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            Pakete
            <Button
              size="sm"
              variant="outline"
              data-testid="package-create-open"
              onClick={() => setPackageDialog({ mode: "create" })}
            >
              <Plus className="size-4" />
              Neues Paket
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {packages.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Pakete angelegt.</p>}
          {packages.map((pkg) => (
            <div key={pkg.id} data-testid={`package-row-${pkg.id}`} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{pkg.name}</p>
                  {pkg.isFeatured && (
                    <Badge variant="default" className="gap-1" data-testid={`package-featured-badge-${pkg.id}`}>
                      <Star className="size-3" />
                      Am beliebtesten
                    </Badge>
                  )}
                </div>
                {pkg.description ? (
                  // dangerouslySetInnerHTML ist hier unproblematisch: die
                  // Beschreibung stammt ausschließlich vom super_admin selbst
                  // (RichTextEditor in PackageFormDialog, siehe dort) — kein
                  // Fremd-/User-Input, derselbe Vertrauensraum wie der Rest
                  // dieser Admin-only-Seite. Sobald diese Beschreibung auch
                  // auf einer öffentlichen Shopseite angezeigt wird (späterer
                  // Schritt), braucht es dort eine echte Sanitizer-Bibliothek.
                  <div
                    className="mt-1 line-clamp-3 text-xs text-muted-foreground [&_em]:italic [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4"
                    data-testid={`package-description-${pkg.id}`}
                    dangerouslySetInnerHTML={{ __html: pkg.description }}
                  />
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground italic">Keine Beschreibung</p>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {pkg.includedFiles.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Keine Dateien zugeordnet</span>
                  ) : (
                    pkg.includedFiles.map((file) => (
                      <Badge key={file} variant="secondary" className="text-xs">
                        {file}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={pkg.isFeatured ? "Als „Am beliebtesten“ entfernen" : "Als „Am beliebtesten“ markieren"}
                disabled={isPending}
                data-testid={`package-toggle-featured-${pkg.id}`}
                onClick={() => toggleFeatured(pkg)}
              >
                <Star className={cn("size-4", pkg.isFeatured && "fill-current text-primary")} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Bearbeiten"
                data-testid={`package-edit-${pkg.id}`}
                onClick={() => setPackageDialog({ mode: "edit", pkg })}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Löschen"
                data-testid={`package-delete-${pkg.id}`}
                onClick={() => setPackageDialog({ mode: "delete", pkg })}
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
            Kategorien
            <Button
              size="sm"
              variant="outline"
              data-testid="category-create-open"
              onClick={() => setCategoryDialog({ mode: "create" })}
            >
              <Plus className="size-4" />
              Neue Kategorie
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {categories.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Kategorien angelegt.</p>}
          {categories.map((category) => (
            <div
              key={category.id}
              data-testid={`category-row-${category.id}`}
              className="flex items-center gap-3 rounded-lg border px-3 py-2"
            >
              <p className="flex-1 text-sm font-medium">{category.name}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Bearbeiten"
                data-testid={`category-edit-${category.id}`}
                onClick={() => setCategoryDialog({ mode: "edit", category })}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Löschen"
                data-testid={`category-delete-${category.id}`}
                onClick={() => setCategoryDialog({ mode: "delete", category })}
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
          {packages.length === 0 || categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Es müssen zuerst mindestens ein Paket und eine Kategorie angelegt sein.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paket</TableHead>
                  {categories.map((category) => (
                    <TableHead key={category.id}>{category.name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell className="font-medium">{pkg.name}</TableCell>
                    {categories.map((category) => (
                      <TableCell key={category.id}>
                        <PriceCell
                          packageId={pkg.id}
                          categoryId={category.id}
                          initialPriceCents={priceByKey.get(`${pkg.id}:${category.id}`) ?? null}
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

      {packageDialog?.mode === "create" && (
        <PackageFormDialog
          pkg={null}
          nextSortOrder={packages.length}
          onClose={() => setPackageDialog(null)}
          onSaved={() => {
            setPackageDialog(null);
            refresh();
          }}
        />
      )}
      {packageDialog?.mode === "edit" && (
        <PackageFormDialog
          pkg={packageDialog.pkg}
          nextSortOrder={packages.length}
          onClose={() => setPackageDialog(null)}
          onSaved={() => {
            setPackageDialog(null);
            refresh();
          }}
        />
      )}
      {packageDialog?.mode === "delete" && (
        <DeletePackageDialog
          pkg={packageDialog.pkg}
          onClose={() => setPackageDialog(null)}
          onDeleted={() => {
            setPackageDialog(null);
            refresh();
          }}
        />
      )}

      {categoryDialog?.mode === "create" && (
        <CategoryFormDialog
          category={null}
          nextSortOrder={categories.length}
          onClose={() => setCategoryDialog(null)}
          onSaved={() => {
            setCategoryDialog(null);
            refresh();
          }}
        />
      )}
      {categoryDialog?.mode === "edit" && (
        <CategoryFormDialog
          category={categoryDialog.category}
          nextSortOrder={categories.length}
          onClose={() => setCategoryDialog(null)}
          onSaved={() => {
            setCategoryDialog(null);
            refresh();
          }}
        />
      )}
      {categoryDialog?.mode === "delete" && (
        <DeleteCategoryDialog
          category={categoryDialog.category}
          onClose={() => setCategoryDialog(null)}
          onDeleted={() => {
            setCategoryDialog(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
