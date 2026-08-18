"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import type { StripeCheckoutLoadActionsSuccess, Appearance, CssFontSource } from "@stripe/stripe-js";
import { Loader2 } from "lucide-react";
import { getCheckoutClientSecret } from "../actions";
import { Button } from "@/components/ui/button";
import { showAppAlert } from "@/lib/app-alert";

// Einmalig pro Modul geladen (Stripe.js-Skript + Publishable Key), nicht
// pro Komponenten-Mount — gleiches Muster wie in Stripes eigenen Beispielen.
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

// "inherit" (die naheliegende Wahl) funktioniert hier NICHT: das Payment
// Element rendert in einem cross-origin iFrame ohne Zugriff auf unser
// CSS/next-font-Setup, "inherit" fällt dort auf die Browser-Serif-
// Standardschrift zurück (genau der vom User gemeldete Bruch). Die
// tatsächlich verwendete App-Schrift (Inter, siehe layout.tsx) muss dem
// iFrame stattdessen explizit über die fonts-Option als Stylesheet-URL
// mitgegeben werden.
const PAYMENT_ELEMENT_FONTS: CssFontSource[] = [{ cssSrc: "https://fonts.googleapis.com/css?family=Inter:400,500,600,700" }];

// An die Tailwind-Theme-Tokens angelehnt (siehe globals.css --primary/
// --radius) statt Stripes Default-Look — der eigentliche Mehrwert dieser
// Variante gegenüber der gehosteten Seite. Einmalig beim Mount anhand der
// aktuell aktiven "dark"-Klasse auf <html> bestimmt (siehe apply-theme.ts),
// nicht live nachgeführt bei einem Theme-Wechsel WÄHREND des Bezahlvorgangs
// — das wäre ein seltener Fall und unnötige Komplexität für diese Seite.
function buildAppearance(isDark: boolean): Appearance {
  const fontFamily = "'Inter', ui-sans-serif, system-ui, sans-serif";
  return {
    theme: isDark ? "night" : "stripe",
    variables: {
      colorPrimary: isDark ? "#FF6F61" : "#db504b",
      colorBackground: isDark ? "#171717" : "#ffffff",
      borderRadius: "10px",
      fontFamily,
    },
    // Die Zahlarten-Tab-Beschriftungen ("Karte"/"Klarna"/...) übernehmen
    // variables.fontFamily nicht zuverlässig (getestet: Formularfelder
    // erben korrekt, die Tab-Labels blieben in der Browser-Serif-
    // Standardschrift hängen) — deshalb zusätzlich explizit per rules auf
    // die von Stripe dokumentierten Tab-Klassen gesetzt.
    rules: {
      ".Tab": { fontFamily },
      ".TabLabel": { fontFamily },
    },
  };
}

/**
 * Payment Element über die Checkout-Sessions-API (ui_mode: "elements", vom
 * Server per getCheckoutClientSecret erzeugt — siehe
 * plans/stripe-custom-checkout/plan.md). @stripe/react-stripe-js bietet für
 * dieses Muster (Stand v6.8.1) keine React-Hooks/-Provider (nur für
 * ui_mode "embedded_page"/"form") — daher direkter Umgang mit dem vanilla
 * @stripe/stripe-js-API: initCheckoutElementsSdk → createPaymentElement →
 * mount, loadActions() liefert die confirm()-Funktion.
 */
export function CustomCheckoutClient({ orderId }: { orderId: string }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<StripeCheckoutLoadActionsSuccess | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let mountedElement: { unmount(): void; destroy(): void } | null = null;

    async function setup() {
      if (!stripePromise) {
        setSetupError("Stripe ist nicht konfiguriert (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY fehlt).");
        return;
      }
      const [stripe, secretResult] = await Promise.all([stripePromise, getCheckoutClientSecret(orderId)]);
      if (cancelled) return;
      if (!stripe) {
        setSetupError("Stripe konnte nicht geladen werden.");
        return;
      }
      if (!secretResult.success || !secretResult.clientSecret) {
        setSetupError(secretResult.error ?? "Zahlung konnte nicht vorbereitet werden.");
        return;
      }

      const isDark = document.documentElement.classList.contains("dark");
      const checkoutSdk = stripe.initCheckoutElementsSdk({
        clientSecret: secretResult.clientSecret,
        elementsOptions: { appearance: buildAppearance(isDark), fonts: PAYMENT_ELEMENT_FONTS },
      });

      const paymentElement = checkoutSdk.createPaymentElement();
      if (containerRef.current) {
        paymentElement.mount(containerRef.current);
        mountedElement = paymentElement;
      }

      const actionsResult = await checkoutSdk.loadActions();
      if (cancelled) return;
      if (actionsResult.type !== "success") {
        setSetupError(actionsResult.error.message);
        return;
      }
      actionsRef.current = actionsResult.actions;
      setIsReady(true);
    }

    setup().catch(() => {
      if (!cancelled) setSetupError("Zahlung konnte nicht vorbereitet werden.");
    });

    return () => {
      cancelled = true;
      mountedElement?.unmount();
    };
  }, [orderId]);

  function handleSubmit() {
    const actions = actionsRef.current;
    if (!actions) return;
    setIsSubmitting(true);
    actions
      .confirm({
        // KEIN returnUrl hier — die Session trägt bereits ein return_url
        // (siehe getCheckoutClientSecret), ein zweites bei confirm() lässt
        // Stripe nicht zu ("You cannot provide `returnUrl` to confirm()
        // when `return_url` was already provided..."). Nur redirect-
        // pflichtige Zahlarten verlassen die Seite (dorthin) — bei
        // Kartenzahlung bleibt der Kunde hier.
        redirect: "if_required",
      })
      .then((result) => {
        if (result.type === "success") {
          router.push(`/checkout/success?order=${orderId}`);
          return;
        }
        setIsSubmitting(false);
        showAppAlert(result.error.message);
      })
      .catch(() => {
        setIsSubmitting(false);
        showAppAlert("Zahlung konnte nicht bestätigt werden.");
      });
  }

  if (setupError) {
    return (
      <p className="text-sm text-destructive" data-testid="custom-checkout-error">
        {setupError}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!isReady && (
        <div className="flex items-center justify-center py-8" data-testid="custom-checkout-loading">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <div ref={containerRef} data-testid="custom-checkout-payment-element" className={isReady ? "" : "hidden"} />
      {isReady && (
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
          onClick={handleSubmit}
          data-testid="custom-checkout-submit"
        >
          {isSubmitting ? "Wird bestätigt…" : "Bezahlen"}
        </Button>
      )}
    </div>
  );
}
