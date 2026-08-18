"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCartStore } from "@/lib/cart-store";
import { cn } from "@/lib/utils";

/**
 * Warenkorb-Icon mit Mengen-Badge — liest useCartStore direkt (keine
 * Props nötig, eigenständig wie FavoriteButton/AddToCartButton), damit es
 * überall unabhängig eingesetzt werden kann. Funktioniert auch anonym
 * (der Warenkorb selbst braucht kein Konto, nur der Checkout, siehe
 * src/app/checkout/actions.ts).
 */
export function CartIndicator({ className }: { className?: string }) {
  // Anzahl der Positionen (Zeilen im Warenkorb), nicht die aufsummierte
  // Stückzahl über alle Drucke — auf Wunsch des Users, sonst wirkt das
  // Badge z.B. bei "1 digitales Paket + 2 Stück eines Drucks" mit "3"
  // inkonsistent zu den nur 2 sichtbaren Zeilen im Warenkorb.
  const itemCount = useCartStore((state) => state.items.length);

  return (
    <Link
      href="/cart"
      aria-label="Warenkorb"
      data-testid="cart-indicator"
      className={cn("relative flex items-center text-foreground hover:text-primary", className)}
    >
      <ShoppingCart className="size-5" />
      {itemCount > 0 && (
        <Badge
          className="absolute -right-2 -top-2 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
          data-testid="cart-indicator-count"
        >
          {itemCount}
        </Badge>
      )}
    </Link>
  );
}
