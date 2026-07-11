"use client";

import { useState, useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setPersonalSettingPermission } from "./actions";
import type { Role } from "@/lib/authorization";
import type { PersonalSettingDefinition } from "@/lib/settings-registry";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super-Admin" },
];

export function PersonalSettingPermissionRow({
  def,
  initialMinRole,
}: {
  def: PersonalSettingDefinition;
  initialMinRole: Role;
}) {
  const [minRole, setMinRole] = useState<Role>(initialMinRole);
  const [isPending, startTransition] = useTransition();

  function save(next: Role) {
    setMinRole(next);
    startTransition(async () => {
      const result = await setPersonalSettingPermission(def.key, next);
      if (!result.success) alert(result.error ?? "Speichern fehlgeschlagen.");
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{def.label}</p>
        <p className="text-xs text-muted-foreground">{def.description}</p>
      </div>
      <Select value={minRole} onValueChange={(next) => save(next as Role)} disabled={isPending}>
        <SelectTrigger data-testid={`setting-permission-${def.key}`}>
          {/* SelectValue löst den Wert erst zu einem Label auf, sobald das
              passende SelectItem mindestens einmal gerendert wurde (Popup
              ist aber erst nach dem ersten Öffnen im DOM) — Label hier
              selbst aus der Options-Liste nachschlagen, statt darauf zu warten. */}
          <SelectValue>{ROLE_OPTIONS.find((option) => option.value === minRole)?.label ?? minRole}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              data-testid={`setting-permission-${def.key}-option-${option.value}`}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
