import { redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Truck } from "lucide-react";
import { auth } from "@/auth";
import { canManageOrders } from "@/lib/authorization";
import { db } from "@/db";
import { orders, orderLineItems, users, images } from "@/db/schema";
import { thumbUrlFor } from "@/lib/image-folder";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { Breadcrumb } from "@/components/breadcrumb";
import { OrderFulfillmentManager } from "./order-fulfillment-manager";

type FulfillmentTab = "open" | "shipped" | "all";

/**
 * Fulfillment-Warteschlange für Drucke (siehe Konzept-Plan Abschnitt 11) —
 * nur bezahlte Bestellungen mit mindestens einer Druck-Position, digitale
 * Positionen tauchen hier gar nicht auf (kein manueller Schritt nötig).
 * "Offen" ist die Standardansicht (älteste zuerst = Warteschlange).
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!canManageOrders(session.user.role)) {
    redirect("/?error=forbidden");
  }

  const { tab: rawTab } = await searchParams;
  const tab: FulfillmentTab = rawTab === "shipped" || rawTab === "all" ? rawTab : "open";

  const conditions = [eq(orderLineItems.kind, "print"), eq(orders.status, "paid")];
  if (tab === "open") conditions.push(eq(orderLineItems.fulfillmentStatus, "pending"));
  if (tab === "shipped") conditions.push(eq(orderLineItems.fulfillmentStatus, "fulfilled"));

  const rows = await db
    .select({
      lineItemId: orderLineItems.id,
      orderId: orders.id,
      imageId: orderLineItems.imageId,
      snapshotLabel: orderLineItems.snapshotLabel,
      quantity: orderLineItems.quantity,
      fulfillmentStatus: orderLineItems.fulfillmentStatus,
      fulfilledAt: orderLineItems.fulfilledAt,
      paidAt: orders.paidAt,
      shippingAddress: orders.shippingAddress,
      customerName: users.name,
      customerEmail: users.email,
    })
    .from(orderLineItems)
    .innerJoin(orders, eq(orderLineItems.orderId, orders.id))
    .innerJoin(users, eq(orders.userId, users.id))
    .where(and(...conditions))
    .orderBy(asc(orders.paidAt));

  // Kopierbare "ID" (images.hash) analog zu CartPageClient/OrdersListClient
  // — separat nachgeladen statt gejoint, da orderLineItems.imageId nicht per
  // FK an images gebunden ist (Bestellungen bleiben auch nach einer
  // Bild-Löschung als Beleg erhalten, siehe schema.ts).
  const imageIds = [...new Set(rows.map((row) => row.imageId))];
  const hashRows = imageIds.length > 0 ? await db.select({ id: images.id, hash: images.hash }).from(images).where(inArray(images.id, imageIds)) : [];
  const hashByImageId = new Map(hashRows.map((row) => [row.id, row.hash]));

  const ordersMap = new Map<
    string,
    {
      orderId: string;
      paidAt: Date | null;
      customerName: string | null;
      customerEmail: string;
      shippingAddress: (typeof rows)[number]["shippingAddress"];
      lineItems: { lineItemId: string; imageId: string; hash: string; thumbUrl: string; snapshotLabel: string; quantity: number; fulfillmentStatus: string; fulfilledAt: Date | null }[];
    }
  >();
  for (const row of rows) {
    const existing = ordersMap.get(row.orderId) ?? {
      orderId: row.orderId,
      paidAt: row.paidAt,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      shippingAddress: row.shippingAddress,
      lineItems: [],
    };
    existing.lineItems.push({
      lineItemId: row.lineItemId,
      imageId: row.imageId,
      hash: hashByImageId.get(row.imageId) ?? row.imageId,
      thumbUrl: thumbUrlFor(row.imageId),
      snapshotLabel: row.snapshotLabel,
      quantity: row.quantity,
      fulfillmentStatus: row.fulfillmentStatus,
      fulfilledAt: row.fulfilledAt,
    });
    ordersMap.set(row.orderId, existing);
  }

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/admin" label="Zurück zum Admin-Bereich" />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session.user} />
          <AccountMenu user={session.user} />
        </div>
      </AccountMenuSlot>
      <div className="mx-auto max-w-6xl">
        <div className="mt-6">
          <BrandMark />
        </div>
        <Breadcrumb items={[{ label: "Admin", href: "/admin" }, { label: "Druck-Fulfillment" }]} className="mt-4" />
        <h1 className="mb-6 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <Truck className="size-6 text-primary" />
          Druck-Fulfillment
        </h1>
        <OrderFulfillmentManager tab={tab} orders={Array.from(ordersMap.values())} />
      </div>
    </main>
  );
}
