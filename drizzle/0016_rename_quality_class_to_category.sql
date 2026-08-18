-- "Qualitätsstufe" -> "Kategorie" (Konzept-Umbenennung, keine Verhaltensänderung).
-- RENAME statt DROP+CREATE, um bereits vorhandene Seed-Daten zu erhalten.
ALTER TABLE "shop_quality_classes" RENAME TO "shop_categories";
--> statement-breakpoint
ALTER TABLE "shop_package_prices" RENAME COLUMN "quality_class_id" TO "category_id";
--> statement-breakpoint
ALTER TABLE "shop_location_package_assignments" RENAME COLUMN "quality_class_id" TO "category_id";
--> statement-breakpoint
ALTER TABLE "shop_image_package_assignments" RENAME COLUMN "quality_class_id" TO "category_id";
--> statement-breakpoint
ALTER INDEX "shop_quality_classes_name_idx" RENAME TO "shop_categories_name_idx";
--> statement-breakpoint
-- Auch die auto-generierten Constraint-Namen mitziehen (Postgres benennt sie
-- bei ALTER TABLE RENAME nicht automatisch um) — hält die DB konsistent mit
-- den Namen, die Drizzle für ein frisch aus schema.ts generiertes Schema
-- vergeben würde.
ALTER TABLE "shop_package_prices" RENAME CONSTRAINT "shop_package_prices_quality_class_id_shop_quality_classes_id_fk" TO "shop_package_prices_category_id_shop_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "shop_package_prices" RENAME CONSTRAINT "shop_package_prices_package_id_quality_class_id_pk" TO "shop_package_prices_package_id_category_id_pk";
--> statement-breakpoint
ALTER TABLE "shop_location_package_assignments" RENAME CONSTRAINT "shop_location_package_assignments_quality_class_id_shop_quality_classes_id_fk" TO "shop_location_package_assignments_category_id_shop_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "shop_image_package_assignments" RENAME CONSTRAINT "shop_image_package_assignments_quality_class_id_shop_quality_classes_id_fk" TO "shop_image_package_assignments_category_id_shop_categories_id_fk";
--> statement-breakpoint
-- Bereits vom User genanntes/geseedetes Beispiel-Naming ("QS-N") folgt der
-- Konzept-Umbenennung mit, damit keine veralteten Labels stehen bleiben.
UPDATE "shop_categories" SET "name" = 'Kategorie ' || substring("name" FROM '\d+$') WHERE "name" ~ '^QS-\d+$';
