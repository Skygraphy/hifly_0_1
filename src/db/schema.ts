import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  primaryKey,
  uniqueIndex,
  uuid,
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("administrative_units_parent_code_idx").on(table.parentId, table.code)]
);
