"use client";

import { ChevronRight, Plus, Pencil, Trash2, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADMINISTRATIVE_LEVEL_LABELS, type AdministrativeLevel } from "@/lib/administrative-units";
import type { AdministrativeUnit } from "./types";

export function BreadcrumbView({
  pathUnits,
  byParent,
  nextChildLevel,
  deepest,
  onSelectSibling,
  onCreateSibling,
  onEdit,
  onDelete,
  onAddChild,
}: {
  pathUnits: AdministrativeUnit[];
  byParent: Map<string | null, AdministrativeUnit[]>;
  nextChildLevel: AdministrativeLevel | null;
  deepest: AdministrativeUnit | undefined;
  onSelectSibling: (levelIndex: number, unitId: string) => void;
  onCreateSibling: (parentId: string | null, level: AdministrativeLevel, replaceIndex: number) => void;
  onEdit: (unit: AdministrativeUnit) => void;
  onDelete: (unit: AdministrativeUnit) => void;
  onAddChild: (parentId: string | null, level: AdministrativeLevel, replaceIndex: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pathUnits.map((unit, index) => {
        const siblings = byParent.get(unit.parentId) ?? [];
        return (
          <div key={unit.id} className="flex items-center gap-1.5">
            {index > 0 && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
            <DropdownMenu>
              <DropdownMenuTrigger
                data-testid={`unit-breadcrumb-${unit.level}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {unit.name}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{ADMINISTRATIVE_LEVEL_LABELS[unit.level]}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {siblings.map((sibling) => (
                    <DropdownMenuItem
                      key={sibling.id}
                      data-testid={`unit-option-${sibling.id}`}
                      onClick={() => onSelectSibling(index, sibling.id)}
                    >
                      {sibling.name}
                      {sibling.id === unit.id && <Check className="ml-auto size-4" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    data-testid={`unit-create-sibling-${unit.level}`}
                    onClick={() => onCreateSibling(unit.parentId, unit.level, index)}
                  >
                    <Plus className="size-4" />
                    Neu anlegen
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid={`unit-edit-${unit.id}`}
                    onClick={() => onEdit(unit)}
                  >
                    <Pencil className="size-4" />
                    Bearbeiten
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    data-testid={`unit-delete-${unit.id}`}
                    onClick={() => onDelete(unit)}
                  >
                    <Trash2 className="size-4" />
                    Löschen
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}

      {nextChildLevel && (
        <div className="flex items-center gap-1.5">
          {pathUnits.length > 0 && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`${ADMINISTRATIVE_LEVEL_LABELS[nextChildLevel]} anlegen`}
            data-testid={`unit-add-child-${deepest?.id ?? "root"}`}
            onClick={() => onAddChild(deepest?.id ?? null, nextChildLevel, pathUnits.length)}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
