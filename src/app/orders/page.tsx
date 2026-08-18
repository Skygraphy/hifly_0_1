import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { PackageOpen } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { orders, orderLineItems, images } from "@/db/schema";
import { thumbUrlFor } from "@/lib/image-folder";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { CustomerNav } from "@/components/customer-nav";
import { Breadcrumb } from "@/components/breadcrumb";
import { OrdersListClient } from "./orders-list-client";

export default async function OrdersPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const orderRows = await db
    .select({
      id: orders.id,
      status: orders.status,
      subtotalCents: orders.subtotalCents,
      discountPercent: orders.discountPercent,
      discountCents: orders.discountCents,
      shippingCents: orders.shippingCents,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
      shippingAddress: orders.shippingAddress,
    })
    .from(orders)
    .where(eq(orders.userId, session.user.id))
    .orderBy(desc(orders.createdAt));

  const orderIds = orderRows.map((row) => row.id);
  const lineItemRows =
    orderIds.length > 0
      ? await db
          .select({
            id: orderLineItems.id,
            orderId: orderLineItems.orderId,
            imageId: orderLineItems.imageId,
            kind: orderLineItems.kind,
            priceCents: orderLineItems.priceCents,
            quantity: orderLineItems.quantity,
            snapshotLabel: orderLineItems.snapshotLabel,
            fulfillmentStatus: orderLineItems.fulfillmentStatus,
            fulfilledAt: orderLineItems.fulfilledAt,
          })
          .from(orderLineItems)
          .where(inArray(orderLineItems.orderId, orderIds))
      : [];

  const lineItemsByOrderId = new Map<string, typeof lineItemRows>();
  for (const row of lineItemRows) {
    const list = lineItemsByOrderId.get(row.orderId) ?? [];
    list.push(row);
    lineItemsByOrderId.set(row.orderId, list);
  }

  // Kopierbare "ID" (images.hash) analog zu CartPageClient — separat
  // nachgeladen statt gejoint, da orderLineItems.imageId nicht per FK an
  // images gebunden ist (Bestellungen bleiben auch nach einer Bild-Löschung
  // als Beleg erhalten, siehe schema.ts).
  const imageIds = [...new Set(lineItemRows.map((row) => row.imageId))];
  const hashRows = imageIds.length > 0 ? await db.select({ id: images.id, hash: images.hash }).from(images).where(inArray(images.id, imageIds)) : [];
  const hashByImageId = new Map(hashRows.map((row) => [row.id, row.hash]));

  const ordersWithItems = orderRows.map((order) => ({
    ...order,
    lineItems: (lineItemsByOrderId.get(order.id) ?? []).map((item) => ({
      ...item,
      thumbUrl: thumbUrlFor(item.imageId),
      hash: hashByImageId.get(item.imageId) ?? item.imageId,
    })),
  }));

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href="/images" label="Zurück zu den Bildern" />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session.user} />
          <AccountMenu user={session.user} />
        </div>
      </AccountMenuSlot>
      <div className="mx-auto max-w-6xl">
        <div className="mt-6 flex flex-wrap items-center justify-between gap-y-2">
          <BrandMark />
          <CustomerNav active="orders" />
        </div>
        <Breadcrumb items={[{ label: "Start", href: "/" }, { label: "Meine Bestellungen" }]} className="mt-4" />
        <h1 className="mb-6 mt-4 flex items-center gap-2 text-2xl font-semibold">
          <PackageOpen className="size-6 text-primary" />
          Meine Bestellungen
        </h1>
        <OrdersListClient orders={ordersWithItems} />
      </div>
    </main>
  );
}
