"use client";

import { useState, type ReactNode } from "react";
import { Star } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MAX_RATING = 10;

/**
 * 1-10 Sterne statt einer nackten Zahl in einem <input type="number">.
 * Klick setzt die Bewertung; ein Klick auf den bereits aktiven Stern setzt
 * sie wieder auf "keine Bewertung" (null) zurück, statt eine eigene
 * "Zurücksetzen"-Aktion zu brauchen. Hover blendet eine Vorschau bis zum
 * gerade überfahrenen Stern ein, ohne den tatsächlichen Wert zu ändern.
 * focus-visible:outline (echtes CSS-Outline) statt eines Box-Shadow-Rings —
 * Ringe folgen bei den Icon-Buttons hier zwar unkritisch (kaum
 * border-radius), aus Konsistenz zu den übrigen Feldern trotzdem vermieden
 * (siehe ui/input.tsx).
 */
export function StarRatingField({
  id,
  label,
  value,
  onChange,
  disabled,
  testId,
}: {
  id: string;
  label: ReactNode;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  testId: string;
}) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const displayValue = hoverValue ?? value;

  return (
    <div className="flex flex-col gap-1.5">
      {/* text-xs/muted statt des vollen Label-Standardstils — siehe
          Begründung in tag-input-field.tsx (dieselbe Kombination). */}
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div
        id={id}
        data-testid={testId}
        className="flex flex-wrap items-center gap-0.5"
        onMouseLeave={() => setHoverValue(null)}
      >
        {Array.from({ length: MAX_RATING }, (_, index) => index + 1).map((star) => {
          const filled = displayValue !== null && star <= displayValue;
          return (
            <button
              key={star}
              type="button"
              disabled={disabled}
              aria-label={`${star} von ${MAX_RATING} Sternen`}
              aria-pressed={value !== null && star <= value}
              data-testid={`${testId}-star-${star}`}
              onClick={() => onChange(value === star ? null : star)}
              onMouseEnter={() => setHoverValue(star)}
              className="rounded-sm p-0.5 text-muted-foreground outline-none transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50"
            >
              <Star className={cn("size-4", filled && "fill-primary text-primary")} />
            </button>
          );
        })}
        <span className="ml-1 text-xs text-muted-foreground" data-testid={`${testId}-value`}>
          {value !== null ? `${value}/${MAX_RATING}` : "—"}
        </span>
      </div>
    </div>
  );
}
