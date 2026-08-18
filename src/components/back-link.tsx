import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BackLink({
  href,
  label = "Zurück",
  className,
}: {
  href: string;
  label?: string;
  /** Überschreibt nur die Positionierung (absolute→fixed) für Seiten mit
   * langem Scroll-Inhalt, auf denen der Pfeil sonst außer Sicht gerät
   * (siehe /checkout/[orderId]) — restliche Seiten lassen das Prop weg und
   * behalten die bisherige absolute Positionierung. */
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      data-testid="back-link"
      className={cn(buttonVariants({ variant: "outline", size: "icon" }), "absolute left-4 top-4 z-20", className)}
    >
      <ArrowLeft className="size-4" />
    </Link>
  );
}
