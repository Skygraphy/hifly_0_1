"use client";

import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADMINISTRATIVE_LEVELS, ADMINISTRATIVE_LEVEL_LABELS, type AdministrativeLevel } from "@/lib/administrative-units";
import type { AdministrativeUnit } from "./types";

export function ColumnsView({
  pathUnits,
  byParent,
  onSelect,
  onCreateSibling,
  onEdit,
  onDelete,
}: {
  pathUnits: AdministrativeUnit[];
  byParent: Map<string | null, AdministrativeUnit[]>;
  onSelect: (levelIndex: number, unitId: string) => void;
  onCreateSibling: (parentId: string | null, level: AdministrativeLevel, replaceIndex: number) => void;
  onEdit: (unit: AdministrativeUnit) => void;
  onDelete: (unit: AdministrativeUnit) => void;
}) {
  // Eine Spalte pro erreichter Ebene, plus eine trailing Spalte für die
  // Kinder der tiefsten Auswahl (nur solange nicht schon "area" erreicht ist).
  const columnCount =
    pathUnits.length < ADMINISTRATIVE_LEVELS.length ? pathUnits.length + 1 : pathUnits.length;

  return (
    <div
      className={cn(
        "flex gap-3 overflow-x-auto pb-3",
        "[scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]",
        "[&::-webkit-scrollbar]:h-1.5",
        "[&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border",
        "hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40"
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
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
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
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              data-testid={`unit-column-add-${level}-${parentId ?? "root"}`}
              className="flex items-center gap-1.5 border-t px-3 py-2 text-left text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => onCreateSibling(parentId, level, index)}
            >
              <Plus className="size-3.5" />
              Neu anlegen
            </button>
          </div>
        );
      })}
    </div>
  );
}
