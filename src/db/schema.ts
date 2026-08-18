import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  date,
  doublePrecision,
  primaryKey,
  uniqueIndex,
  index,
  uuid,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

export const roleEnum = pgEnum("role", ["user", "admin", "super_admin"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
    role: roleEnum("role").notNull().default("user"),
    isBlocked: boolean("is_blocked").notNull().default(false),
    passwordHash: text("password_hash"),
    // Nullable, erst ab dem ersten Checkout gesetzt (siehe
    // src/app/checkout/actions.ts) — Stripe selbst besitzt den Customer-
    // Datensatz (Adresse/Zahlungsmittel-Autofill via Stripe Link), wir
    // speichern nur den Zeiger, siehe Konzept-Plan Abschnitt 2/5.
    stripeCustomerId: text("stripe_customer_id").unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // Harte DB-seitige Garantie: es kann höchstens eine Zeile mit role = 'super_admin' geben.
    uniqueIndex("users_one_super_admin_idx")
      .on(table.role)
      .where(sql`${table.role} = 'super_admin'`),
  ]
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationTokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })]
);

// Konto-gebundene Settings (Tier "Konto"): ein User setzt Werte für sich
// selbst, welche Keys sichtbar sind hängt von der Rolle ab (siehe
// src/lib/settings-registry.ts). JSONB statt Spalte pro Einstellung, damit
// neue Settings ohne Migration ergänzt werden können.
export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })]
);

// Rein globale Settings (Tier "App"): nur der super_admin darf schreiben,
// wirken sitezweit auch für anonyme Besucher (z.B. Wartungsmodus).
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const administrativeLevelEnum = pgEnum("administrative_level", [
  "federal",
  "state",
  "district",
  "municipality",
  "cadastral_municipality",
  "area",
]);

// Verwaltungsgliederung Österreichs (Bund -> Bundesland -> Bezirk -> Gemeinde
// -> Katastralgemeinde -> Gebiet), self-referencing über parent_id. code ist
// nur innerhalb seines Elternknotens eindeutig (nicht global) — Gebiets-
// Buchstaben wie "A" wiederholen sich potenziell unter anderen Gemeinden.
//
// published: nicht freigegebene Einheiten UND ihr gesamter Unterbaum sind
// öffentlich unsichtbar (siehe filterPublishedUnits in
// src/lib/administrative-units.ts) — man kann im Picker ja ohnehin nicht an
// einer nicht freigegebenen Einheit vorbeiklicken. Die Bund-Ebene (der
// einzige Wurzelknoten "Österreich") ist von dieser Pflicht ausgenommen,
// sonst wäre die komplette öffentliche Seite leer — sowohl serverseitig
// (actions.ts) als auch per CHECK-Constraint erzwungen.
export const administrativeUnits = pgTable(
  "administrative_units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id").references((): AnyPgColumn => administrativeUnits.id, {
      onDelete: "cascade",
    }),
    level: administrativeLevelEnum("level").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name"),
    color: text("color"),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("administrative_units_parent_code_idx").on(table.parentId, table.code),
    check(
      "administrative_units_federal_published_check",
      sql`${table.level} <> 'federal' OR ${table.published} = true`
    ),
  ]
);

// Benannte Regionen, die quer zur Verwaltungsgliederung liegen (z.B. "Hohe
// Tauern" über Salzburg/Tirol/Kärnten hinweg, "Wachau" über mehrere Bezirke
// in Niederösterreich) — bewusst NICHT in den administrative_units-Baum
// gezwängt (dort hat jede Zeile genau einen Parent), sondern eigene Tabelle
// + separate m:n-Verknüpfung über regionAdministrativeUnits. name ist
// (anders als administrative_units.code) GLOBAL eindeutig — Regionen sind
// eine kleine, kuratierte, admin-gepflegte Liste ohne Parent-Scope.
//
// parentId/homeLevel: die Spalte/Ebene, in der die Region admin-seitig
// angelegt wurde — bleibt ab dann UNVERÄNDERLICH (kein UI zum Ändern). Eine
// Region ganz ohne Verknüpfung kann es nicht geben (Anlegen/Bearbeiten
// verlangt serverseitig mindestens eine Einheit, siehe region-actions.ts) —
// parentId/homeLevel legen nur fest, in welcher Spalte sie als Gegend-Zeile
// dauerhaft sichtbar bleibt, unabhängig davon, mit welchen Einheiten sie
// aktuell verknüpft ist. Im Gegensatz dazu wird die öffentliche Anzeige/
// Auswahl weiterhin rein aus den tatsächlichen Verknüpfungen berechnet
// (siehe groupRegionsByParent in src/lib/regions.ts). parentId NULL
// bedeutet: Bund-Ebene (Geschwister von "Österreich" selbst).
export const regions = pgTable(
  "regions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id").references((): AnyPgColumn => administrativeUnits.id, {
      onDelete: "set null",
    }),
    homeLevel: administrativeLevelEnum("home_level").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color"),
    // Entwurf (false) bis der super_admin sie bewusst freigibt — nur dann
    // erscheint sie im öffentlichen Standort-Picker/Deep-Link, siehe
    // getStandortPickerData/[unitId]/page.tsx. Im Admin-Bereich bleibt eine
    // unveröffentlichte Region wie jede andere sicht- und editierbar.
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("regions_name_idx").on(table.name)]
);

// m:n zwischen Regionen und Verwaltungseinheiten: eine Region kann mehrere
// Einheiten umfassen UND (im Prinzip) eine Einheit zu mehreren Regionen
// gehören — daher eine echte Join-Tabelle statt einer FK-Spalte auf einer
// der beiden Seiten. Composite PK wie bei userSettings, kein zusätzlicher
// surrogate key nötig.
export const regionAdministrativeUnits = pgTable(
  "region_administrative_units",
  {
    regionId: uuid("region_id")
      .notNull()
      .references(() => regions.id, { onDelete: "cascade" }),
    administrativeUnitId: uuid("administrative_unit_id")
      .notNull()
      .references(() => administrativeUnits.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.regionId, table.administrativeUnitId] })]
);

// Ein Eintrag pro hochgeladenem Bild-Ordner (nicht pro Einzeldatei — ein
// Ordner enthält mehrere Auflösungsvarianten desselben Fotos, siehe
// src/lib/image-folder.ts). id ist bewusst der vollständige Ordnername
// selbst (nicht generiert), da er bereits eindeutig ist und 1:1 dem
// S3-Präfix entspricht (s3KeyFor). administrativeUnitId/regionId mirrored
// an StandortRef (src/lib/standort.ts) — zwei nullable FKs statt eines
// polymorphen Felds, damit Postgres die Referenz echt erzwingen kann.
// onDelete "restrict" bewusst strenger als bei regions/regionAdministrative-
// Units: ein Standort mit bereits hochgeladenen Bildern darf nicht
// versehentlich mitgelöscht werden, die Bilder würden sonst verwaisen.
// Ein Tag zusammen mit seinem Ersteller — addedBy ist null für Alt-Tags aus
// der Migration von text[] auf jsonb (echter Ersteller nicht bekannt, wird
// NICHT auf uploadedBy geraten). Siehe canManageUserTag in
// src/lib/authorization.ts für die daraus abgeleiteten Rechte.
export interface UserTagEntry {
  tag: string;
  addedBy: string | null;
}

export const images = pgTable(
  "images",
  {
    id: text("id").primaryKey(),
    address: text("address").notNull(),
    captureDate: date("capture_date").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    // 6-stelliger Hash AUS DEM ORDNERNAMEN (Namensbestandteil) — nicht zu
    // verwechseln mit dem Content-MD5, der nur für den Upload-Abgleich mit
    // S3 verwendet und nicht persistiert wird (siehe api/images/prepare-upload).
    hash: text("hash").notNull(),
    uuid: uuid("uuid").notNull().unique(),
    administrativeUnitId: uuid("administrative_unit_id").references(() => administrativeUnits.id, {
      onDelete: "restrict",
    }),
    regionId: uuid("region_id").references(() => regions.id, { onDelete: "restrict" }),
    // Ab hier: zusätzliche Metadaten aus dem "Abgleich" mit einer externen
    // Datendatei (z.B. image_data/klosterneuburg_stadt.json, siehe
    // prepareImageMatch/applyImageMatchEntry in src/app/admin/images/actions.ts) — bewusst alle
    // nullable ohne Default, da bereits hochgeladene Bilder diese Werte
    // erst beim nächsten Abgleich bekommen, nicht beim Upload selbst.
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    mainLocation: text("main_location"),
    secondaryLocations: text("secondary_locations").array(),
    tags: text("tags").array(),
    // Vorher text[]; jetzt jsonb mit Ersteller pro Tag (siehe UserTagEntry
    // oben) — nötig für die Owner-only-Berechtigung auf Tag-Ebene
    // (canManageUserTag). Migration konvertiert bestehende Werte, siehe
    // drizzle/-Ordner.
    userTags: jsonb("user_tags").$type<UserTagEntry[]>(),
    webVisible: boolean("web_visible"),
    webRanking: integer("web_ranking"),
    printVisible: boolean("print_visible"),
    printRanking: integer("print_ranking"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "images_standort_check",
      sql`(${table.administrativeUnitId} IS NULL) <> (${table.regionId} IS NULL)`
    ),
    // hash dient Usern als eindeutige Kennung zum Identifizieren/Bestellen
    // eines Bilds (siehe ImageSearchRow.hash) — DB-seitig erzwungen, statt
    // sich nur auf die Eindeutigkeit des Ordnernamens beim Upload zu
    // verlassen.
    uniqueIndex("images_hash_idx").on(table.hash),
  ]
);

// Echte m:n-Beziehung (ein Bild kann von vielen Usern favorisiert sein,
// unabhängig vom Bild selbst) — anders als user_tags daher KEINE jsonb-
// Spalte auf images, sondern eine eigene Zwischentabelle, gleiches Muster
// wie regionAdministrativeUnits/userSettings (Composite PK statt
// zusätzlichem surrogate key + uniqueIndex — erzwingt "ein Favorit pro
// User pro Bild" bereits über den Primärschlüssel selbst). onDelete
// "cascade" an beiden FKs: ein gelöschter User/Bild räumt seine
// Favoriten-Zeilen automatisch mit auf, kein manuelles Aufräumen in
// deleteImage/deleteImages nötig.
export const imageFavorites = pgTable(
  "image_favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    imageId: text("image_id")
      .notNull()
      .references(() => images.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.imageId] })]
);

// Legt fest, welche konkreten Verwaltungseinheiten/Regionen ein bestimmter
// admin beim Bild-Upload zuweisen darf — kuratiert vom super_admin (siehe
// src/app/admin/users/actions.ts). Bewusst EXAKTE Freigaben ohne
// Kaskadierung auf Unterebenen (anders als das published-Flag): eine
// Freigabe auf "Niederösterreich" gilt nicht automatisch auch für Bezirke
// darunter. super_admin selbst braucht keine Einträge hier (uneingeschränkt,
// siehe canUploadImages/getAssignableLocations).
// Shop-Pakete (Bundles fixer Dateivarianten, z.B. "Web" =
// medium.jpg+small.jpg) — Preis liegt NICHT hier, sondern in
// shopPackagePrices (pro Paket × Kategorie, siehe dort). includedFiles
// ist die konfigurierbare Liste der im Paket enthaltenen Dateivarianten
// (freie Textliste statt eines eigenen Katalogs — die tatsächlichen
// Varianten-Dateinamen sind heute noch keine feste, code-geprüfte
// Konvention, siehe thumbUrlFor/previewUrlFor in image-folder.ts).
// description ist vom super_admin per Rich-Text-Editor gepflegtes HTML
// (siehe RichTextEditor/PackageFormDialog) — erklärt Zielgruppe/Nutzung des
// Pakets, nullable (Neuanlage startet ohne Beschreibung).
export const shopPackages = pgTable(
  "shop_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    includedFiles: text("included_files").array().notNull().default(sql`'{}'::text[]`),
    sortOrder: integer("sort_order").notNull().default(0),
    // Vom super_admin gesetzte "Am beliebtesten"-Markierung (siehe
    // ShopCatalogManager) — hervorgehoben auf den öffentlichen
    // Shop-Seiten (/shop, /shop/packages/[id], /shop/image/[id]). Rein
    // redaktionell, kein abgeleiteter Wert (z.B. aus Bestellhäufigkeit).
    isFeatured: boolean("is_featured").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("shop_packages_name_idx").on(table.name)]
);

// Globale Kategorien (z.B. A..E) — gemeinsam für alle Pakete, jedes Paket
// bepreist sie unabhängig (siehe shopPackagePrices).
export const shopPackageCategories = pgTable(
  "shop_package_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("shop_package_categories_name_idx").on(table.name)]
);

// Preis pro (Paket, Kategorie) — genau eine Zeile pro Kombination.
export const shopPackagePrices = pgTable(
  "shop_package_prices",
  {
    packageId: uuid("package_id")
      .notNull()
      .references(() => shopPackages.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => shopPackageCategories.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.packageId, table.categoryId] })]
);

// Standort-Ebene Paket-Zuordnung: welches Paket ist ab welcher Kategorie für
// eine Verwaltungseinheit/Region verfügbar. Fehlt eine Zeile für (Standort,
// Paket), ist das Paket dort nicht verfügbar. Gleiches XOR-Standort-Muster
// wie images/adminLocationGrants (zwei partielle Unique-Indizes statt einem
// zusammengesetzten, da Postgres zwei NULLs in derselben Spalte nie als
// Duplikat erkennt). Genau eine Kategorie pro (Standort, Paket) — daher
// categoryId hier NOT NULL (anders als beim Bild-Override unten, wo NULL
// "explizit deaktiviert" bedeutet).
export const shopLocationPackageAssignments = pgTable(
  "shop_location_package_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    administrativeUnitId: uuid("administrative_unit_id").references(() => administrativeUnits.id, {
      onDelete: "cascade",
    }),
    regionId: uuid("region_id").references(() => regions.id, { onDelete: "cascade" }),
    packageId: uuid("package_id")
      .notNull()
      .references(() => shopPackages.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => shopPackageCategories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "shop_location_package_assignments_standort_check",
      sql`(${table.administrativeUnitId} IS NULL) <> (${table.regionId} IS NULL)`
    ),
    uniqueIndex("shop_location_package_assignments_unit_idx")
      .on(table.administrativeUnitId, table.packageId)
      .where(sql`${table.regionId} IS NULL`),
    uniqueIndex("shop_location_package_assignments_region_idx")
      .on(table.regionId, table.packageId)
      .where(sql`${table.administrativeUnitId} IS NULL`),
  ]
);

// Bild-Override: pro Bild pro Paket entweder eine ABWEICHENDE Kategorie ODER
// explizit deaktiviert (categoryId NULL = "für dieses Bild trotz
// Standort-Zuordnung nicht verfügbar"). Fehlt die Zeile komplett, erbt das
// Bild unverändert die Standort-Zuordnung (die eigentliche Auflösungslogik
// "effektiv verfügbares Paket für Bild X" ist bewusst nicht Teil dieser
// Tabelle/dieses Schrittes, siehe Plan).
export const shopImagePackageAssignments = pgTable(
  "shop_image_package_assignments",
  {
    imageId: text("image_id")
      .notNull()
      .references(() => images.id, { onDelete: "cascade" }),
    packageId: uuid("package_id")
      .notNull()
      .references(() => shopPackages.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => shopPackageCategories.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.imageId, table.packageId] })]
);

// Zweite, parallele Produktlinie neben den Download-Paketen oben: physische
// Ausdrucke in festen Formaten (A2..A5) — Struktur-Spiegel von
// shopPackages/shopPackageCategories/shopPackagePrices/
// shopLocationPackageAssignments/shopImagePackageAssignments (siehe
// jeweilige Kommentare oben für die ausführliche Begründung der Muster,
// hier nicht wiederholt). widthCm/heightCm statt includedFiles ist der
// einzige inhaltliche Unterschied — ein Ausdruck hat eine physische Größe
// statt einer Dateiliste als "was man bekommt".
export const shopPrintFormats = pgTable(
  "shop_print_formats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    widthCm: doublePrecision("width_cm").notNull(),
    heightCm: doublePrecision("height_cm").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    // Vom super_admin gesetzte "Am beliebtesten"-Markierung — analog zu
    // shopPackages.isFeatured (siehe dort), eigene Spalte statt geteilter
    // Zustand, weil Pakete und Druckformate unabhängige Produktlinien mit
    // jeweils eigener Exklusivität sind (ein Paket UND ein Druckformat
    // können gleichzeitig markiert sein).
    isFeatured: boolean("is_featured").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("shop_print_formats_name_idx").on(table.name)]
);

// Globale Druckqualitäten (z.B. Fotopapier/Premium-Fotopapier/Leinwand) —
// gemeinsam für alle Formate, jedes Format bepreist sie unabhängig (siehe
// shopPrintFormatPrices). description wie bei shopPrintFormats/shopPackages
// per RichTextEditor gepflegtes HTML, nullable.
export const shopPrintQualities = pgTable(
  "shop_print_qualities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("shop_print_qualities_name_idx").on(table.name)]
);

// Preis pro (Format, Qualität) — genau eine Zeile pro Kombination.
export const shopPrintFormatPrices = pgTable(
  "shop_print_format_prices",
  {
    printFormatId: uuid("print_format_id")
      .notNull()
      .references(() => shopPrintFormats.id, { onDelete: "cascade" }),
    printQualityId: uuid("print_quality_id")
      .notNull()
      .references(() => shopPrintQualities.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.printFormatId, table.printQualityId] })]
);

// Standort-Ebene Format-Zuordnung: welche Qualitäten sind für ein Format an
// einer Verwaltungseinheit/Region bestellbar — MEHRERE Qualitäten pro
// (Standort, Format) gleichzeitig möglich (auf Wunsch des Users, z.B. "A5
// sowohl in Fotopapier als auch Premium-Fotopapier"). Jede Zeile ist daher
// ein reiner Vorhanden/Nicht-vorhanden-Toggle für genau ein (Standort,
// Format, Qualität)-Tripel, kein "der eine Wert für dieses Format" mehr wie
// bei shopLocationPackageAssignments oben (dort bewusst weiterhin genau
// eine Kategorie pro Paket) — daher die eindeutigen Indizes hier über alle
// drei Spalten statt nur (Standort, Format). Gleiches XOR-Standort-Muster
// wie shopLocationPackageAssignments oben.
export const shopLocationPrintFormatAssignments = pgTable(
  "shop_location_print_format_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    administrativeUnitId: uuid("administrative_unit_id").references(() => administrativeUnits.id, {
      onDelete: "cascade",
    }),
    regionId: uuid("region_id").references(() => regions.id, { onDelete: "cascade" }),
    printFormatId: uuid("print_format_id")
      .notNull()
      .references(() => shopPrintFormats.id, { onDelete: "cascade" }),
    printQualityId: uuid("print_quality_id")
      .notNull()
      .references(() => shopPrintQualities.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "shop_location_print_format_assignments_standort_check",
      sql`(${table.administrativeUnitId} IS NULL) <> (${table.regionId} IS NULL)`
    ),
    uniqueIndex("shop_location_print_format_assignments_unit_idx")
      .on(table.administrativeUnitId, table.printFormatId, table.printQualityId)
      .where(sql`${table.regionId} IS NULL`),
    uniqueIndex("shop_location_print_format_assignments_region_idx")
      .on(table.regionId, table.printFormatId, table.printQualityId)
      .where(sql`${table.administrativeUnitId} IS NULL`),
  ]
);

// Bild-Override: pro Bild pro Format entweder eine ABWEICHENDE Qualität
// ODER explizit deaktiviert (printQualityId NULL). Gleiches Muster wie
// shopImagePackageAssignments oben.
export const shopImagePrintFormatAssignments = pgTable(
  "shop_image_print_format_assignments",
  {
    imageId: text("image_id")
      .notNull()
      .references(() => images.id, { onDelete: "cascade" }),
    printFormatId: uuid("print_format_id")
      .notNull()
      .references(() => shopPrintFormats.id, { onDelete: "cascade" }),
    printQualityId: uuid("print_quality_id").references(() => shopPrintQualities.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.imageId, table.printFormatId] })]
);

export const adminLocationGrants = pgTable(
  "admin_location_grants",
  {
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    administrativeUnitId: uuid("administrative_unit_id").references(() => administrativeUnits.id, {
      onDelete: "cascade",
    }),
    regionId: uuid("region_id").references(() => regions.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "admin_location_grants_standort_check",
      sql`(${table.administrativeUnitId} IS NULL) <> (${table.regionId} IS NULL)`
    ),
    // Zwei partielle Indizes statt eines zusammengesetzten: ein normaler
    // Unique-Index über alle drei Spalten würde (admin, unitA, NULL) und
    // (admin, unitA, NULL) NICHT als Duplikat erkennen, da Postgres zwei
    // NULLs in dieser Spalte nie als gleich behandelt (dasselbe Problem wie
    // bei administrative_units_parent_code_idx, siehe seed-administrative-
    // units.mjs) — hier partiell auf die jeweils befüllte Spalte beschränkt.
    uniqueIndex("admin_location_grants_unit_idx")
      .on(table.adminUserId, table.administrativeUnitId)
      .where(sql`${table.regionId} IS NULL`),
    uniqueIndex("admin_location_grants_region_idx")
      .on(table.adminUserId, table.regionId)
      .where(sql`${table.administrativeUnitId} IS NULL`),
  ]
);

// Staffel-Rabatt auf den Warenwert (Zwischensumme der Bestellpositionen,
// VOR Versandkosten) einer gesamten Bestellung — admin-pflegbar wie der
// übrige Katalog, damit Schwellen/Prozentsätze ohne Code-Deploy änderbar
// sind (siehe Konzept-Plan Abschnitt 7). thresholdCents ist die
// Warenwert-Grenze, ab der die Stufe greift; bei mehreren erfüllten Stufen
// gewinnt die mit dem höchsten thresholdCents (serverseitig in
// src/app/checkout/actions.ts ermittelt, nicht hier in der DB). stripeCouponId
// zeigt auf einen einmalig angelegten, persistenten Stripe-Coupon
// (percent_off) für diese Stufe — lazy beim ersten Einsatz erzeugt und hier
// zurückgeschrieben, nicht pro Bestellung neu angelegt.
export const shopDiscountTiers = pgTable(
  "shop_discount_tiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    thresholdCents: integer("threshold_cents").notNull(),
    discountPercent: integer("discount_percent").notNull(),
    stripeCouponId: text("stripe_coupon_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shop_discount_tiers_threshold_idx").on(table.thresholdCents),
    check(
      "shop_discount_tiers_percent_check",
      sql`${table.discountPercent} > 0 AND ${table.discountPercent} <= 100`
    ),
  ]
);

export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "expired",
  "canceled",
  "refunded",
]);

export const orderLineItemKindEnum = pgEnum("order_line_item_kind", ["digital_package", "print"]);

export const orderLineItemFulfillmentStatusEnum = pgEnum("order_line_item_fulfillment_status", [
  "pending",
  "fulfilled",
  "canceled",
]);

// Snapshot der Stripe-Versandadresse (session.shipping_details) — write-once
// pro Bestellung, nur angezeigt statt gefiltert/abgefragt, daher jsonb statt
// eigener Spalten (siehe Konzept-Plan Abschnitt 2).
export interface OrderShippingAddress {
  name: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  country: string;
}

// Eine Zeile pro Bestellung/Zahlung — reiner ZAHLUNGSSTATUS der
// Gesamtbestellung (status), Fulfillment (Download freigeschaltet/Druck
// verschickt) läuft unabhängig pro Position, siehe orderLineItems unten
// (ein Auftrag kann digitale UND physische Positionen gleichzeitig
// enthalten, die getrennt "fertig" werden). subtotalCents/discountCents/
// shippingCents/totalCents sind serverseitige Snapshots zum Bestellzeitpunkt
// (siehe src/app/checkout/actions.ts) — zum Abgleich mit Stripes eigener
// Berechnung (session.amount_total) im Webhook, nie umgekehrt aus Stripe
// übernommen. stripeCheckoutSessionId ist NULLABLE: die Order-Zeile wird
// VOR dem Aufruf der Stripe-API angelegt (damit auch ein Absturz zwischen
// DB-Insert und Stripe-Aufruf eine nachvollziehbare pending_payment-Zeile
// hinterlässt, statt eines Stripe-Zahlungsvorgangs ganz ohne DB-Spur), die
// Session-Id wird erst direkt im Anschluss nachgetragen. stripePaymentIntentId
// wird noch später, vom Webhook, gesetzt.
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    currency: text("currency").notNull().default("eur"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountPercent: integer("discount_percent"),
    discountCents: integer("discount_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    shippingAddress: jsonb("shipping_address").$type<OrderShippingAddress>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    paidAt: timestamp("paid_at"),
  },
  (table) => [index("orders_user_id_idx").on(table.userId)]
);

// Eine Zeile je gekauftem Posten — entweder ein digitales Paket (packageId+
// categoryId, printFormatId/printQualityId NULL) oder ein Druck
// (printFormatId+printQualityId, packageId/categoryId NULL), erzwungen per
// CHECK statt zweier separater Tabellen (gemeinsame order_id/imageId/
// priceCents/fulfillmentStatus-Verwaltung wäre sonst dupliziert). priceCents/
// snapshotLabel sind zum Kaufzeitpunkt eingefroren (Katalogpreise/-namen
// können sich später ändern, siehe shopPackagePrices/shopPrintFormatPrices —
// die Bestellung bleibt trotzdem historisch korrekt). Alle Katalog-/Bild-FKs
// "restrict": ein bereits verkaufter Katalogeintrag/Bild darf nie
// unbemerkt gelöscht werden.
export const orderLineItems = pgTable(
  "order_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    imageId: text("image_id")
      .notNull()
      .references(() => images.id, { onDelete: "restrict" }),
    kind: orderLineItemKindEnum("kind").notNull(),
    packageId: uuid("package_id").references(() => shopPackages.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => shopPackageCategories.id, { onDelete: "restrict" }),
    printFormatId: uuid("print_format_id").references(() => shopPrintFormats.id, { onDelete: "restrict" }),
    printQualityId: uuid("print_quality_id").references(() => shopPrintQualities.id, { onDelete: "restrict" }),
    priceCents: integer("price_cents").notNull(),
    quantity: integer("quantity").notNull().default(1),
    snapshotLabel: text("snapshot_label").notNull(),
    fulfillmentStatus: orderLineItemFulfillmentStatusEnum("fulfillment_status").notNull().default("pending"),
    fulfilledAt: timestamp("fulfilled_at"),
    fulfilledBy: uuid("fulfilled_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "order_line_items_kind_check",
      sql`
        (${table.kind} = 'digital_package' AND ${table.packageId} IS NOT NULL AND ${table.categoryId} IS NOT NULL AND ${table.printFormatId} IS NULL AND ${table.printQualityId} IS NULL)
        OR
        (${table.kind} = 'print' AND ${table.printFormatId} IS NOT NULL AND ${table.printQualityId} IS NOT NULL AND ${table.packageId} IS NULL AND ${table.categoryId} IS NULL)
      `
    ),
    index("order_line_items_order_id_idx").on(table.orderId),
  ]
);
