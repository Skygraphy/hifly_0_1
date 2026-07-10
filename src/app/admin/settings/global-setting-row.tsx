"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setGlobalSetting } from "./actions";
import type { GlobalSettingDefinition } from "@/lib/settings-registry";

export function GlobalSettingRow({
  def,
  initialValue,
}: {
  def: GlobalSettingDefinition;
  initialValue: unknown;
}) {
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  function save(next: unknown) {
    setValue(next);
    startTransition(async () => {
      const result = await setGlobalSetting(def.key, next);
      if (!result.success) alert(result.error ?? "Speichern fehlgeschlagen.");
    });
  }

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
          <Input
            value={String(value)}
            onChange={(event) => setValue(event.target.value)}
            disabled={isPending}
            className="w-32"
            data-testid={`app-setting-${def.key}`}
          />
          <Button size="sm" disabled={isPending} onClick={() => save(value)}>
            Speichern
          </Button>
        </div>
      )}
    </div>
  );
}
