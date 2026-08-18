import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { images } from "@/db/schema";
import { getPurchasableProductsForImage } from "@/app/shop/actions";
import { thumbUrlFor, previewUrlFor } from "@/lib/image-folder";
import { SanitizedHtml } from "@/components/sanitized-html";
import { BrandMark } from "@/components/brand-mark";
import { AccountMenuSlot } from "@/components/account-menu-slot";
import { AccountMenu } from "@/components/account-menu";
import { DisplaySettingsMenu } from "@/components/display-settings-menu";
import { BackLink } from "@/components/back-link";
import { CustomerNav } from "@/components/customer-nav";
import { Breadcrumb } from "@/components/breadcrumb";
import { CopyableId } from "@/components/image-preview-popup";
import { ImageShopClient } from "./image-shop-client";

const DESCRIPTION_CLASS =
  "text-xs text-muted-foreground [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:italic [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-xs [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5";

/**
 * Next.js/Turbopack liefert `params` bei diesem Dynamic-Segment im Dev-
 * Server beobachtet inkonsistent — manchmal bereits dekodiert ("Agnesstraße"),
 * manchmal noch roh percent-encodiert ("Agnesstra%C3%9Fe"), je nach
 * Kompilierungszustand. Bild-Ids aus Ordnernamen enthalten nie ein
 * literales "%", daher ist ein zweites decodeURIComponent hier sicher —
 * ohne das würde die images.id-Abfrage unten für jeden Ordnernamen mit
 * Nicht-ASCII-Zeichen (Umlaute, ß, …) zufällig fehlschlagen (notFound()).
 */
function decodeImageId(raw: string): string {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const STATIC_IMAGE_ORIGINS = {
  images: { backHref: "/images", backLabel: "Zurück zu den Bildern", crumbLabel: "Bilder", navActive: "shop" },
  orders: {
    backHref: "/orders",
    backLabel: "Zurück zu Meine Bestellungen",
    crumbLabel: "Meine Bestellungen",
    navActive: "orders",
  },
  cart: { backHref: "/cart", backLabel: "Zurück zum Warenkorb", crumbLabel: "Warenkorb", navActive: "cart" },
} as const satisfies Record<
  string,
  { backHref: string; backLabel: string; crumbLabel: string; navActive: "shop" | "orders" | "cart" }
>;

/**
 * Wie CHECKOUT_ORIGINS/resolveCheckoutOrigin (checkout/[orderId]/page.tsx)
 * — `from` bleibt reiner Lookup-Schlüssel gegen eine feste Liste, kein
 * Passthrough. Einzige Ausnahme: die Checkout-Herkunft braucht zusätzlich
 * die konkrete `orderId` (aus `order`), da /checkout/[orderId] anders als
 * /orders oder /cart keine feste, listenartige URL hat — dieselbe
 * Vertrauensstufe wie jeder andere Order-Id-Routenparameter (Eigentümer-
 * Check passiert ohnehin serverseitig auf der Zielseite selbst).
 */
function resolveImageOrigin(from: string | undefined, orderId: string | undefined) {
  if (from === "checkout" && orderId) {
    return {
      backHref: `/checkout/${orderId}`,
      backLabel: "Zurück zur Bezahlung",
      crumbLabel: "Bezahlen",
      navActive: undefined,
    };
  }
  return from !== undefined && from in STATIC_IMAGE_ORIGINS
    ? STATIC_IMAGE_ORIGINS[from as keyof typeof STATIC_IMAGE_ORIGINS]
    : STATIC_IMAGE_ORIGINS.images; // unverändertes bisheriges Verhalten als Default
}

export default async function ShopImagePage({
  params,
  searchParams,
}: {
  params: Promise<{ imageId: string }>;
  searchParams: Promise<{ from?: string; order?: string }>;
}) {
  const { imageId: rawImageId } = await params;
  const imageId = decodeImageId(rawImageId);
  const { from, order } = await searchParams;
  const origin = resolveImageOrigin(from, order);
  const [session, imageRow, products] = await Promise.all([
    auth(),
    db
      .select({ id: images.id, hash: images.hash, mainLocation: images.mainLocation })
      .from(images)
      .where(eq(images.id, imageId))
      .limit(1)
      .then((rows) => rows[0]),
    getPurchasableProductsForImage(imageId),
  ]);
  if (!imageRow) notFound();

  const packages = products.packages.map((pkg) => ({
    packageId: pkg.packageId,
    packageName: pkg.packageName,
    priceCents: pkg.priceCents,
    isFeatured: pkg.isFeatured,
    descriptionNode: pkg.packageDescription ? (
      <SanitizedHtml html={pkg.packageDescription} className={DESCRIPTION_CLASS} />
    ) : null,
  }));

  // PurchasablePrintOption ist pro Qualität eine eigene Zeile (siehe
  // resolvePrints in src/app/shop/actions.ts) — hier zu einer Karte pro
  // Druckformat gruppiert, die Qualität ist die eigentliche Auswahl
  // innerhalb der Karte (siehe ImageShopClient).
  const formatOrder: string[] = [];
  const formatGroups = new Map<
    string,
    {
      printFormatId: string;
      printFormatName: string;
      widthCm: number;
      heightCm: number;
      description: string | null;
      isFeatured: boolean;
      qualities: { printQualityId: string; printQualityName: string; priceCents: number }[];
    }
  >();
  for (const print of products.prints) {
    let group = formatGroups.get(print.printFormatId);
    if (!group) {
      group = {
        printFormatId: print.printFormatId,
        printFormatName: print.printFormatName,
        widthCm: print.widthCm,
        heightCm: print.heightCm,
        description: print.printFormatDescription,
        isFeatured: print.isFeatured,
        qualities: [],
      };
      formatGroups.set(print.printFormatId, group);
      formatOrder.push(print.printFormatId);
    }
    group.qualities.push({
      printQualityId: print.printQualityId,
      printQualityName: print.printQualityName,
      priceCents: print.priceCents,
    });
  }
  const prints = formatOrder.map((id) => {
    const group = formatGroups.get(id)!;
    return {
      printFormatId: group.printFormatId,
      printFormatName: group.printFormatName,
      widthCm: group.widthCm,
      heightCm: group.heightCm,
      isFeatured: group.isFeatured,
      descriptionNode: group.description ? (
        <SanitizedHtml html={group.description} className={DESCRIPTION_CLASS} />
      ) : null,
      qualities: group.qualities,
    };
  });

  return (
    <main className="relative min-h-screen bg-background p-8">
      <BackLink href={origin.backHref} label={origin.backLabel} />
      <AccountMenuSlot>
        <div className="flex items-center gap-2">
          <DisplaySettingsMenu user={session?.user ?? null} />
          <AccountMenu user={session?.user ?? null} />
        </div>
      </AccountMenuSlot>
      <div className="mx-auto max-w-6xl">
        <div className="mt-6 flex flex-wrap items-center justify-between gap-y-2">
          <BrandMark />
          <CustomerNav active={origin.navActive} />
        </div>
        <Breadcrumb
          items={[
            { label: "Start", href: "/" },
            { label: origin.crumbLabel, href: origin.backHref },
            { label: imageRow.mainLocation ?? "Bild" },
          ]}
          className="mt-4"
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{imageRow.mainLocation ?? "Bild"}</h1>
          <CopyableId id={imageRow.hash} size="sm" testId="shop-image-copy-id" />
        </div>

        <ImageShopClient
          imageId={imageRow.id}
          hash={imageRow.hash}
          thumbUrl={thumbUrlFor(imageRow.id)}
          previewUrl={previewUrlFor(imageRow.id)}
          isLoggedIn={Boolean(session?.user?.id)}
          packages={packages}
          prints={prints}
        />
      </div>
    </main>
  );
}
