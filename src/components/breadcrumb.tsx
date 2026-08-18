import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  /** Weglassen → nicht klickbares Label (Gruppierung ohne eigene Route,
   * z.B. "Digitale Pakete"). Beim letzten Item immer weglassen. */
  href?: string;
}

/**
 * Klickbare Pfad-Stationen zwischen BrandMark/CustomerNav-Zeile und der
 * Seitenüberschrift (siehe plans/iridescent-hopping-wozniak.md) — ergänzt
 * den einzelnen Zurück-Pfeil (BackLink) um mehrere aktiv wählbare Sprünge
 * auf einmal. Als dezente Pillen statt reinem Fließtext mit Trennzeichen,
 * aber bewusst zurückhaltend (auf Wunsch des Users, nach einer ersten, zu
 * kräftigen Version mit voll gefüllter Primärfarben-Pille):
 * - vorherige, klickbare Stationen: dünn umrandet, gedämpfter Text, erst bei
 *   Hover eingefärbt
 * - reine Zwischenstationen ohne eigene Route (z.B. "Digitale Pakete"):
 *   einfacher Text, keine Pille — nicht interaktiv, soll nicht wie eine
 *   klickbare Station aussehen
 * - aktuelle Seite: leicht getönte Pille (Primärfarbe nur als Tint/Rand,
 *   keine volle Füllung) — markiert "du bist hier", ohne die lauteste
 *   Fläche auf der Seite zu sein
 */
export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  if (items.length < 2) return null;

  return (
    <nav aria-label="Breadcrumb" data-testid="breadcrumb" className={cn("flex flex-wrap items-center gap-1 text-xs", className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1" data-testid={`breadcrumb-item-${index}`}>
            {index > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />}
            {/* Letztes Item ist immer die aktuelle Seite — auch wenn ein
                Aufrufer versehentlich einen href mitgibt, bewusst nicht
                verlinkt (defensiv). */}
            {!isLast && item.href ? (
              <Link
                href={item.href}
                className="cursor-pointer rounded-full border border-transparent px-2 py-0.5 text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : isLast ? (
              <span
                aria-current="page"
                className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 font-medium text-primary"
              >
                {item.label}
              </span>
            ) : (
              <span className="px-0.5 text-muted-foreground/70">{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
