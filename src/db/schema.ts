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
    userTags: text("user_tags").array(),
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
  ]
);

// Legt fest, welche konkreten Verwaltungseinheiten/Regionen ein bestimmter
// admin beim Bild-Upload zuweisen darf — kuratiert vom super_admin (siehe
// src/app/admin/users/actions.ts). Bewusst EXAKTE Freigaben ohne
// Kaskadierung auf Unterebenen (anders als das published-Flag): eine
// Freigabe auf "Niederösterreich" gilt nicht automatisch auch für Bezirke
// darunter. super_admin selbst braucht keine Einträge hier (uneingeschränkt,
// siehe canUploadImages/getAssignableLocations).
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
