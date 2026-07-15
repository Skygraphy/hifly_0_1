ALTER TABLE "regions" RENAME COLUMN "home_parent_id" TO "parent_id";--> statement-breakpoint
ALTER TABLE "regions" RENAME CONSTRAINT "regions_home_parent_id_administrative_units_id_fk" TO "regions_parent_id_administrative_units_id_fk";
