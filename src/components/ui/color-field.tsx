"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const FALLBACK_COLOR = "#d9603f";

function isValidHex(hex: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(hex.trim());
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const normalized = isValidHex(hex) ? hex.trim() : FALLBACK_COLOR;
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = (((g - b) / delta) % 6) * 60;
    else if (max === g) h = ((b - r) / delta + 2) * 60;
    else h = ((r - g) / delta + 4) * 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Sättigung/Hellwert-Fläche + Farbton-Regler zur visuellen Auswahl. Schreibt
 * bei jeder Interaktion direkt den resultierenden Hex-Wert über onChange
 * zurück — es gibt keinen internen State, die Fläche liest ihre Position
 * ausschließlich aus dem aktuellen Hex-Wert ab (kontrollierte Komponente).
 */
function ColorPickerPanel({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const { h, s, v } = hexToHsv(value);
  const svRef = React.useRef<HTMLDivElement>(null);

  function updateFromPointer(clientX: number, clientY: number) {
    const rect = svRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    onChange(hsvToHex(h, x, 1 - y));
  }

  function handleSvPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event.clientX, event.clientY);
  }

  function handleSvPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.buttons !== 1) return;
    updateFromPointer(event.clientX, event.clientY);
  }

  return (
    <div className="flex w-56 flex-col gap-3 p-3">
      <div
        ref={svRef}
        onPointerDown={handleSvPointerDown}
        onPointerMove={handleSvPointerMove}
        className="relative h-36 w-full cursor-crosshair touch-none rounded-md"
        style={{
          backgroundColor: `hsl(${h}, 100%, 50%)`,
          backgroundImage: "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
        }}
      >
        <div
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={360}
        value={h}
        onChange={(event) => onChange(hsvToHex(Number(event.target.value), s, v))}
        aria-label="Farbton"
        className="h-2 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow"
        style={{
          background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        }}
      />
    </div>
  );
}

/**
 * Hex-Textfeld + eigener Farbwähler-Popover (statt natives <input
 * type="color">) — der native Browser-Picker zeigt standardmäßig RGB-Regler
 * und merkt sich den zuletzt genutzten Modus browserweit; das lässt sich von
 * der Seite aus nicht auf Hex umstellen. Im eigenen Popover ist Hex daher
 * das EINZIGE Zahlenfeld (keine RGB-Eingabe), zusätzlich zur Sättigungs-
 * /Farbton-Fläche zum visuellen Auswählen.
 */
export function ColorField({
  id,
  label = "Farbe (Hex)",
  value,
  onChange,
  "data-testid": dataTestId,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  "data-testid"?: string;
}) {
  const swatchColor = isValidHex(value) ? value.trim() : FALLBACK_COLOR;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          data-testid={dataTestId}
          placeholder={FALLBACK_COLOR}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Popover>
          <PopoverTrigger
            type="button"
            aria-label={`${label} auswählen`}
            data-testid={dataTestId ? `${dataTestId}-picker` : undefined}
            // Kein focus-visible:ring (box-shadow) — siehe Begründung in
            // ui/input.tsx (derselbe Rand-Überlauf-Effekt). Fokus zeigt sich
            // stattdessen über die Randfarbe.
            className={cn(
              "h-8 w-8 shrink-0 rounded-lg border border-input outline-none focus-visible:border-ring"
            )}
            style={{ backgroundColor: swatchColor }}
          />
          <PopoverContent>
            <ColorPickerPanel value={value} onChange={onChange} />
            <div className="border-t p-3 pt-2">
              <Input
                aria-label="Hex-Wert"
                data-testid={dataTestId ? `${dataTestId}-picker-hex` : undefined}
                // Bewusst swatchColor statt dem rohen value: solange das
                // Textfeld leer/ungültig ist, zeigt swatchColor bereits den
                // Fallback (identisch zu dem, was die SV-Fläche/der Regler
                // gerade darstellen) — sonst würde der Picker eine Farbe
                // vorauswählen, ohne dass sein eigenes Hex-Feld sie anzeigt.
                value={swatchColor}
                onChange={(event) => onChange(event.target.value)}
                className="text-center font-mono"
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
