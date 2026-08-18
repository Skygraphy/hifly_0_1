CREATE TABLE "shop_image_package_assignments" (
	"image_id" text NOT NULL,
	"package_id" uuid NOT NULL,
	"quality_class_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_image_package_assignments_image_id_package_id_pk" PRIMARY KEY("image_id","package_id")
);
--> statement-breakpoint
CREATE TABLE "shop_location_package_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"administrative_unit_id" uuid,
	"region_id" uuid,
	"package_id" uuid NOT NULL,
	"quality_class_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_location_package_assignments_standort_check" CHECK (("shop_location_package_assignments"."administrative_unit_id" IS NULL) <> ("shop_location_package_assignments"."region_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "shop_package_prices" (
	"package_id" uuid NOT NULL,
	"quality_class_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_package_prices_package_id_quality_class_id_pk" PRIMARY KEY("package_id","quality_class_id")
);
--> statement-breakpoint
CREATE TABLE "shop_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"included_files" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_quality_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shop_image_package_assignments" ADD CONSTRAINT "shop_image_package_assignments_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_image_package_assignments" ADD CONSTRAINT "shop_image_package_assignments_package_id_shop_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."shop_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_image_package_assignments" ADD CONSTRAINT "shop_image_package_assignments_quality_class_id_shop_quality_classes_id_fk" FOREIGN KEY ("quality_class_id") REFERENCES "public"."shop_quality_classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_location_package_assignments" ADD CONSTRAINT "shop_location_package_assignments_administrative_unit_id_administrative_units_id_fk" FOREIGN KEY ("administrative_unit_id") REFERENCES "public"."administrative_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_location_package_assignments" ADD CONSTRAINT "shop_location_package_assignments_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_location_package_assignments" ADD CONSTRAINT "shop_location_package_assignments_package_id_shop_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."shop_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_location_package_assignments" ADD CONSTRAINT "shop_location_package_assignments_quality_class_id_shop_quality_classes_id_fk" FOREIGN KEY ("quality_class_id") REFERENCES "public"."shop_quality_classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_package_prices" ADD CONSTRAINT "shop_package_prices_package_id_shop_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."shop_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_package_prices" ADD CONSTRAINT "shop_package_prices_quality_class_id_shop_quality_classes_id_fk" FOREIGN KEY ("quality_class_id") REFERENCES "public"."shop_quality_classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_location_package_assignments_unit_idx" ON "shop_location_package_assignments" USING btree ("administrative_unit_id","package_id") WHERE "shop_location_package_assignments"."region_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_location_package_assignments_region_idx" ON "shop_location_package_assignments" USING btree ("region_id","package_id") WHERE "shop_location_package_assignments"."administrative_unit_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_packages_name_idx" ON "shop_packages" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_quality_classes_name_idx" ON "shop_quality_classes" USING btree ("name");