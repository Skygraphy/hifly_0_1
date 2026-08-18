import { notFound, redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { CreditCard, Download, Printer } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { orders, orderLineItems, images } from "@/db/schema";
import { thumbUrlFor } from "@/lib/image-folder";
import { formatPriceCents } from "@/lib/shop";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CopyableId } from "@/components/image-preview-popup";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { CustomerNav } from "@/components/customer-nav";
import { Breadcrumb } from "@/components/breadcrumb";
import { CustomCheckoutClient } from "./custom-checkout-client";

/**
 * snapshotLabel-Kürzung wie displayLabel in OrdersListClient — lokale
 * Kopie, dortiges Original ist nicht exportiert.
 */
function displayLabel(snapshotLabel: string, kind: "digital_package" | "print"): string {
  const withoutImageSuffix = snapshotLabel.replace(/ — Bild .*$/, "");
  if (kind !== "digital_package") return withoutImageSuffix;
  const match = withoutImageSuffix.match(/^Paket „(.+)“ \(Kategorie .+\)$/);
  return match ? match[1] : withoutImageSuffix;
}

/**
 * Herkunft des Checkout-Aufrufs (Warenkorb/Meine Bestellungen/Bild-Shop) —
 * steuert Zurück-Pfeil/aktiven Nav-Punkt/Breadcrumb passend zur tatsächlich
 * durchlaufenen Seite, statt immer hart "Zurück zum Warenkorb" zu zeigen
 * (siehe plans/iridescent-hopping-wozniak.md, Abschnitt 3). Bewusst eine
 * feste Werte-Liste statt einer durchgereichten URL — `from` dient nur als
 * Lookup-Schlüssel, landet nie in einem href/redirect, kein
 * Injection-Risiko über den Query-Parameter.
 */
const CHECKOUT_ORIGINS = {
  cart: { backHref: "/cart", backLabel: "Zurück zum Warenkorb", navActive: "cart", crumbLabel: "Warenkorb" },
  orders: {
    backHref: "/orders",
    backLabel: "Zurück zu Meine Bestellungen",
    navActive: "orders",
    crumbLabel: "Meine Bestellungen",
  },
  shop: { backHref: "/images", backLabel: "Zurück zu den Bildern", navActive: "images", crumbLabel: "Bilder" },
} as const satisfies Record<
  string,
  { backHref: string; backLabel: string; navActive: "cart" | "orders" | "images"; crumbLabel: string }
>;

type CheckoutOrigin = keyof typeof CHECKOUT_ORIGINS;

function resolveCheckoutOrigin(from: string | undefined) {
  return from !== undefined && from in CHECKOUT_ORIGINS
    ? CHECKOUT_ORIGINS[from as CheckoutOrigin]
    : CHECKOUT_ORIGINS.cart; // unverändertes bisheriges Verhalten als Default
}

/**
 * Eigene, im HiFly-Design gehaltene Zahlungsseite (Payment Element) statt
 * der bisherigen Weiterleitung zu checkout.stripe.com — siehe
 * plans/stripe-custom-checkout/plan.md. Erreichbar sowohl frisch aus dem
 * Warenkorb (createCheckoutSession legt die Order an und navigiert
 * hierher) als auch über "Jetzt bezahlen" bei einer bereits bestehenden
 * pending_payment-Bestellung in "Meine Bestellungen" — beide Fälle
 * brauchen hier keine Unterscheidung, CustomCheckoutClient holt sich das
 * Stripe-client_secret in jedem Fall frisch über getCheckoutClientSecret.
 *
 * Layout an Warenkorb/Meine Bestellungen angeglichen (max-w-6xl,
 * BrandMark+CustomerNav-Zeile, dieselben Zeilen-/Badge-Bausteine für die
 * Positionen) statt einer schmalen, isoliert wirkenden Karte — auf Wunsch
 * des Users. Zweispaltig ab lg: Positionen+Summe links (füllt die Breite
 * sinnvoll statt leerem Weißraum), Zahlungsformular rechts, sticky beim
 * Scrollen einer längeren Positionsliste.
 */
export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { orderId } = await params;
  const origin = resolveCheckoutOrigin((await searchParams).from);

  const [orderRow] = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      status: orders.status,
      subtotalCents: orders.subtotalCents,
      discountPercent: orders.discountPercent,
      discountCents: orders.discountCents,
      shippingCents: orders.shippingCents,
      totalCents: orders.totalCents,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  // Fremde/unbekannte Id → 404 (kein Hinweis, ob die Id überhaupt
  // existiert), gleiche Konvention wie /shop/packages/[packageId] etc.
  if (!orderRow || orderRow.userId !== session.user.id) {
    notFound();
  }
  // Bereits bezahlt/abgelaufen/storniert: hier gibt es nichts mehr zu
  // bezahlen — weiter zur Erfolgs-/Statusseite statt eines leeren Formulars.
  if (orderRow.status !== "pending_payment") {
    redirect(`/checkout/success?order=${orderRow.id}`);
  }

  const lineItemRows = await db
    .select({
      id: orderLineItems.id,
      imageId: orderLineItems.imageId,
      kind: orderLineItems.kind,
      snapshotLabel: orderLineItems.snapshotLabel,
      priceCents: orderLineItems.priceCents,
      quantity: orderLineItems.quantity,
    })
    .from(orderLineItems)
    .where(eq(orderLineItems.orderId, orderId));

  // Kopierbare "ID" (images.hash) analog zu CartPageClient/OrdersListClient
  // — separat nachgeladen statt gejoint (siehe dortige Begründung).
  const imageIds = [...new Set(lineItemRows.map((row) => row.imageId))];
  const hashRows =
    imageIds.length > 0 ? await db.select({ id: images.id, hash: images.hash }).from(images).where(inArray(images.id, imageIds)) : [];
  const hashByImageId = new Map(hashRows.map((row) => [row.id, row.hash]));

  const lineItems = lineItemRows.map((item) => ({
    ...item,
    thumbUrl: thumbUrlFor(item.imageId),
    hash: hashByImageId.get(item.imageId) ?? item.imageId,
  }));

  return (
    <main className="relative min-h-screen bg-background p-8">
      {/* fixed statt absolute: die Positionsliste + Zahlarten können lang
          werden (siehe Screenshot-Feedback), der Zurück-Pfeil soll beim
          Scrollen sichtbar bleiben — anders als auf den übrigen, kürzeren
          Seiten mit BackLink. */}
      <BackLink href={origin.backHref} label={origin.backLabel} className="fixed" />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session.user} />
          <AccountMenu user={session.user} />
        </div>
      </AccountMenuSlot>
      <div className="mx-auto max-w-6xl">
        <div className="mt-6 flex flex-wrap items-center justify-between gap-y-2">
          <BrandMark />
          <CustomerNav active={origin.navActive} />
        </div>
        <Breadcrumb
          items={[{ label: "Start", href: "/" }, { label: origin.crumbLabel, href: origin.backHref }, { label: "Bezahlen" }]}
          className="mt-4"
        />
        <h1 className="mb-6 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <CreditCard className="size-6 text-primary" />
          Bezahlen
        </h1>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {lineItems.map((item) => (
                <div
                  key={item.id}
                  data-testid={`checkout-line-item-${item.id}`}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2"
                >
                  {/* Hover-Feedback als Hintergrund statt Text-Unterstrich —
                      dieselbe Konvention wie in CartPageClient/OrdersListClient. */}
                  <Link
                    href={`/shop/image/${item.imageId}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-colors hover:bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- fertige
                        Thumbnail-Datei aus S3, next/image bringt hier keine
                        Optimierung (Konvention wie in image-preview-popup.tsx). */}
                    <img src={item.thumbUrl} alt="" className="size-16 shrink-0 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{displayLabel(item.snapshotLabel, item.kind)}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1 shrink-0">
                          {item.kind === "digital_package" ? <Download className="size-3" /> : <Printer className="size-3" />}
                          {item.kind === "digital_package" ? "Digital" : "Druck"}
                        </Badge>
                        <CopyableId id={item.hash} size="xs" testId={`checkout-line-item-copy-id-${item.id}`} />
                        <span className="text-xs text-muted-foreground">
                          {formatPriceCents(item.priceCents)}
                          {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <p className="shrink-0 text-sm font-medium">{formatPriceCents(item.priceCents * item.quantity)}</p>
                </div>
              ))}
            </div>

            {/* Gleiche Aufschlüsselung wie in CartPageClient/OrdersListClient. */}
            <div className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Zwischensumme</span>
                <span>{formatPriceCents(orderRow.subtotalCents)}</span>
              </div>
              {orderRow.discountCents > 0 && (
                <div className="flex justify-between text-primary" data-testid="checkout-discount-row">
                  <span>Rabatt{orderRow.discountPercent !== null ? ` (${orderRow.discountPercent} %)` : ""}</span>
                  <span>−{formatPriceCents(orderRow.discountCents)}</span>
                </div>
              )}
              {orderRow.shippingCents > 0 && (
                <div className="flex justify-between" data-testid="checkout-shipping-row">
                  <span className="text-muted-foreground">Versand</span>
                  <span>{formatPriceCents(orderRow.shippingCents)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>Gesamt</span>
                <span>{formatPriceCents(orderRow.totalCents)}</span>
              </div>
            </div>
          </div>

          <Card className="lg:sticky lg:top-8">
            <CardContent className="pt-6">
              <CustomCheckoutClient orderId={orderRow.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
