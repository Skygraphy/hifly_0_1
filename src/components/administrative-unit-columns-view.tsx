"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Check } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useIsTruncated } from "@/lib/use-is-truncated";
import { cn } from "@/lib/utils";
import {
  ADMINISTRATIVE_LEVELS,
  ADMINISTRATIVE_LEVEL_LABELS,
  type AdministrativeLevel,
  type AdministrativeUnit,
} from "@/lib/administrative-units";
import type { Region } from "@/lib/regions";

// Native <input type="checkbox">: accent-color übernimmt die Markenfarbe
// statt der browsereigenen (meist blauen) Standardfarbe im angehakten
// Zustand — funktionsübergreifend unterstützt, ohne einen eigenen
// Checkbox-Baustein bauen zu müssen. Bewusst Checkbox statt Schieberegler
// (auf Wunsch des Users) — in der dichten hierarchischen Standort-/
// Regionsauswahl passt die kompaktere Checkbox besser.
const PUBLISH_CHECKBOX_CLASSNAME = "size-3.5 shrink-0 cursor-pointer accent-primary";
// Öffentlich nicht (mehr) erreichbare Zeilen bewusst nicht nur gedämpft
// (text-muted-foreground), sondern leicht ins Rötliche — liest sich auf
// einen Blick als "ungültig/nicht sichtbar" statt nur als "inaktiv".
const NOT_VISIBLE_CLASSNAME = "text-destructive/70";

/** Bei tatsächlicher Ellipsen-Kürzung (siehe useIsTruncated) wird der Name
 * zum Hover-Tooltip mit dem vollen Namen als Inhalt — derselbe gestylte
 * Look wie TruncatedTooltipText in image-preview-popup.tsx/
 * image-thumbnail-card.tsx, hier aber OHNE PopoverTrigger: die umschließende
 * Zeile (Button/DropdownMenuItem) trägt bereits ihr eigenes onClick zum
 * Auswählen, und PopoverTrigger würde auf demselben Element zusätzlich sein
 * eigenes Klick-Toggle auslösen — das öffnet(e) das Popup dauerhaft im
 * "klick-offen"-Modus, der (anders als der Hover-Modus) nicht mehr bei
 * bloßem Mouseleave schließt, sondern nur bei Klick außerhalb. Stattdessen:
 * eigener isHovered-State per onMouseEnter/onMouseLeave auf einem einfachen
 * <span> (kein Trigger-Verhalten, also auch kein Klick-Konflikt), Popover
 * vollständig kontrolliert über open={isTruncated && isHovered}, Positionierung
 * über anchor={ref} statt über einen Trigger. pointer-events-none auf dem
 * Popup verhindert zusätzlich, dass die (die nächste Zeile teils
 * überlappende) Box selbst zum Hover-Ziel wird.
 */
function TruncatedName({ text, testId }: { text: string; testId: string }) {
  const [ref, isTruncated] = useIsTruncated<HTMLSpanElement>();
  const [isHovered, setIsHovered] = useState(false);
  return (
    <Popover open={isTruncated && isHovered}>
      <span
        ref={ref}
        data-testid={testId}
        className="block min-w-0 truncate"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {text}
      </span>
      <PopoverContent anchor={ref} className="max-w-64 p-2 text-xs pointer-events-none">
        {text}
      </PopoverContent>
    </Popover>
  );
}

export function AdministrativeUnitColumnsView({
  pathUnits,
  byParent,
  onSelect,
  onCreateSibling,
  onEdit,
  onDelete,
  regionsByParentId,
  onSelectRegion,
  selectedRegionId,
  onEditRegion,
  onDeleteRegion,
  onCreateRegion,
  visibleUnitIds,
  visibleRegionIds,
  onToggleUnitPublished,
  onToggleRegionPublished,
  grantedUnitIds,
  grantedRegionIds,
  onToggleUnitGranted,
  onToggleRegionGranted,
  hideEmptyTrailingColumn,
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
  /** Markiert eine Region mit demselben Häkchen-Symbol wie eine ausgewählte
   * Einheit (siehe pathUnits/selectedId) — im öffentlichen Picker/Admin-
   * Manager ungenutzt (dort wechselt die Ansicht bei Regionsauswahl
   * komplett, siehe AdministrativeLevelWidget), aber im Standort-Picker
   * fürs Bild-Upload nötig, wo der Dialog nach der Auswahl offen bleibt. */
  selectedRegionId?: string;
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
  /** Kaskadiert berechnete Mengen tatsächlich öffentlich erreichbarer
   * Einheiten/Regionen (siehe filterPublishedUnits) — nur für die gedämpfte
   * Darstellung nicht (mehr) sichtbarer Zeilen, unabhängig vom eigenen
   * published-Flag der Checkbox (die zeigt immer nur den eigenen Wert). */
  visibleUnitIds?: Set<string>;
  visibleRegionIds?: Set<string>;
  /** Admin-Checkbox neben jeder Zeile: schaltet AUSSCHLIESSLICH das eigene
   * published-Flag dieser einen Einheit/Region um (kein Bulk-Toggle auf
   * Kinder) — ersetzt den früheren Dialog-Switch. */
  onToggleUnitPublished?: (unit: AdministrativeUnit, published: boolean) => void;
  onToggleRegionPublished?: (region: Region, published: boolean) => void;
  /** Freigabe-Verwaltung (super_admin, siehe admin_location_grants in
   * src/db/schema.ts) — exakt dasselbe Muster wie
   * onToggleUnitPublished/onToggleRegionPublished, nur mit eigener Bedeutung
   * ("für den Bild-Upload freigegeben" statt "öffentlich sichtbar") und
   * eigenem Label. Kein Kaskadieren auf Unterebenen — schaltet ausschließlich
   * die Freigabe GENAU dieser einen Zeile um. */
  grantedUnitIds?: Set<string>;
  grantedRegionIds?: Set<string>;
  onToggleUnitGranted?: (unit: AdministrativeUnit, granted: boolean) => void;
  onToggleRegionGranted?: (region: Region, granted: boolean) => void;
  /** Unterdrückt die sonst immer angehängte, leere Vorschau-Spalte der
   * nächsten Ebene, wenn dort weder Einheiten noch Regionen noch eine
   * Neuanlage-Möglichkeit (onCreateSibling) vorhanden wären — im
   * Standort-Picker (siehe location-picker-dialog.tsx) ist der Baum auf
   * Freigaben zugeschnitten, eine leere "Katastralgemeinde"-Spalte nach
   * einer bereits gewählten, kinderlosen Gemeinde wäre dort reine
   * Verwirrung. In den übrigen (Admin-/Public-)Ansichten weiterhin
   * standardmäßig sichtbar (dort zeigt "Keine Einträge" tatsächlich an,
   * dass diese Ebene leer ist bzw. bietet "+ Neu anlegen" an). */
  hideEmptyTrailingColumn?: boolean;
}) {
  // Eine Spalte pro erreichter Ebene, plus eine trailing Spalte für die
  // Kinder der tiefsten Auswahl (nur solange nicht schon "area" erreicht ist).
  const rawColumnCount =
    pathUnits.length < ADMINISTRATIVE_LEVELS.length ? pathUnits.length + 1 : pathUnits.length;
  const trailingParentId = pathUnits.length > 0 ? pathUnits[pathUnits.length - 1].id : null;
  const trailingColumnIsEmpty =
    rawColumnCount === pathUnits.length + 1 &&
    (byParent.get(trailingParentId)?.length ?? 0) === 0 &&
    (regionsByParentId?.get(trailingParentId)?.length ?? 0) === 0;
  const columnCount =
    hideEmptyTrailingColumn && !onCreateSibling && pathUnits.length > 0 && trailingColumnIsEmpty
      ? rawColumnCount - 1
      : rawColumnCount;

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Sobald eine tiefere Ebene erreicht wird und die neue Spalte nicht mehr
  // in die sichtbare Breite passt, automatisch ganz an den rechten Rand
  // scrollen, statt die neueste Spalte abgeschnitten hängen zu lassen.
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ left: scrollContainerRef.current.scrollWidth, behavior: "smooth" });
  }, [columnCount]);

  return (
    <div
      ref={scrollContainerRef}
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
              {items.map((item) => {
                // Eine Einheit und eine Region stehen für denselben
                // StandortRef-Slot — sobald eine Region der aktuelle
                // Kandidat ist (selectedRegionId gesetzt), darf keine
                // Einheit mehr als "ausgewählt" markiert bleiben, auch
                // nicht eine tiefer liegende, zuvor angeklickte (z.B.
                // Klosterneuburg, während path noch dorthin zeigt).
                const isUnitSelected = item.id === selectedId && !selectedRegionId;

                return (
                  <div
                    key={item.id}
                    data-testid={`unit-column-row-${item.id}`}
                    className={cn(
                      "group flex items-center gap-1 px-1.5 py-1 text-sm",
                      isUnitSelected && "bg-accent"
                    )}
                  >
                    <button
                      type="button"
                      data-testid={`unit-column-select-${item.id}`}
                      className={cn(
                        "flex min-w-0 flex-1 items-center rounded px-1.5 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
                        visibleUnitIds && !visibleUnitIds.has(item.id) && NOT_VISIBLE_CLASSNAME
                      )}
                      onClick={() => onSelect(index, item.id)}
                    >
                      <TruncatedName text={item.name} testId={`unit-column-name-${item.id}`} />
                    </button>
                    {isUnitSelected && <Check className="size-3.5 shrink-0" />}
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
                    {onToggleUnitPublished && item.level !== "federal" && (
                      <input
                        type="checkbox"
                        aria-label="Veröffentlicht"
                        data-testid={`unit-column-published-${item.id}`}
                        className={cn(PUBLISH_CHECKBOX_CLASSNAME, "ml-auto")}
                        checked={item.published}
                        onChange={(event) => onToggleUnitPublished(item, event.target.checked)}
                      />
                    )}
                    {onToggleUnitGranted && (
                      <input
                        type="checkbox"
                        aria-label="Freigegeben"
                        data-testid={`unit-column-granted-${item.id}`}
                        className={cn(PUBLISH_CHECKBOX_CLASSNAME, !onToggleUnitPublished && "ml-auto")}
                        checked={grantedUnitIds?.has(item.id) ?? false}
                        onChange={(event) => onToggleUnitGranted(item, event.target.checked)}
                      />
                    )}
                  </div>
                );
              })}
              {(onSelectRegion || onEditRegion || onDeleteRegion || onToggleRegionPublished || onToggleRegionGranted) &&
                (regionsByParentId?.get(parentId)?.length ?? 0) > 0 && (
                  <>
                    <div className="border-t px-3 py-2 text-xs font-medium text-muted-foreground">Gegend</div>
                    {regionsByParentId!.get(parentId)!.map((region) => (
                      <div
                        key={region.id}
                        data-testid={`region-row-${region.id}`}
                        className={cn(
                          "group flex items-center gap-1 px-1.5 py-1 text-sm",
                          region.id === selectedRegionId && "bg-accent"
                        )}
                      >
                        {onSelectRegion ? (
                          <button
                            type="button"
                            data-testid={`region-option-${region.id}`}
                            className={cn(
                              "flex min-w-0 flex-1 items-center rounded px-1.5 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
                              visibleRegionIds && !visibleRegionIds.has(region.id) && NOT_VISIBLE_CLASSNAME
                            )}
                            onClick={() => onSelectRegion(region.id)}
                          >
                            <TruncatedName text={region.name} testId={`region-name-${region.id}`} />
                          </button>
                        ) : (
                          <span
                            className={cn(
                              "flex min-w-0 flex-1 items-center px-1.5 py-1 cursor-default select-none",
                              visibleRegionIds && !visibleRegionIds.has(region.id) && NOT_VISIBLE_CLASSNAME
                            )}
                          >
                            <TruncatedName text={region.name} testId={`region-name-${region.id}`} />
                          </span>
                        )}
                        {region.id === selectedRegionId && <Check className="size-3.5 shrink-0" />}
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
                        {onToggleRegionPublished && (
                          <input
                            type="checkbox"
                            aria-label="Veröffentlicht"
                            data-testid={`region-published-${region.id}`}
                            className={cn(PUBLISH_CHECKBOX_CLASSNAME, "ml-auto")}
                            checked={region.published}
                            onChange={(event) => onToggleRegionPublished(region, event.target.checked)}
                          />
                        )}
                        {onToggleRegionGranted && (
                          <input
                            type="checkbox"
                            aria-label="Freigegeben"
                            data-testid={`region-granted-${region.id}`}
                            className={cn(PUBLISH_CHECKBOX_CLASSNAME, !onToggleRegionPublished && "ml-auto")}
                            checked={grantedRegionIds?.has(region.id) ?? false}
                            onChange={(event) => onToggleRegionGranted(region, event.target.checked)}
                          />
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
