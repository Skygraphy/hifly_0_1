// Bestell-Bestätigungsmail nach erfolgreicher Zahlung (siehe Konzept-Plan
// Abschnitt 10) — wird vom Webhook NUR beim tatsächlichen Wechsel
// pending_payment -> paid ausgelöst (nicht bei jeder Webhook-Zustellung,
// siehe src/app/api/stripe/webhook/route.ts), schluckt eigene Fehler
// INTERN statt sie zu werfen: ein E-Mail-Fehler darf die
// Zahlungsverarbeitung nie blockieren oder rückgängig machen.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderLineItems, users } from "@/db/schema";
import { formatPriceCents } from "@/lib/shop";
import { sendEmail } from "@/lib/ses";
import { getBaseUrl } from "@/lib/base-url";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendOrderConfirmationEmail(orderId: string): Promise<void> {
  try {
    const [order] = await db
      .select({
        userId: orders.userId,
        subtotalCents: orders.subtotalCents,
        discountPercent: orders.discountPercent,
        discountCents: orders.discountCents,
        shippingCents: orders.shippingCents,
        totalCents: orders.totalCents,
        shippingAddress: orders.shippingAddress,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) return;

    const [userRow] = await db.select({ email: users.email }).from(users).where(eq(users.id, order.userId)).limit(1);
    if (!userRow) return;

    const lineItems = await db
      .select({ snapshotLabel: orderLineItems.snapshotLabel, priceCents: orderLineItems.priceCents, quantity: orderLineItems.quantity })
      .from(orderLineItems)
      .where(eq(orderLineItems.orderId, orderId));

    const baseUrl = await getBaseUrl();
    const orderUrl = `${baseUrl}/orders`;

    const lineItemsHtml = lineItems
      .map(
        (item) =>
          `<li>${escapeHtml(item.snapshotLabel)}${item.quantity > 1 ? ` × ${item.quantity}` : ""} — ${formatPriceCents(item.priceCents * item.quantity)}</li>`
      )
      .join("");
    const lineItemsText = lineItems
      .map((item) => `- ${item.snapshotLabel}${item.quantity > 1 ? ` × ${item.quantity}` : ""} — ${formatPriceCents(item.priceCents * item.quantity)}`)
      .join("\n");

    const address = order.shippingAddress;
    const addressHtml = address
      ? `<p>Lieferadresse:<br>${escapeHtml(address.name ?? "")}<br>${escapeHtml(address.line1)}${address.line2 ? `, ${escapeHtml(address.line2)}` : ""}<br>${escapeHtml(address.postalCode)} ${escapeHtml(address.city)}, ${escapeHtml(address.country)}</p>`
      : "";
    const addressText = address
      ? `\nLieferadresse:\n${address.name ?? ""}\n${address.line1}${address.line2 ? `, ${address.line2}` : ""}\n${address.postalCode} ${address.city}, ${address.country}\n`
      : "";

    const discountLineHtml = order.discountPercent ? `Rabatt (${order.discountPercent}%): −${formatPriceCents(order.discountCents)}<br>` : "";
    const shippingLineHtml = order.shippingCents > 0 ? `Versand: ${formatPriceCents(order.shippingCents)}<br>` : "";
    const discountLineText = order.discountPercent ? `Rabatt (${order.discountPercent}%): -${formatPriceCents(order.discountCents)}\n` : "";
    const shippingLineText = order.shippingCents > 0 ? `Versand: ${formatPriceCents(order.shippingCents)}\n` : "";

    const html = `
      <p>Vielen Dank für deine Bestellung bei HiFly!</p>
      <ul>${lineItemsHtml}</ul>
      <p>
        Zwischensumme: ${formatPriceCents(order.subtotalCents)}<br>
        ${discountLineHtml}${shippingLineHtml}
        <strong>Gesamt: ${formatPriceCents(order.totalCents)}</strong>
      </p>
      ${addressHtml}
      <p><a href="${orderUrl}">Zu meinen Bestellungen</a></p>
    `;
    const text = `Vielen Dank für deine Bestellung bei HiFly!\n\n${lineItemsText}\n\nZwischensumme: ${formatPriceCents(order.subtotalCents)}\n${discountLineText}${shippingLineText}Gesamt: ${formatPriceCents(order.totalCents)}\n${addressText}\nZu deinen Bestellungen: ${orderUrl}`;

    await sendEmail({ to: userRow.email, subject: "Deine Bestellung bei HiFly", html, text });
  } catch (err) {
    console.error("Bestell-Bestätigungsmail fehlgeschlagen:", err);
  }
}
