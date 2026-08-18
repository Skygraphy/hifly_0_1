import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface NavTabItem {
  value: string;
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * Seitliche Sprünge zwischen Geschwister-Bereichen (z.B. Admin-Shop:
 * Pakete/Drucke/Rabattstufen) — echte `<Link>`s statt eines Client-seitigen
 * Umschalters, `active` kommt (wie bei CustomerNav) explizit von der
 * jeweiligen Seite. Visuell an den Spalten/Breadcrumb-Umschalter in
 * administrative-units-manager.tsx angelehnt.
 */
export function NavTabs({ items, active, className }: { items: NavTabItem[]; active: string; className?: string }) {
  return (
    <div role="tablist" aria-label="Bereichsnavigation" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {items.map((item) => (
        <Link
          key={item.value}
          href={item.href}
          role="tab"
          aria-selected={item.value === active}
          data-testid={`nav-tab-${item.value}`}
          className={cn(buttonVariants({ variant: item.value === active ? "secondary" : "ghost", size: "sm" }))}
        >
          {item.icon && <item.icon className="size-3.5" />}
          {item.label}
        </Link>
      ))}
    </div>
  );
}
