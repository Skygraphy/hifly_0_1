"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BUTTON_GLASS_CLASS } from "@/lib/badge-glass-style";
import { cn } from "@/lib/utils";

/**
 * "Zum Shop"-Button für ein einzelnes Bild — führt auf die eigene
 * Produktseite /shop/image/[imageId] (siehe src/app/shop/image/[imageId]/),
 * die strukturiert alle für DIESES Bild bestellbaren Pakete/Drucke zeigt
 * (Kurzbeschreibung, Preis, Mengenauswahl, "In den Warenkorb"/"Sofort
 * kaufen"). Bewusst keine Login-Sperre auf dem Button selbst — Stöbern UND
 * "In den Warenkorb" sind öffentlich, nur der eigentliche Checkout-Schritt
 * auf der Zielseite verlangt ein Konto (siehe dort).
 */
export function AddToCartButton({
  imageId,
  size = "icon-sm",
  className,
  testId,
}: {
  imageId: string;
  size?: "icon-sm" | "icon-xs";
  className?: string;
  testId?: string;
}) {
  const iconClassName = size === "icon-sm" ? "size-4" : "size-3.5";

  return (
    <Link
      href={`/shop/image/${imageId}`}
      aria-label="Zum Shop für dieses Bild"
      data-testid={testId}
      onClick={(event) => event.stopPropagation()}
      className={cn(buttonVariants({ variant: "secondary", size }), BUTTON_GLASS_CLASS, "text-primary", className)}
    >
      <ShoppingCart className={iconClassName} />
    </Link>
  );
}
