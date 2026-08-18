"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setPersonalSetting } from "./actions";
import { applyThemePreference } from "@/lib/apply-theme";
import type { PersonalSettingDefinition } from "@/lib/settings-registry";
import { showAppAlert } from "@/lib/app-alert";

export function PersonalSettingRow({
  def,
  initialValue,
}: {
  def: PersonalSettingDefinition;
  initialValue: unknown;
}) {
  const [value, setValue] = useState(initialValue);
  // Zuletzt tatsächlich GESPEICHERTER Wert (nicht der aktuelle Feld-Wert!)
  // — der Speichern-Button ist deaktiviert, solange beide übereinstimmen
  // (gleiche, vom User bereits bestätigte Konvention wie GlobalSettingRow/
  // PriceCell). Wird NUR bei Erfolg aktualisiert, damit ein abgelehnter
  // Speicherversuch den Button wieder aktiv lässt statt fälschlich
  // "erledigt" zu zeigen.
  const [lastSavedValue, setLastSavedValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  function save(next: unknown) {
    setValue(next);
    // Theme hat einen sichtbaren Sofort-Effekt (DOM-Klasse + Cookie) — sonst
    // müsste die Seite neu geladen werden, um die Änderung zu sehen, obwohl
    // der Server-Wert schon gespeichert ist. Gleiche Logik wie im
    // DisplaySettingsMenu im Header.
    if (def.key === "theme" && typeof next === "string") {
      applyThemePreference(next);
    }
    startTransition(async () => {
      const result = await setPersonalSetting(def.key, next);
      if (!result.success) {
        showAppAlert(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setLastSavedValue(next);
    });
  }

  // Gleiche Zahlen-Behandlung wie GlobalSettingRow — type: "number" landete
  // hier bisher wie "string", der Speichern-Button war zudem nie bis zu
  // einer echten Änderung deaktiviert (siehe Audit-Ergebnis).
  const isNumber = def.type === "number";
  const numericValue = isNumber ? Number(value) : null;
  const isInvalidNumber =
    isNumber &&
    (String(value).trim() === "" ||
      Number.isNaN(numericValue) ||
      !Number.isInteger(numericValue) ||
      (numericValue as number) <= 0);
  const hasUnsavedChange = (isNumber ? numericValue : value) !== lastSavedValue;

  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{def.label}</p>
        <p className="text-xs text-muted-foreground">{def.description}</p>
      </div>
      {def.options ? (
        <Select value={String(value)} onValueChange={(next) => save(next)} disabled={isPending}>
          <SelectTrigger data-testid={`setting-${def.key}`}>
            {/* SelectValue löst den Wert erst zu einem Label auf, sobald das
                passende SelectItem mindestens einmal gerendert wurde (Popup
                ist aber erst nach dem ersten Öffnen im DOM) — Label hier
                selbst aus der Options-Liste nachschlagen, statt darauf zu warten. */}
            <SelectValue>
              {def.options.find((option) => option.value === String(value))?.label ?? String(value)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {def.options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                data-testid={`setting-${def.key}-option-${option.value}`}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : def.type === "boolean" ? (
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(checked) => save(checked)}
          disabled={isPending}
          data-testid={`setting-${def.key}`}
        />
      ) : (
        <div className="flex items-center gap-2">
          {isNumber ? (
            <NumberInput
              min={1}
              step={1}
              value={String(value)}
              onChange={(event) => setValue(event.target.value)}
              disabled={isPending}
              className="w-32"
              data-testid={`setting-${def.key}`}
            />
          ) : (
            <Input
              type="text"
              value={String(value)}
              onChange={(event) => setValue(event.target.value)}
              disabled={isPending}
              className="w-32"
              data-testid={`setting-${def.key}`}
            />
          )}
          <Button
            size="sm"
            disabled={isPending || isInvalidNumber || !hasUnsavedChange}
            onClick={() => save(isNumber ? numericValue : value)}
          >
            Speichern
          </Button>
        </div>
      )}
    </div>
  );
}
