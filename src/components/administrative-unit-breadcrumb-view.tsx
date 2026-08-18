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
import {
  ADMINISTRATIVE_LEVEL_LABELS,
  type AdministrativeLevel,
  type AdministrativeUnit,
} from "@/lib/administrative-units";
import type { Region } from "@/lib/regions";

// Öffentlich nicht (mehr) erreichbare Zeilen bewusst nicht nur gedämpft
// (text-muted-foreground), sondern leicht ins Rötliche — liest sich auf
// einen Blick als "ungültig/nicht sichtbar" statt nur als "inaktiv".
const NOT_VISIBLE_CLASSNAME = "text-destructive/70";

/**
 * Admin-Checkbox innerhalb eines DropdownMenuItem — stopPropagation auf dem
 * Klick, damit das Häkchen weder die Item-eigene Navigation/Auswahl auslöst
 * noch (als Nebeneffekt davon) das Menü schließt; toggelt ausschließlich das
 * eigene published-Flag der Zeile. accent-color übernimmt die Markenfarbe
 * statt der browsereigenen Standardfarbe im angehakten Zustand. Bewusst
 * Checkbox statt Schieberegler (auf Wunsch des Users) — in der dichten
 * hierarchischen Standort-/Regionsauswahl passt die kompaktere Checkbox
 * besser als in einer einzelnen Einstellungszeile.
 */
function PublishCheckbox({
  checked,
  onToggle,
  testId,
}: {
  checked: boolean;
  onToggle: (published: boolean) => void;
  testId: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label="Veröffentlicht"
      data-testid={testId}
      className="ml-auto size-3.5 shrink-0 cursor-pointer accent-primary"
      checked={checked}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onToggle(event.target.checked)}
    />
  );
}

export function AdministrativeUnitBreadcrumbView({
  pathUnits,
  byParent,
  nextChildLevel,
  deepest,
  onSelectSibling,
  onSelectChild,
  onCreateSibling,
  onEdit,
  onDelete,
  onAddChild,
  regionsByParentId,
  onSelectRegion,
  selectedRegion,
  onCreateRegion,
  visibleUnitIds,
  visibleRegionIds,
  onToggleUnitPublished,
  onToggleRegionPublished,
}: {
  pathUnits: AdministrativeUnit[];
  byParent: Map<string | null, AdministrativeUnit[]>;
  nextChildLevel: AdministrativeLevel | null;
  deepest: AdministrativeUnit | undefined;
  onSelectSibling: (levelIndex: number, unitId: string) => void;
  /**
   * Öffentliches Gegenstück zu onAddChild: erlaubt, den Pfad um eine
   * BESTEHENDE Kind-Einheit zu verlängern (Auswahl, kein "Neu anlegen").
   * Nur relevant, wenn onAddChild NICHT gesetzt ist (Admin nutzt weiterhin
   * den "+"-Button zum Anlegen; die öffentliche Auswahl braucht stattdessen
   * eine Liste der bereits vorhandenen Kinder).
   */
  onSelectChild?: (unitId: string) => void;
  onCreateSibling?: (parentId: string | null, level: AdministrativeLevel, replaceIndex: number) => void;
  onEdit?: (unit: AdministrativeUnit) => void;
  onDelete?: (unit: AdministrativeUnit) => void;
  onAddChild?: (parentId: string | null, level: AdministrativeLevel, replaceIndex: number) => void;
  /** Öffentliches Gegenstück zu keiner Admin-Entsprechung: Regionen,
   * gruppiert nach dem parentId der Einheit(en), mit der sie verknüpft
   * sind (siehe src/lib/regions.ts groupRegionsByParent) — erscheinen
   * dadurch in JEDEM Segment-Dropdown (und im "Weiter verzweigen"-Dropdown),
   * dessen parentId eine verknüpfte Region hat. */
  regionsByParentId?: Map<string | null, Region[]>;
  onSelectRegion?: (regionId: string) => void;
  /**
   * Die aktuell als Standort gewählte Region, falls es eine ist. Ersetzt den
   * "Weiter verzweigen"-Plus-Button durch ein normales Breadcrumb-Segment
   * mit dem Regionsnamen (statt des Level-Labels) — dieselbe Interaktion
   * (Dropdown mit Geschwistern) wie bei einem Einheiten-Segment, nur dass
   * "Geschwister" hier sowohl bestehende Kind-Einheiten als auch andere
   * Regionen auf derselben Ebene umfasst.
   */
  selectedRegion?: Region;
  /** Admin-Gegenstück zu onCreateSibling, ergänzt dessen "Neu anlegen"-Item
   * (Segment-eigene Aktionsgruppe UND "Weiter verzweigen"-Dropdown) um ein
   * zweites Item "Region", das den CreateColumnRegionDialog öffnet — skopiert auf
   * genau die dort sichtbaren Geschwister-Einheiten (candidateUnits).
   * Bearbeiten/Löschen bestehender Regionen ist bewusst nur in der
   * Spalten-Ansicht möglich (dieselbe Einschränkung gilt schon für
   * Einheiten: nur das aktive Segment bekommt eigene Aktionen, nicht jede
   * einzelne Geschwister-Zeile in einem Dropdown). */
  onCreateRegion?: (parentId: string | null, level: AdministrativeLevel, candidateUnits: AdministrativeUnit[]) => void;
  /** Kaskadiert berechnete Mengen tatsächlich öffentlich erreichbarer
   * Einheiten/Regionen (siehe filterPublishedUnits) — nur für die gedämpfte
   * Darstellung, unabhängig vom eigenen published-Flag der Checkbox. */
  visibleUnitIds?: Set<string>;
  visibleRegionIds?: Set<string>;
  /** Admin-Checkbox neben jeder Zeile: schaltet AUSSCHLIESSLICH das eigene
   * published-Flag dieser einen Einheit/Region um (kein Bulk-Toggle auf
   * Kinder) — ersetzt den früheren Dialog-Switch. */
  onToggleUnitPublished?: (unit: AdministrativeUnit, published: boolean) => void;
  onToggleRegionPublished?: (region: Region, published: boolean) => void;
}) {
  const hasAdminActions = Boolean(onCreateSibling || onEdit || onDelete || onCreateRegion);
  const deepenChildren = nextChildLevel ? byParent.get(deepest?.id ?? null) ?? [] : [];
  // Gegend-Abschnitt: sichtbar sobald regionsByParentId gesetzt ist — im
  // Admin-Modus (onSelectRegion fehlt) rein informativ (Klick auf einen
  // Eintrag tut nichts, siehe onClick unten), da Bearbeiten/Löschen/
  // Verknüpfen bewusst nur in der Spalten-Ansicht angeboten wird.
  const deepenRegions = regionsByParentId?.get(deepest?.id ?? null) ?? [];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pathUnits.map((unit, index) => {
        const siblings = byParent.get(unit.parentId) ?? [];
        const segmentRegions = regionsByParentId?.get(unit.parentId) ?? [];
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
                      className={cn(visibleUnitIds && !visibleUnitIds.has(sibling.id) && NOT_VISIBLE_CLASSNAME)}
                      onClick={() => onSelectSibling(index, sibling.id)}
                    >
                      {sibling.name}
                      {sibling.id === unit.id && <Check className="ml-auto size-4" />}
                      {onToggleUnitPublished && sibling.level !== "federal" && (
                        <PublishCheckbox
                          checked={sibling.published}
                          onToggle={(published) => onToggleUnitPublished(sibling, published)}
                          testId={`unit-breadcrumb-published-${sibling.id}`}
                        />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                {segmentRegions.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Gegend</DropdownMenuLabel>
                    </DropdownMenuGroup>
                    <DropdownMenuGroup>
                      {segmentRegions.map((region) => (
                        <DropdownMenuItem
                          key={region.id}
                          data-testid={`region-option-${region.id}`}
                          className={cn(
                            visibleRegionIds && !visibleRegionIds.has(region.id) && NOT_VISIBLE_CLASSNAME
                          )}
                          onClick={onSelectRegion ? () => onSelectRegion(region.id) : undefined}
                        >
                          {region.name}
                          {onToggleRegionPublished && (
                            <PublishCheckbox
                              checked={region.published}
                              onToggle={(published) => onToggleRegionPublished(region, published)}
                              testId={`region-breadcrumb-published-${region.id}`}
                            />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </>
                )}
                {hasAdminActions && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      {onCreateSibling && (
                        <DropdownMenuItem
                          data-testid={`unit-create-sibling-${unit.level}`}
                          onClick={() => onCreateSibling(unit.parentId, unit.level, index)}
                        >
                          <Plus className="size-4" />
                          Neu anlegen
                        </DropdownMenuItem>
                      )}
                      {onCreateRegion && unit.level !== "federal" && siblings.length > 0 && (
                        <DropdownMenuItem
                          data-testid={`unit-create-region-${unit.level}`}
                          onClick={() => onCreateRegion(unit.parentId, unit.level, siblings)}
                        >
                          <Plus className="size-4" />
                          Region
                        </DropdownMenuItem>
                      )}
                      {onEdit && (
                        <DropdownMenuItem
                          data-testid={`unit-edit-${unit.id}`}
                          onClick={() => onEdit(unit)}
                        >
                          <Pencil className="size-4" />
                          Bearbeiten
                        </DropdownMenuItem>
                      )}
                      {onDelete && (
                        <DropdownMenuItem
                          variant="destructive"
                          data-testid={`unit-delete-${unit.id}`}
                          onClick={() => onDelete(unit)}
                        >
                          <Trash2 className="size-4" />
                          Löschen
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}

      {selectedRegion ? (
        <div className="flex items-center gap-1.5">
          {pathUnits.length > 0 && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
          <DropdownMenu>
            <DropdownMenuTrigger
              data-testid={`region-breadcrumb-${selectedRegion.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {selectedRegion.name}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {nextChildLevel && deepenChildren.length > 0 && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{ADMINISTRATIVE_LEVEL_LABELS[nextChildLevel]}</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    {deepenChildren.map((child) => (
                      <DropdownMenuItem
                        key={child.id}
                        data-testid={`unit-option-${child.id}`}
                        className={cn(visibleUnitIds && !visibleUnitIds.has(child.id) && NOT_VISIBLE_CLASSNAME)}
                        onClick={() => onSelectChild?.(child.id)}
                      >
                        {child.name}
                        {onToggleUnitPublished && child.level !== "federal" && (
                          <PublishCheckbox
                            checked={child.published}
                            onToggle={(published) => onToggleUnitPublished(child, published)}
                            testId={`unit-breadcrumb-published-${child.id}`}
                          />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>
              )}
              {deepenRegions.length > 0 && (
                <>
                  {nextChildLevel && deepenChildren.length > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Gegend</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuGroup>
                    {deepenRegions.map((region) => (
                      <DropdownMenuItem
                        key={region.id}
                        data-testid={`region-option-${region.id}`}
                        className={cn(
                          visibleRegionIds && !visibleRegionIds.has(region.id) && NOT_VISIBLE_CLASSNAME
                        )}
                        onClick={() => onSelectRegion?.(region.id)}
                      >
                        {region.name}
                        {region.id === selectedRegion.id && <Check className="ml-auto size-4" />}
                        {onToggleRegionPublished && (
                          <PublishCheckbox
                            checked={region.published}
                            onToggle={(published) => onToggleRegionPublished(region, published)}
                            testId={`region-breadcrumb-published-${region.id}`}
                          />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        onSelectChild &&
        nextChildLevel &&
        deepenChildren.length > 0 && (
          <div className="flex items-center gap-1.5">
            {pathUnits.length > 0 && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
            <DropdownMenu>
              <DropdownMenuTrigger
                data-testid={`unit-breadcrumb-deepen-${nextChildLevel}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1 text-muted-foreground")}
              >
                <Plus className="size-3.5" />
                {ADMINISTRATIVE_LEVEL_LABELS[nextChildLevel]}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{ADMINISTRATIVE_LEVEL_LABELS[nextChildLevel]}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {deepenChildren.map((child) => (
                    <DropdownMenuItem
                      key={child.id}
                      data-testid={`unit-option-${child.id}`}
                      className={cn(visibleUnitIds && !visibleUnitIds.has(child.id) && NOT_VISIBLE_CLASSNAME)}
                      onClick={() => onSelectChild(child.id)}
                    >
                      {child.name}
                      {onToggleUnitPublished && child.level !== "federal" && (
                        <PublishCheckbox
                          checked={child.published}
                          onToggle={(published) => onToggleUnitPublished(child, published)}
                          testId={`unit-breadcrumb-published-${child.id}`}
                        />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                {deepenRegions.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Gegend</DropdownMenuLabel>
                    </DropdownMenuGroup>
                    <DropdownMenuGroup>
                      {deepenRegions.map((region) => (
                        <DropdownMenuItem
                          key={region.id}
                          data-testid={`region-option-${region.id}`}
                          className={cn(
                            visibleRegionIds && !visibleRegionIds.has(region.id) && NOT_VISIBLE_CLASSNAME
                          )}
                          onClick={onSelectRegion ? () => onSelectRegion(region.id) : undefined}
                        >
                          {region.name}
                          {onToggleRegionPublished && (
                            <PublishCheckbox
                              checked={region.published}
                              onToggle={(published) => onToggleRegionPublished(region, published)}
                              testId={`region-breadcrumb-published-${region.id}`}
                            />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      )}

      {onAddChild && nextChildLevel && (
        <div className="flex items-center gap-1.5">
          {pathUnits.length > 0 && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
          {onCreateRegion && nextChildLevel !== "federal" && deepenChildren.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                data-testid={`unit-add-child-${deepest?.id ?? "root"}`}
                className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
                aria-label={`${ADMINISTRATIVE_LEVEL_LABELS[nextChildLevel]} anlegen`}
              >
                <Plus className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  data-testid={`unit-add-child-unit-${deepest?.id ?? "root"}`}
                  onClick={() => onAddChild(deepest?.id ?? null, nextChildLevel, pathUnits.length)}
                >
                  {ADMINISTRATIVE_LEVEL_LABELS[nextChildLevel]}
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid={`unit-add-child-region-${deepest?.id ?? "root"}`}
                  onClick={() => onCreateRegion(deepest?.id ?? null, nextChildLevel, deepenChildren)}
                >
                  Region
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
