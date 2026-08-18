"use server";

// Download-Freischaltung für digitale Pakete — kein Dauerlink, sondern
// On-Demand-Generierung bei jedem Aufruf (siehe Konzept-Plan Abschnitt 4).
// Der Autorisierungscheck (order.userId === session.user.id, status
// "paid") passiert HIER beim Ausstellen der presigned URL, nicht erst beim
// tatsächlichen Download — eine ausgestellte URL ist für ihre kurze
// Gültigkeitsdauer ein Bearer-Token.

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { orders, orderLineItems, shopPackages } from "@/db/schema";
import { s3KeyFor } from "@/lib/image-folder";
import { createPresignedGetUrl } from "@/lib/s3";

export interface DownloadFile {
  filename: string;
  url: string;
}

export interface DownloadUrlsResult {
  success: boolean;
  error?: string;
  files?: DownloadFile[];
}

export async function requestDownloadUrls(orderLineItemId: string): Promise<DownloadUrlsResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: "Nicht angemeldet." };

  const [lineItem] = await db
    .select({
      orderId: orderLineItems.orderId,
      imageId: orderLineItems.imageId,
      kind: orderLineItems.kind,
      packageId: orderLineItems.packageId,
    })
    .from(orderLineItems)
    .where(eq(orderLineItems.id, orderLineItemId))
    .limit(1);
  if (!lineItem || lineItem.kind !== "digital_package" || !lineItem.packageId) {
    return { success: false, error: "Für diese Position gibt es keinen Download." };
  }

  const [orderRow] = await db.select({ userId: orders.userId, status: orders.status }).from(orders).where(eq(orders.id, lineItem.orderId)).limit(1);
  if (!orderRow || orderRow.userId !== session.user.id) {
    return { success: false, error: "Nicht berechtigt." };
  }
  if (orderRow.status !== "paid") {
    return { success: false, error: "Diese Bestellung ist noch nicht bezahlt." };
  }

  const [packageRow] = await db.select({ includedFiles: shopPackages.includedFiles }).from(shopPackages).where(eq(shopPackages.id, lineItem.packageId)).limit(1);
  if (!packageRow || packageRow.includedFiles.length === 0) {
    return { success: false, error: "Für dieses Paket sind keine Dateien hinterlegt." };
  }

  const files = await Promise.all(
    packageRow.includedFiles.map(async (filename) => ({
      filename,
      url: await createPresignedGetUrl(s3KeyFor(lineItem.imageId, filename)),
    }))
  );

  return { success: true, files };
}
