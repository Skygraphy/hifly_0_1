"use client";

import Link from "next/link";
import { CartIndicator } from "@/components/cart-indicator";
import { cn } from "@/lib/utils";

/**
 * Kompakte Kunden-Navigation ("Start"/"Bilder"/"Shop"/"Meine Bestellungen"
 * + Warenkorb-Icon) — auf den Kunden-Seiten neben BrandMark bzw. (auf der
 * Startseite, die kein BrandMark hat) eigenständig eingesetzt, damit Shop
 * und Bestellungen von überall erreichbar bleiben statt nur im
 * Konto-Dropdown-Menü vergraben zu sein (siehe Plan "Shop-Storefront:
 * UI-Umbau für zentrale Sichtbarkeit" sowie
 * plans/iridescent-hopping-wozniak.md für die Erweiterung um
 * Start/Meine Bestellungen).
 */
export function CustomerNav({ active }: { active?: "home" | "images" | "shop" | "cart" | "orders" }) {
  return (
    <nav className="flex flex-wrap items-center gap-3 text-sm sm:gap-4">
      <Link
        href="/"
        data-testid="customer-nav-home"
        className={cn("hover:text-primary", active === "home" ? "font-medium text-primary" : "text-muted-foreground")}
      >
        Start
      </Link>
      <Link
        href="/images"
        data-testid="customer-nav-images"
        className={cn("hover:text-primary", active === "images" ? "font-medium text-primary" : "text-muted-foreground")}
      >
        Bilder
      </Link>
      <Link
        href="/shop"
        data-testid="customer-nav-shop"
        className={cn("hover:text-primary", active === "shop" ? "font-medium text-primary" : "text-muted-foreground")}
      >
        Shop
      </Link>
      <Link
        href="/orders"
        data-testid="customer-nav-orders"
        className={cn("hover:text-primary", active === "orders" ? "font-medium text-primary" : "text-muted-foreground")}
      >
        Meine Bestellungen
      </Link>
      <CartIndicator className={active === "cart" ? "text-primary" : undefined} />
    </nav>
  );
}
