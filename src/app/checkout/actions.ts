"use server";

// Checkout-Server-Action — nimmt NUR Auswahl-Ids vom Client entgegen
// (imageId + Paket/Kategorie oder Format/Qualität + Menge), niemals Preise
// oder Verfügbarkeit. Jede Zeile wird hier serverseitig frisch gegen
// resolveEffectivePackagesForImage/resolveEffectivePrintFormatsForImage
// (src/lib/shop-resolution.ts) validiert und mit dem aktuellen Katalogpreis
// neu bepreist — der Warenkorb-Store (src/lib/cart-store.ts) ist reine UX,
// nie eine Vertrauensquelle. Siehe Konzept-Plan Abschnitt 3.

import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  images,
  users,
  shopPackages,
  shopPackageCategories,
  shopPackagePrices,
  shopPrintFormats,
  shopPrintQualities,
  shopPrintFormatPrices,
  shopDiscountTiers,
  orders,
  orderLineItems,
} from "@/db/schema";
import { resolveEffectivePackagesForImage, resolveEffectivePrintFormatsForImage } from "@/lib/shop-resolution";
import { resolveDiscountTier, calculateDiscountCents, type ShopDiscountTier } from "@/lib/orders";
import { getGlobalSettings } from "@/lib/settings-service";
import { getStripeClient } from "@/lib/stripe";
import { getBaseUrl } from "@/lib/base-url";
import { formatPriceCents, type ShopActionResult } from "@/lib/shop";

export interface CheckoutCartItemInput {
  imageId: string;
  kind: "digital_package" | "print";
  packageId?: string;
  printFormatId?: string;
  printQualityId?: string;
  quantity: number;
}

// Eigener Rückgabetyp statt ShopActionResult — clientSecret ist kein Feld
// von ShopActionResult (das nur success/error/id kennt).
export interface CheckoutClientSecretResult {
  success: boolean;
  error?: string;
  clientSecret?: string;
}

interface ValidatedLine {
  imageId: string;
  kind: "digital_package" | "print";
  packageId: string | null;
  categoryId: string | null;
  printFormatId: string | null;
  printQualityId: string | null;
  priceCents: number;
  quantity: number;
  snapshotLabel: string;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
function randomLetters(length: number): string {
  return Array.from({ length }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
}

async function validateDigitalPackageLine(item: CheckoutCartItemInput): Promise<ValidatedLine | string> {
  if (!item.packageId) return "Ungültige Warenkorb-Position (Paket fehlt).";

  const effective = await resolveEffectivePackagesForImage(item.imageId);
  const match = effective.find((row) => row.packageId === item.packageId);
  if (!match) return "Ein Paket im Warenkorb ist für dieses Bild nicht (mehr) verfügbar.";

  const [priceRow] = await db
    .select({ priceCents: shopPackagePrices.priceCents })
    .from(shopPackagePrices)
    .where(and(eq(shopPackagePrices.packageId, match.packageId), eq(shopPackagePrices.categoryId, match.categoryId)))
    .limit(1);
  if (!priceRow) return "Für ein Paket im Warenkorb ist kein Preis hinterlegt.";

  const [imageRow] = await db.select({ hash: images.hash }).from(images).where(eq(images.id, item.imageId)).limit(1);
  const [packageRow] = await db.select({ name: shopPackages.name }).from(shopPackages).where(eq(shopPackages.id, match.packageId)).limit(1);
  const [categoryRow] = await db
    .select({ name: shopPackageCategories.name })
    .from(shopPackageCategories)
    .where(eq(shopPackageCategories.id, match.categoryId))
    .limit(1);

  return {
    imageId: item.imageId,
    kind: "digital_package",
    packageId: match.packageId,
    categoryId: match.categoryId,
    printFormatId: null,
    printQualityId: null,
    priceCents: priceRow.priceCents,
    // Ein digitales Paket für dasselbe Bild ergibt nur einmal Sinn — Menge
    // wird unabhängig vom Client-Wert immer auf 1 erzwungen.
    quantity: 1,
    snapshotLabel: `Paket „${packageRow?.name ?? match.packageId}“ (Kategorie ${categoryRow?.name ?? match.categoryId}) — Bild ${imageRow?.hash ?? item.imageId}`,
  };
}

async function validatePrintLine(item: CheckoutCartItemInput): Promise<ValidatedLine | string> {
  if (!item.printFormatId || !item.printQualityId) return "Ungültige Warenkorb-Position (Format/Qualität fehlt).";

  const effective = await resolveEffectivePrintFormatsForImage(item.imageId);
  const match = effective.find(
    (row) => row.printFormatId === item.printFormatId && row.printQualityIds.includes(item.printQualityId!)
  );
  if (!match) return "Ein Druck im Warenkorb ist für dieses Bild nicht (mehr) verfügbar.";

  const [priceRow] = await db
    .select({ priceCents: shopPrintFormatPrices.priceCents })
    .from(shopPrintFormatPrices)
    .where(
      and(eq(shopPrintFormatPrices.printFormatId, item.printFormatId), eq(shopPrintFormatPrices.printQualityId, item.printQualityId))
    )
    .limit(1);
  if (!priceRow) return "Für einen Druck im Warenkorb ist kein Preis hinterlegt.";

  const quantity = Math.floor(item.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return "Ungültige Stückzahl in einer Druck-Position.";
  }

  const [imageRow] = await db.select({ hash: images.hash }).from(images).where(eq(images.id, item.imageId)).limit(1);
  const [formatRow] = await db.select({ name: shopPrintFormats.name }).from(shopPrintFormats).where(eq(shopPrintFormats.id, item.printFormatId)).limit(1);
  const [qualityRow] = await db
    .select({ name: shopPrintQualities.name })
    .from(shopPrintQualities)
    .where(eq(shopPrintQualities.id, item.printQualityId))
    .limit(1);

  return {
    imageId: item.imageId,
    kind: "print",
    packageId: null,
    categoryId: null,
    printFormatId: item.printFormatId,
    printQualityId: item.printQualityId,
    priceCents: priceRow.priceCents,
    quantity,
    snapshotLabel: `Druck ${formatRow?.name ?? item.printFormatId}, ${qualityRow?.name ?? item.printQualityId} — Bild ${imageRow?.hash ?? item.imageId}`,
  };
}

/**
 * Stripe-Coupon einer Rabattstufe — lazy angelegt und auf der Stufe
 * zurückgeschrieben, nicht pro Bestellung neu erzeugt (siehe Konzept-Plan
 * Abschnitt 7). Ein Coupon ist an einen FESTEN Prozentsatz gebunden, ein
 * bereits hinterlegter stripeCouponId wird daher unverändert wiederverwendet
 * (Änderungen am Prozentsatz setzen ihn in den Discount-Tier-Actions bereits
 * auf null zurück).
 */
async function ensureStripeCouponForTier(tier: ShopDiscountTier): Promise<string> {
  if (tier.stripeCouponId) return tier.stripeCouponId;

  const stripe = getStripeClient();
  const coupon = await stripe.coupons.create({
    percent_off: tier.discountPercent,
    duration: "once",
    name: `Rabatt ab ${formatPriceCents(tier.thresholdCents)}`,
  });
  await db.update(shopDiscountTiers).set({ stripeCouponId: coupon.id }).where(eq(shopDiscountTiers.id, tier.id));
  return coupon.id;
}

/**
 * Stripe-Customer für den eingeloggten User — lazy angelegt und auf
 * users.stripeCustomerId zurückgeschrieben (siehe Konzept-Plan Abschnitt 2:
 * ermöglicht Stripes eigenes Adress-/Zahlungsmittel-Autofill bei
 * wiederkehrenden Käufern, ohne dass wir die Adresse selbst dauerhaft
 * speichern).
 */
async function ensureStripeCustomer(userId: string, email: string): Promise<string> {
  const [userRow] = await db.select({ stripeCustomerId: users.stripeCustomerId }).from(users).where(eq(users.id, userId)).limit(1);
  if (userRow?.stripeCustomerId) return userRow.stripeCustomerId;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({ email });
  await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, userId));
  return customer.id;
}

export async function createCheckoutSession(cartItems: CheckoutCartItemInput[]): Promise<ShopActionResult> {
  const session = await auth();
  // Konto ist für eine Bestellung Pflicht (siehe Konzept-Plan, Context) —
  // der "Bestellen"-Button bleibt für anonyme Besucher zwar sichtbar
  // (Login-Hinweis-Popover statt direktem Checkout), diese serverseitige
  // Prüfung ist aber die tatsächliche Durchsetzung, nicht die Client-UI.
  if (!session?.user?.id || !session.user.email) {
    return { success: false, error: "Bitte melde dich an, um zu bestellen." };
  }
  if (cartItems.length === 0) {
    return { success: false, error: "Der Warenkorb ist leer." };
  }
  if (cartItems.length > 100) {
    return { success: false, error: "Zu viele Positionen im Warenkorb." };
  }

  const validatedLines: ValidatedLine[] = [];
  for (const item of cartItems) {
    const result =
      item.kind === "digital_package" ? await validateDigitalPackageLine(item) : await validatePrintLine(item);
    if (typeof result === "string") {
      return { success: false, error: result };
    }
    validatedLines.push(result);
  }

  const subtotalCents = validatedLines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);

  const tiers = await db
    .select({
      id: shopDiscountTiers.id,
      thresholdCents: shopDiscountTiers.thresholdCents,
      discountPercent: shopDiscountTiers.discountPercent,
      stripeCouponId: shopDiscountTiers.stripeCouponId,
      sortOrder: shopDiscountTiers.sortOrder,
    })
    .from(shopDiscountTiers);
  const tier = resolveDiscountTier(subtotalCents, tiers);
  const discountCents = calculateDiscountCents(subtotalCents, tier);

  const hasPrintLine = validatedLines.some((line) => line.kind === "print");
  const globalSettings = await getGlobalSettings();
  const shippingCents = hasPrintLine ? Number(globalSettings.shop_print_shipping_cents ?? 0) : 0;

  const totalCents = subtotalCents - discountCents + shippingCents;

  // Order-Zeile VOR dem Stripe-Aufruf anlegen (siehe Konzept-Plan Abschnitt
  // 3) — stripeCheckoutSessionId ist bewusst nullable (schema.ts), damit die
  // Zeile schon vor Kenntnis der Session-Id existieren kann.
  const [orderRow] = await db
    .insert(orders)
    .values({
      userId: session.user.id,
      status: "pending_payment",
      subtotalCents,
      discountPercent: tier?.discountPercent ?? null,
      discountCents,
      shippingCents,
      totalCents,
    })
    .returning({ id: orders.id });

  await db.insert(orderLineItems).values(
    validatedLines.map((line) => ({
      orderId: orderRow.id,
      imageId: line.imageId,
      kind: line.kind,
      packageId: line.packageId,
      categoryId: line.categoryId,
      printFormatId: line.printFormatId,
      printQualityId: line.printQualityId,
      priceCents: line.priceCents,
      quantity: line.quantity,
      snapshotLabel: line.snapshotLabel,
    }))
  );

  // Kein Stripe-API-Call mehr hier — die Session (für das Payment Element
  // auf /checkout/[orderId]) entsteht erst dort per getCheckoutClientSecret,
  // aus genau diesen soeben committeten orderLineItems-Zeilen. Der Client
  // navigiert bei Erfolg selbst dorthin (siehe CartPageClient).
  return { success: true, id: orderRow.id };
}

/**
 * Erzeugt (bzw. bei Ablauf während des Bezahlvorgangs: erneuert) die
 * Stripe-Checkout-Session für das Payment Element auf /checkout/[orderId] —
 * für eine BEREITS bestehende "pending_payment"-Bestellung, egal ob gerade
 * frisch von createCheckoutSession angelegt oder über "Jetzt bezahlen" in
 * "Meine Bestellungen" wiederaufgenommen (beide Fälle sind identisch: eine
 * pending_payment-Bestellung, die noch eine gültige Session braucht). Baut
 * die Stripe-Positionen bewusst aus den bereits GESPEICHERTEN
 * orderLineItems-Zeilen (priceCents/snapshotLabel), nicht aus einer
 * erneuten Katalog-Auflösung — die Bestellung ist bereits committet, der
 * zu zahlende Betrag muss exakt dem entsprechen, was in "Meine
 * Bestellungen" angezeigt wird, auch wenn sich Preise im Katalog
 * zwischenzeitlich geändert haben.
 *
 * ui_mode: "elements" statt der gehosteten Stripe-Seite (siehe Stripe-
 * Best-Practices: Payment Element sollte auf einer Checkout Session
 * aufsetzen, nicht auf einem rohen PaymentIntent, damit Rabatt-Coupon/
 * Versandkosten/Adress-Erfassung weiterhin von Stripe verwaltet werden —
 * "elements" ist in der hier gepinnten API-Version 2026-07-29.dahlia der
 * aktuelle Name für das früher als ui_mode "custom" bekannte Muster, siehe
 * Session.UiMode in node_modules/stripe/esm/resources/Checkout/Sessions.d.ts)
 * — liefert ein client_secret statt einer Redirect-URL.
 */
export async function getCheckoutClientSecret(orderId: string): Promise<CheckoutClientSecretResult> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return { success: false, error: "Bitte melde dich an, um zu bezahlen." };
  }

  const [orderRow] = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      status: orders.status,
      discountPercent: orders.discountPercent,
      shippingCents: orders.shippingCents,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!orderRow || orderRow.userId !== session.user.id) {
    return { success: false, error: "Bestellung nicht gefunden." };
  }
  if (orderRow.status !== "pending_payment") {
    return { success: false, error: "Diese Bestellung wartet nicht mehr auf Zahlung." };
  }

  const lineRows = await db
    .select({
      kind: orderLineItems.kind,
      priceCents: orderLineItems.priceCents,
      quantity: orderLineItems.quantity,
      snapshotLabel: orderLineItems.snapshotLabel,
    })
    .from(orderLineItems)
    .where(eq(orderLineItems.orderId, orderId));
  if (lineRows.length === 0) {
    return { success: false, error: "Diese Bestellung enthält keine Positionen mehr." };
  }
  const hasPrintLine = lineRows.some((line) => line.kind === "print");

  let stripeCouponId: string | null = null;
  if (orderRow.discountPercent !== null) {
    const [tier] = await db
      .select({
        id: shopDiscountTiers.id,
        thresholdCents: shopDiscountTiers.thresholdCents,
        discountPercent: shopDiscountTiers.discountPercent,
        stripeCouponId: shopDiscountTiers.stripeCouponId,
        sortOrder: shopDiscountTiers.sortOrder,
      })
      .from(shopDiscountTiers)
      .where(eq(shopDiscountTiers.discountPercent, orderRow.discountPercent))
      .limit(1);
    if (tier) stripeCouponId = await ensureStripeCouponForTier(tier);
  }

  const [stripeCustomerId, baseUrl] = await Promise.all([
    ensureStripeCustomer(session.user.id, session.user.email),
    getBaseUrl(),
  ]);

  const stripe = getStripeClient();
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    ui_mode: "elements",
    customer: stripeCustomerId,
    line_items: lineRows.map((line) => ({
      price_data: {
        currency: "eur",
        unit_amount: line.priceCents,
        product_data: { name: line.snapshotLabel },
      },
      quantity: line.quantity,
    })),
    discounts: stripeCouponId ? [{ coupon: stripeCouponId }] : undefined,
    shipping_options:
      orderRow.shippingCents > 0
        ? [
            {
              shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: { amount: orderRow.shippingCents, currency: "eur" },
                display_name: "Versand",
              },
            },
          ]
        : undefined,
    shipping_address_collection: hasPrintLine ? { allowed_countries: ["AT"] } : undefined,
    metadata: { orderId: orderRow.id },
    client_reference_id: orderRow.id,
    // return_url statt success_url/cancel_url — nur für redirect-pflichtige
    // Zahlarten (z.B. giropay, 3-D-Secure-Interstitial) relevant; bei
    // Kartenzahlung ohne Redirect navigiert der Client selbst dorthin.
    return_url: `${baseUrl}/checkout/success?order=${orderRow.id}`,
    integration_identifier: `hifly-shop-checkout-${randomLetters(8)}`,
  });

  if (!checkoutSession.client_secret) {
    return { success: false, error: "Stripe hat kein Checkout-Client-Secret zurückgegeben." };
  }

  await db.update(orders).set({ stripeCheckoutSessionId: checkoutSession.id }).where(eq(orders.id, orderId));

  return { success: true, clientSecret: checkoutSession.client_secret };
}

export interface OrderStatusSummary {
  status: (typeof orders.$inferSelect)["status"];
  totalCents: number;
  lineItemCount: number;
}

/**
 * Für die Erfolgsseite (/checkout/success) — die zeigt bewusst nur den
 * AKTUELLEN Status an (ggf. noch pending_payment, falls der Webhook noch
 * nicht angekommen ist) und pollt, statt den Redirect selbst als
 * Zahlungsbeweis zu behandeln (siehe Konzept-Plan Abschnitt 3/6). Eigentum
 * wird geprüft — eine fremde Bestellungs-Id liefert null, keinen Fehler.
 */
export async function getOrderStatus(orderId: string): Promise<OrderStatusSummary | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [orderRow] = await db
    .select({ userId: orders.userId, status: orders.status, totalCents: orders.totalCents })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!orderRow || orderRow.userId !== session.user.id) return null;

  const lineItems = await db.select({ id: orderLineItems.id }).from(orderLineItems).where(eq(orderLineItems.orderId, orderId));

  return { status: orderRow.status, totalCents: orderRow.totalCents, lineItemCount: lineItems.length };
}
