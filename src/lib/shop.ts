// Gemeinsame Shop-Typen für Admin-seitige Katalog-/Zuordnungs-Verwaltung
// (Pakete, Kategorien, Preise) — geteilt zwischen Server- und
// Client-Komponenten unter src/app/admin/shop/*, analog zu
// src/lib/administrative-units.ts/src/lib/regions.ts für den Standort-Baum.

/** Einheitliche Rückgabeform aller Shop-Server-Actions (Pakete UND Drucke)
 * — bewusst hier statt in einer der beiden Produktlinien-actions.ts
 * definiert, damit keine der beiden von der anderen abhängen muss. */
export interface ShopActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

export interface ShopPackage {
  id: string;
  name: string;
  /** Vom super_admin per RichTextEditor gepflegtes HTML — Zielgruppe/Nutzung
   * des Pakets, null solange noch keine Beschreibung erfasst wurde. */
  description: string | null;
  includedFiles: string[];
  sortOrder: number;
  /** "Am beliebtesten"-Markierung — hervorgehoben auf den öffentlichen
   * Shop-Seiten (siehe shopPackages.isFeatured in src/db/schema.ts). */
  isFeatured: boolean;
}

export interface ShopPackageCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface ShopPackagePrice {
  packageId: string;
  categoryId: string;
  priceCents: number;
}

// Zweite Produktlinie (physische Ausdrucke) — Struktur-Spiegel der Typen
// oben, siehe Kommentar bei den entsprechenden Tabellen in src/db/schema.ts.
export interface ShopPrintFormat {
  id: string;
  name: string;
  description: string | null;
  widthCm: number;
  heightCm: number;
  sortOrder: number;
  /** "Am beliebtesten"-Markierung — hervorgehoben auf den öffentlichen
   * Shop-Seiten (siehe shopPrintFormats.isFeatured in src/db/schema.ts). */
  isFeatured: boolean;
}

export interface ShopPrintQuality {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface ShopPrintFormatPrice {
  printFormatId: string;
  printQualityId: string;
  priceCents: number;
}

/** Cent-Betrag als lokalisierter Euro-String, für Anzeige/Tabellen. */
export function formatPriceCents(cents: number): string {
  return (cents / 100).toLocaleString("de-AT", { style: "currency", currency: "EUR" });
}

// TipTap liefert bei leerem Inhalt "<p></p>" statt eines echten Leerstrings
// — ohne diese Normalisierung würde eine Katalog-Zeile ein leeres, aber
// technisch vorhandenes description-HTML rendern statt des "Keine
// Beschreibung"-Hinweistexts. Gemeinsam genutzt von den Server Actions für
// Pakete, Druckformate UND Druckqualitäten (src/app/admin/shop/actions.ts,
// src/app/admin/shop/prints/actions.ts).
export function normalizeRichTextDescription(description: string | null): string | null {
  const stripped = (description ?? "").replace(/<[^>]*>/g, "").trim();
  return stripped ? description : null;
}
