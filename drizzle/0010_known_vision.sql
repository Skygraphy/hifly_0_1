CREATE TABLE "admin_location_grants" (
	"admin_user_id" uuid NOT NULL,
	"administrative_unit_id" uuid,
	"region_id" uuid,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_location_grants_standort_check" CHECK (("admin_location_grants"."administrative_unit_id" IS NULL) <> ("admin_location_grants"."region_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"capture_date" date NOT NULL,
	"sequence_number" integer NOT NULL,
	"hash" text NOT NULL,
	"uuid" uuid NOT NULL,
	"administrative_unit_id" uuid,
	"region_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "images_uuid_unique" UNIQUE("uuid"),
	CONSTRAINT "images_standort_check" CHECK (("images"."administrative_unit_id" IS NULL) <> ("images"."region_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "admin_location_grants" ADD CONSTRAINT "admin_location_grants_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_location_grants" ADD CONSTRAINT "admin_location_grants_administrative_unit_id_administrative_units_id_fk" FOREIGN KEY ("administrative_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_location_grants" ADD CONSTRAINT "admin_location_grants_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_location_grants" ADD CONSTRAINT "admin_location_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_administrative_unit_id_administrative_units_id_fk" FOREIGN KEY ("administrative_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_location_grants_unit_idx" ON "admin_location_grants" USING btree ("admin_user_id","administrative_unit_id") WHERE "admin_location_grants"."region_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_location_grants_region_idx" ON "admin_location_grants" USING btree ("admin_user_id","region_id") WHERE "admin_location_grants"."administrative_unit_id" IS NULL;