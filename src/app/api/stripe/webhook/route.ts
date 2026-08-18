import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { orders, type OrderShippingAddress } from "@/db/schema";
import { getStripeClient } from "@/lib/stripe";
import { sendOrderConfirmationEmail } from "@/lib/order-email";

/**
 * Route Handler statt Server Action: Stripe postet direkt hierher, braucht
 * den ROHEN Body für die Signaturprüfung (stripe-signature-Header) — ein
 * `request.json()` davor würde die HMAC-Prüfung unbrauchbar machen (siehe
 * Konzept-Plan Abschnitt 3/6). `paid` wird AUSSCHLIESSLICH hier gesetzt, nie
 * von der Erfolgsseite (/checkout/success), die für sich genommen kein
 * Zahlungsbeweis ist.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Fehlende Signatur." }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Signaturprüfung fehlgeschlagen." }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      // Beide Events laufen über dieselbe Funktion: bei asynchronen
      // Zahlarten (SEPA, Klarna, EPS, Bancontact, ...) ist die Session mit
      // "completed" schon abgeschlossen, aber noch nicht bezahlt —
      // handleCheckoutSessionCompleted prüft payment_status selbst und
      // markiert erst bei der tatsächlichen Bestätigung (die dann als
      // async_payment_succeeded reinkommt) als "paid".
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "checkout.session.async_payment_failed":
      // Bewusst kein DB-Update: die Order bleibt "pending_payment" — exakt
      // derselbe Zustand wie bei einer direkt abgelehnten Kartenzahlung.
      // Der User kann über "Jetzt bezahlen" erneut versuchen. Als eigener
      // Case aufgeführt (statt im default mitzulaufen), damit klar bleibt:
      // bewusst geprüft, nicht übersehen.
      break;
    case "checkout.session.expired":
      await handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      break;
    default:
      // Andere Events (z.B. payment_intent.*) sind für unseren Checkout-
      // Session-basierten Flow nicht relevant — bewusst ignoriert statt
      // eines Fehlers, damit Stripe sie nicht wiederholt zustellt.
      break;
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  // Bei asynchronen Zahlarten (SEPA, Klarna, EPS, Bancontact, ...) — seit
  // dem Umstieg auf dynamische Zahlarten (siehe getCheckoutClientSecret)
  // real möglich — ist die Session bei "completed" schon abgeschlossen,
  // der payment_status aber noch "unpaid": die tatsächliche Bestätigung
  // kommt erst später als eigenes checkout.session.async_payment_succeeded-
  // Event (ruft dieselbe Funktion erneut auf, dann mit payment_status
  // "paid"). Ohne diese Prüfung würde ein digitales Paket sofort
  // freigeschaltet bzw. eine Bestätigungsmail verschickt, obwohl die
  // Zahlung noch scheitern kann.
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

  // Bedingtes UPDATE (nur solange status noch pending_payment ist) —
  // idempotent gegenüber doppelten Webhook-Zustellungen: eine bereits
  // bezahlte Order wird bei einem erneuten Event NICHT nochmal
  // aktualisiert, geschweige denn ein zweites Mal "bezahlt". returning()
  // verrät, ob dieser Aufruf den Wechsel TATSÄCHLICH ausgelöst hat — nur
  // dann geht die Bestätigungsmail raus (Konzept-Plan Abschnitt 10),
  // sonst würde ein Retry-Event dieselbe Mail ein zweites Mal verschicken.
  const updatedRows = await db
    .update(orders)
    .set({
      status: "paid",
      paidAt: new Date(),
      stripePaymentIntentId: paymentIntentId,
      shippingAddress: extractShippingAddress(session),
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")))
    .returning({ id: orders.id });

  if (updatedRows.length > 0) {
    await sendOrderConfirmationEmail(orderId);
  }
}

async function handleCheckoutSessionExpired(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  await db
    .update(orders)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")));
}

async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? null);
  if (!paymentIntentId) return;

  await db
    .update(orders)
    .set({ status: "refunded", updatedAt: new Date() })
    .where(and(eq(orders.stripePaymentIntentId, paymentIntentId), eq(orders.status, "paid")));
}

function extractShippingAddress(session: Stripe.Checkout.Session): OrderShippingAddress | null {
  const shippingDetails = session.collected_information?.shipping_details;
  const address = shippingDetails?.address;
  if (!address?.line1 || !address.postal_code || !address.city || !address.country) return null;

  return {
    name: shippingDetails?.name ?? null,
    line1: address.line1,
    line2: address.line2 ?? null,
    postalCode: address.postal_code,
    city: address.city,
    country: address.country,
  };
}
