CREATE TYPE "public"."administrative_level" AS ENUM('federal', 'state', 'district', 'municipality', 'cadastral_municipality', 'area');--> statement-breakpoint
CREATE TABLE "administrative_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"level" "administrative_level" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "administrative_units" ADD CONSTRAINT "administrative_units_parent_id_administrative_units_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."administrative_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "administrative_units_parent_code_idx" ON "administrative_units" USING btree ("parent_id","code");