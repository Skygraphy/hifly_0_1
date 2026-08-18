-- Postgres benennt die implizite Primary-Key-Constraint bei ALTER TABLE
-- RENAME nicht automatisch um (siehe 0016) — hier die letzte verbliebene
-- "quality_class"-Altlast (bereits manuell auf dieser Dev-DB nachgezogen,
-- diese Migration macht es für jede weitere DB reproduzierbar).
ALTER TABLE "shop_categories" RENAME CONSTRAINT "shop_quality_classes_pkey" TO "shop_categories_pkey";
