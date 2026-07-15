CREATE TABLE "region_administrative_units" (
	"region_id" uuid NOT NULL,
	"administrative_unit_id" uuid NOT NULL,
	CONSTRAINT "region_administrative_units_region_id_administrative_unit_id_pk" PRIMARY KEY("region_id","administrative_unit_id")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "region_administrative_units" ADD CONSTRAINT "region_administrative_units_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "region_administrative_units" ADD CONSTRAINT "region_administrative_units_administrative_unit_id_administrative_units_id_fk" FOREIGN KEY ("administrative_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "regions_name_idx" ON "regions" USING btree ("name");