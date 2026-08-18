CREATE TABLE "shop_image_print_format_assignments" (
	"image_id" text NOT NULL,
	"print_format_id" uuid NOT NULL,
	"print_quality_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_image_print_format_assignments_image_id_print_format_id_pk" PRIMARY KEY("image_id","print_format_id")
);
--> statement-breakpoint
CREATE TABLE "shop_location_print_format_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"administrative_unit_id" uuid,
	"region_id" uuid,
	"print_format_id" uuid NOT NULL,
	"print_quality_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_location_print_format_assignments_standort_check" CHECK (("shop_location_print_format_assignments"."administrative_unit_id" IS NULL) <> ("shop_location_print_format_assignments"."region_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "shop_print_format_prices" (
	"print_format_id" uuid NOT NULL,
	"print_quality_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_print_format_prices_print_format_id_print_quality_id_pk" PRIMARY KEY("print_format_id","print_quality_id")
);
--> statement-breakpoint
CREATE TABLE "shop_print_formats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"width_cm" double precision NOT NULL,
	"height_cm" double precision NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_print_qualities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shop_image_print_format_assignments" ADD CONSTRAINT "shop_image_print_format_assignments_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_image_print_format_assignments" ADD CONSTRAINT "shop_image_print_format_assignments_print_format_id_shop_print_formats_id_fk" FOREIGN KEY ("print_format_id") REFERENCES "public"."shop_print_formats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_image_print_format_assignments" ADD CONSTRAINT "shop_image_print_format_assignments_print_quality_id_shop_print_qualities_id_fk" FOREIGN KEY ("print_quality_id") REFERENCES "public"."shop_print_qualities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_location_print_format_assignments" ADD CONSTRAINT "shop_location_print_format_assignments_administrative_unit_id_administrative_units_id_fk" FOREIGN KEY ("administrative_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_location_print_format_assignments" ADD CONSTRAINT "shop_location_print_format_assignments_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_location_print_format_assignments" ADD CONSTRAINT "shop_location_print_format_assignments_print_format_id_shop_print_formats_id_fk" FOREIGN KEY ("print_format_id") REFERENCES "public"."shop_print_formats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_location_print_format_assignments" ADD CONSTRAINT "shop_location_print_format_assignments_print_quality_id_shop_print_qualities_id_fk" FOREIGN KEY ("print_quality_id") REFERENCES "public"."shop_print_qualities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_print_format_prices" ADD CONSTRAINT "shop_print_format_prices_print_format_id_shop_print_formats_id_fk" FOREIGN KEY ("print_format_id") REFERENCES "public"."shop_print_formats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_print_format_prices" ADD CONSTRAINT "shop_print_format_prices_print_quality_id_shop_print_qualities_id_fk" FOREIGN KEY ("print_quality_id") REFERENCES "public"."shop_print_qualities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_location_print_format_assignments_unit_idx" ON "shop_location_print_format_assignments" USING btree ("administrative_unit_id","print_format_id") WHERE "shop_location_print_format_assignments"."region_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_location_print_format_assignments_region_idx" ON "shop_location_print_format_assignments" USING btree ("region_id","print_format_id") WHERE "shop_location_print_format_assignments"."administrative_unit_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_print_formats_name_idx" ON "shop_print_formats" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_print_qualities_name_idx" ON "shop_print_qualities" USING btree ("name");