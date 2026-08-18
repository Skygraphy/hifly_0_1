"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Button } from "@/components/ui/button";
import { setGlobalSetting } from "./actions";
import type { GlobalSettingDefinition } from "@/lib/settings-registry";
import { showAppAlert } from "@/lib/app-alert";

export function GlobalSettingRow({
  def,
  initialValue,
}: {
  def: GlobalSettingDefinition;
  initialValue: unknown;
}) {
  const [value, setValue] = useState(initialValue);
  // Zuletzt tatsächlich GESPEICHERTER Wert (nicht der aktuelle Feld-Wert!)
  // — der Speichern-Button ist deaktiviert, solange beide übereinstimmen
  // (auf Wunsch des Users: sonst ist nach einem Klick nicht erkennbar, ob
  // schon gespeichert wurde oder nicht). Wird NUR bei Erfolg aktualisiert,
  // damit ein abgelehnter Speicherversuch (siehe setGlobalSetting-
  // Validierung) den Button wieder aktiv lässt statt fälschlich "erledigt"
  // zu zeigen.
  const [lastSavedValue, setLastSavedValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  function save(next: unknown) {
    setValue(next);
    startTransition(async () => {
      const result = await setGlobalSetting(def.key, next);
      if (!result.success) {
        showAppAlert(result.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setLastSavedValue(next);
    });
  }

  // type: "number" landete bisher wie "string" im generischen Zweig unten —
  // der Input-Wert bleibt beim Tippen ein JS-String, ohne diese Umwandlung
  // würde save() den rohen String statt einer echten Zahl in die
  // jsonb-Spalte schreiben (bisher nie aufgefallen, da nur boolean/string
  // real genutzt wurden). Speichern-Button bleibt disabled, solange der
  // Text keine ganze positive Zahl ergibt (auf Wunsch des Users — z.B. für
  // die Marker-Schwellen ergeben negative/gebrochene Zahlen keinen Sinn).
  // Die eigentliche Autorität bleibt serverseitig (setGlobalSetting).
  const isNumber = def.type === "number";
  const numericValue = isNumber ? Number(value) : null;
  const isInvalidNumber =
    isNumber &&
    (String(value).trim() === "" ||
      Number.isNaN(numericValue) ||
      !Number.isInteger(numericValue) ||
      (numericValue as number) <= 0);
  // Vergleich mit dem tatsächlich zu speichernden Wert (bei Zahlen die
  // umgewandelte Zahl, nicht der rohe Eingabe-String) — sonst würde z.B.
  // "1500" nach dem Tippen einer führenden Null ("01500") fälschlich als
  // "ungespeicherte Änderung" gelten, obwohl der zu speichernde Wert gleich
  // bliebe.
  const hasUnsavedChange = (isNumber ? numericValue : value) !== lastSavedValue;

  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{def.label}</p>
        <p className="text-xs text-muted-foreground">{def.description}</p>
      </div>
      {def.type === "boolean" ? (
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(checked) => save(checked)}
          disabled={isPending}
          data-testid={`app-setting-${def.key}`}
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
              data-testid={`app-setting-${def.key}`}
            />
          ) : (
            <Input
              type="text"
              value={String(value)}
              onChange={(event) => setValue(event.target.value)}
              disabled={isPending}
              className="w-32"
              data-testid={`app-setting-${def.key}`}
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
