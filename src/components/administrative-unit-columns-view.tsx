"use client";

import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ADMINISTRATIVE_LEVELS,
  ADMINISTRATIVE_LEVEL_LABELS,
  type AdministrativeLevel,
  type AdministrativeUnit,
} from "@/lib/administrative-units";
import type { Region } from "@/lib/regions";

export function AdministrativeUnitColumnsView({
  pathUnits,
  byParent,
  onSelect,
  onCreateSibling,
  onEdit,
  onDelete,
  regionsByParentId,
  onSelectRegion,
  onEditRegion,
  onDeleteRegion,
  onCreateRegion,
}: {
  pathUnits: AdministrativeUnit[];
  byParent: Map<string | null, AdministrativeUnit[]>;
  onSelect: (levelIndex: number, unitId: string) => void;
  onCreateSibling?: (parentId: string | null, level: AdministrativeLevel, replaceIndex: number) => void;
  onEdit?: (unit: AdministrativeUnit) => void;
  onDelete?: (unit: AdministrativeUnit) => void;
  /** Öffentliches Gegenstück zu keiner Admin-Entsprechung: Regionen, die
   * quer zur Verwaltungsgliederung liegen (siehe src/lib/regions.ts),
   * gruppiert nach dem parentId der Einheit(en), mit der sie verknüpft
   * sind — erscheinen dadurch als zusätzlicher Auswahlpunkt genau in der
   * Spalte, in der ihre verknüpfte(n) Einheit(en) selbst stehen würden. */
  regionsByParentId?: Map<string | null, Region[]>;
  onSelectRegion?: (regionId: string) => void;
  /** Admin-Gegenstück zu onSelectRegion: Bearbeiten/Löschen der Region
   * selbst (Name/Beschreibung/Farbe UND Verknüpfung, bzw. komplettes
   * Löschen), nicht die öffentliche Standort-Auswahl. candidateUnits/level
   * sind GENAU die Geschwister-Einheiten dieser Spalte (items), damit der
   * Bearbeiten-Dialog dieselbe spalten-skopierte Verknüpfung wie beim
   * Anlegen anbieten kann. */
  onEditRegion?: (
    region: Region,
    parentId: string | null,
    candidateUnits: AdministrativeUnit[],
    level: AdministrativeLevel
  ) => void;
  onDeleteRegion?: (region: Region) => void;
  /** Admin-Gegenstück zu onCreateSibling: macht aus dem "+ Neu anlegen"-
   * Button am Spaltenende ein 2-Punkte-Menü ("Neue/r/s <Ebene>" / "Region")
   * — "Region" öffnet den CreateColumnRegionDialog (ausschließlich
   * Neuanlage), skopiert auf genau die in dieser Spalte sichtbaren
   * Geschwister-Einheiten (candidateUnits). Bestehende Regionen werden
   * stattdessen über onEditRegion verknüpft. */
  onCreateRegion?: (parentId: string | null, level: AdministrativeLevel, candidateUnits: AdministrativeUnit[]) => void;
}) {
  // Eine Spalte pro erreichter Ebene, plus eine trailing Spalte für die
  // Kinder der tiefsten Auswahl (nur solange nicht schon "area" erreicht ist).
  const columnCount =
    pathUnits.length < ADMINISTRATIVE_LEVELS.length ? pathUnits.length + 1 : pathUnits.length;

  return (
    <div
      className={cn(
        // Farbe/Breite kommen global aus globals.css — hier nur die Höhe
        // dieses speziell dünnen, horizontalen Balkens override't.
        "flex gap-3 overflow-x-auto pb-3 [&::-webkit-scrollbar]:h-1.5"
      )}
    >
      {Array.from({ length: columnCount }, (_, index) => {
        const level = ADMINISTRATIVE_LEVELS[index];
        const parentId = index === 0 ? null : pathUnits[index - 1].id;
        const items = byParent.get(parentId) ?? [];
        const selectedId = pathUnits[index]?.id;

        return (
          <div
            key={`${parentId ?? "root"}-${level}`}
            className="flex w-56 shrink-0 flex-col rounded-lg border bg-card"
          >
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              {ADMINISTRATIVE_LEVEL_LABELS[level]}
            </div>
            <div className="max-h-80 flex-1 overflow-y-auto">
              {items.length === 0 && (
                <p className="px-3 py-4 text-sm text-muted-foreground">Keine Einträge</p>
              )}
              {items.map((item) => (
                <div
                  key={item.id}
                  data-testid={`unit-column-row-${item.id}`}
                  className={cn(
                    "group flex items-center gap-1 px-1.5 py-1 text-sm",
                    item.id === selectedId && "bg-accent"
                  )}
                >
                  <button
                    type="button"
                    data-testid={`unit-column-select-${item.id}`}
                    className="flex-1 truncate rounded px-1.5 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => onSelect(index, item.id)}
                  >
                    {item.name}
                  </button>
                  {item.id === selectedId && <Check className="size-3.5 shrink-0" />}
                  {(onEdit || onDelete) && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                      {onEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Bearbeiten"
                          data-testid={`unit-column-edit-${item.id}`}
                          onClick={() => onEdit(item)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Löschen"
                          data-testid={`unit-column-delete-${item.id}`}
                          onClick={() => onDelete(item)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {(onSelectRegion || onEditRegion || onDeleteRegion) &&
                (regionsByParentId?.get(parentId)?.length ?? 0) > 0 && (
                  <>
                    <div className="border-t px-3 py-2 text-xs font-medium text-muted-foreground">Gegend</div>
                    {/* Diese Ansicht rendert nie, während eine Region der
                        aktive Standort ist (siehe AdministrativeLevelWidget),
                        daher keine "ausgewählt"-Markierung nötig. */}
                    {regionsByParentId!.get(parentId)!.map((region) => (
                      <div
                        key={region.id}
                        data-testid={`region-row-${region.id}`}
                        className="group flex items-center gap-1 px-1.5 py-1 text-sm"
                      >
                        {onSelectRegion ? (
                          <button
                            type="button"
                            data-testid={`region-option-${region.id}`}
                            className="flex-1 truncate rounded px-1.5 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                            onClick={() => onSelectRegion(region.id)}
                          >
                            {region.name}
                          </button>
                        ) : (
                          <span className="flex-1 truncate px-1.5 py-1 cursor-default select-none">
                            {region.name}
                          </span>
                        )}
                        {(onEditRegion || onDeleteRegion) && (
                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                            {onEditRegion && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Bearbeiten"
                                data-testid={`region-edit-${region.id}`}
                                onClick={() => onEditRegion(region, parentId, items, level)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            )}
                            {onDeleteRegion && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Löschen"
                                data-testid={`region-delete-${region.id}`}
                                onClick={() => onDeleteRegion(region)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
            </div>
            {onCreateSibling &&
              (onCreateRegion && level !== "federal" && items.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    data-testid={`unit-column-add-${level}-${parentId ?? "root"}`}
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "justify-start gap-1.5 rounded-none border-t px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Plus className="size-3.5" />
                    Neu anlegen
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      data-testid={`unit-column-add-unit-${level}-${parentId ?? "root"}`}
                      onClick={() => onCreateSibling(parentId, level, index)}
                    >
                      {ADMINISTRATIVE_LEVEL_LABELS[level]}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid={`unit-column-add-region-${level}-${parentId ?? "root"}`}
                      onClick={() => onCreateRegion(parentId, level, items)}
                    >
                      Region
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <button
                  type="button"
                  data-testid={`unit-column-add-${level}-${parentId ?? "root"}`}
                  className="flex items-center gap-1.5 border-t px-3 py-2 text-left text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => onCreateSibling(parentId, level, index)}
                >
                  <Plus className="size-3.5" />
                  Neu anlegen
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}
