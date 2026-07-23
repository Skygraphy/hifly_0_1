ALTER TABLE "region_administrative_units" DROP CONSTRAINT "region_administrative_units_region_id_regions_id_fk";--> statement-breakpoint
ALTER TABLE "regions" RENAME TO "regions_old";--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"home_level" "administrative_level" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "regions" ("id", "parent_id", "home_level", "name", "description", "color", "created_at", "updated_at")
SELECT "id", "parent_id", "home_level", "name", "description", "color", "created_at", "updated_at" FROM "regions_old";--> statement-breakpoint
DROP TABLE "regions_old";--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_parent_id_administrative_units_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."administrative_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_administrative_units" ADD CONSTRAINT "region_administrative_units_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "regions_name_idx" ON "regions" USING btree ("name");
