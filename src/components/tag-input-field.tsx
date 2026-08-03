"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

/**
 * Eingabefeld für eine string[]-Liste im Chip-Stil (statt eines
 * kommagetrennten Textfelds): tippen, `Enter` verwandelt den aktuellen
 * Entwurf in einen Chip, `Backspace` bei leerem Entwurf entfernt den
 * letzten Chip, jeder Chip hat sein eigenes "×" — dieselbe Coral-Badge-
 * Optik wie überall sonst im Projekt (siehe Tag-Badges in
 * image-thumbnail-card.tsx). Exakte Duplikate werden beim Hinzufügen
 * stillschweigend ignoriert statt doppelt aufgenommen.
 */
export function TagInputField({
  id,
  label,
  values,
  onChange,
  placeholder,
  testId,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  testId: string;
}) {
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setDraft("");
  }

  function removeAt(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* text-xs/muted statt des vollen Label-Standardstils (text-sm, volle
          Vordergrundfarbe) — dieselbe kleinere, gedämpfte Kombination wie
          bei Popup-Menü-Sektionsköpfen (siehe FIELD_LABEL_CLASS in
          image-edit-dialog.tsx, dem einzigen aktuellen Aufrufer). */}
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {/* Kein focus-within:ring (box-shadow) — folgt bei einem eigenen
          border-radius sichtbar eckiger als der Rand selbst und wirkt dann
          wie ein über den Rand hinauslaufender Hintergrund (dasselbe Problem
          wie beim Tag-Eingabefeld auf der Kachel, siehe TruncatedBadgeText/
          image-thumbnail-card.tsx). Fokus zeigt sich allein über die
          Randfarbe (focus-within:border-ring). */}
      <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 transition-colors focus-within:border-ring dark:bg-input/30">
        {values.map((value, index) => (
          <Badge key={value} variant="secondary" className="gap-1 border-primary/30 bg-primary/20 text-primary">
            <span className="max-w-40 truncate">{value}</span>
            <button
              type="button"
              aria-label={`"${value}" entfernen`}
              onClick={() => removeAt(index)}
              className="shrink-0 rounded-full hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          id={id}
          data-testid={testId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft();
            }
            if (event.key === "Backspace" && draft === "" && values.length > 0) {
              removeAt(values.length - 1);
            }
          }}
          onBlur={commitDraft}
          placeholder={placeholder}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
