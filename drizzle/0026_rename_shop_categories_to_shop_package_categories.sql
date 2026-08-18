-- "shop_categories" -> "shop_package_categories" (Konzept-Umbenennung, keine
-- Verhaltensänderung) — klarer benannt, weil es ausschließlich Kategorien
-- für DIGITALE PAKETE sind (nicht zu verwechseln mit den Druckqualitäten der
-- Drucke-Produktlinie). RENAME statt DROP+CREATE, um bestehende Daten (die
-- Kategorien A..E samt aller Zuordnungen/Preise) zu erhalten.
ALTER TABLE "shop_categories" RENAME TO "shop_package_categories";
--> statement-breakpoint
ALTER TABLE "shop_package_categories" RENAME CONSTRAINT "shop_categories_pkey" TO "shop_package_categories_pkey";
--> statement-breakpoint
ALTER INDEX "shop_categories_name_idx" RENAME TO "shop_package_categories_name_idx";
--> statement-breakpoint
-- Auch die auto-generierten FK-Constraint-Namen mitziehen (Postgres benennt
-- sie bei ALTER TABLE RENAME nicht automatisch um, siehe 0016) — hält die DB
-- konsistent mit den Namen, die Drizzle für ein frisch aus schema.ts
-- generiertes Schema vergeben würde.
ALTER TABLE "shop_package_prices" RENAME CONSTRAINT "shop_package_prices_category_id_shop_categories_id_fk" TO "shop_package_prices_category_id_shop_package_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "shop_location_package_assignments" RENAME CONSTRAINT "shop_location_package_assignments_category_id_shop_categories_i" TO "shop_location_package_assignments_category_id_shop_package_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "shop_image_package_assignments" RENAME CONSTRAINT "shop_image_package_assignments_category_id_shop_categories_id_f" TO "shop_image_package_assignments_category_id_shop_package_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "order_line_items" RENAME CONSTRAINT "order_line_items_category_id_shop_categories_id_fk" TO "order_line_items_category_id_shop_package_categories_id_fk";
