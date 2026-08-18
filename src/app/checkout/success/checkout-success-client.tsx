"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Package } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getOrderStatus, type OrderStatusSummary } from "../actions";
import { useCartStore } from "@/lib/cart-store";
import { formatPriceCents } from "@/lib/shop";

const POLL_INTERVAL_MS = 2000;
// ~30s Gesamt-Wartezeit — der Webhook trifft normalerweise binnen weniger
// Sekunden ein; danach lieber "wird noch bestätigt" stehen lassen, als
// endlos weiterzupollen (siehe Konzept-Plan Abschnitt 3: der Redirect
// selbst ist kein Zahlungsbeweis, NUR der Webhook setzt "paid").
const MAX_POLLS = 15;

/**
 * Pollt den Bestellstatus statt den Erfolgs-Redirect selbst als Beleg zu
 * behandeln — der Webhook (src/app/api/stripe/webhook/route.ts) kann nach
 * dem Redirect noch unterwegs sein. Leert den Warenkorb einmalig beim
 * ersten Rendern (die Bestellung ist ab hier in der DB verankert,
 * unabhängig vom exakten Zahlungszeitpunkt).
 */
export function CheckoutSuccessClient({ orderId }: { orderId: string }) {
  const [summary, setSummary] = useState<OrderStatusSummary | null>(null);
  const [pollsDone, setPollsDone] = useState(0);
  const clearCart = useCartStore((state) => state.clear);
  const hasCleared = useRef(false);

  useEffect(() => {
    if (hasCleared.current) return;
    hasCleared.current = true;
    clearCart();
  }, [clearCart]);

  useEffect(() => {
    let cancelled = false;
    getOrderStatus(orderId).then((result) => {
      if (!cancelled) setSummary(result);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, pollsDone]);

  useEffect(() => {
    if (summary?.status !== "pending_payment") return;
    if (pollsDone >= MAX_POLLS) return;
    const timer = setTimeout(() => setPollsDone((count) => count + 1), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [summary, pollsDone]);

  if (!summary) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="checkout-success-loading">
        Bestellung wird geladen…
      </p>
    );
  }

  if (summary.status === "pending_payment") {
    return (
      <div className="flex flex-col items-center gap-3 text-center" data-testid="checkout-success-pending">
        <Clock className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Zahlung wird noch bestätigt … Das kann einen Moment dauern.</p>
      </div>
    );
  }

  if (summary.status === "paid") {
    return (
      <div className="flex flex-col items-center gap-3 text-center" data-testid="checkout-success-paid">
        <CheckCircle2 className="size-8 text-primary" />
        <p className="text-sm">Vielen Dank für deine Bestellung!</p>
        <p className="text-sm text-muted-foreground">
          Gesamtsumme: {formatPriceCents(summary.totalCents)} — {summary.lineItemCount} Position(en)
        </p>
        <Link href="/orders" className={cn(buttonVariants())} data-testid="checkout-success-orders-link">
          Zu meinen Bestellungen
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center" data-testid="checkout-success-other">
      <Package className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Diese Bestellung ist aktuell nicht (mehr) aktiv (Status: {summary.status}).</p>
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
        Zurück zur Startseite
      </Link>
    </div>
  );
}
