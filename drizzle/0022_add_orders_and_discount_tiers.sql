CREATE TYPE "public"."order_line_item_fulfillment_status" AS ENUM('pending', 'fulfilled', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."order_line_item_kind" AS ENUM('digital_package', 'print');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'expired', 'canceled', 'refunded');--> statement-breakpoint
CREATE TABLE "order_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"image_id" text NOT NULL,
	"kind" "order_line_item_kind" NOT NULL,
	"package_id" uuid,
	"category_id" uuid,
	"print_format_id" uuid,
	"print_quality_id" uuid,
	"price_cents" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"snapshot_label" text NOT NULL,
	"fulfillment_status" "order_line_item_fulfillment_status" DEFAULT 'pending' NOT NULL,
	"fulfilled_at" timestamp,
	"fulfilled_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_line_items_kind_check" CHECK (
        ("order_line_items"."kind" = 'digital_package' AND "order_line_items"."package_id" IS NOT NULL AND "order_line_items"."category_id" IS NOT NULL AND "order_line_items"."print_format_id" IS NULL AND "order_line_items"."print_quality_id" IS NULL)
        OR
        ("order_line_items"."kind" = 'print' AND "order_line_items"."print_format_id" IS NOT NULL AND "order_line_items"."print_quality_id" IS NOT NULL AND "order_line_items"."package_id" IS NULL AND "order_line_items"."category_id" IS NULL)
      )
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"currency" text DEFAULT 'eur' NOT NULL,
	"stripe_checkout_session_id" text NOT NULL,
	"stripe_payment_intent_id" text,
	"subtotal_cents" integer NOT NULL,
	"discount_percent" integer,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"shipping_address" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	CONSTRAINT "orders_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id"),
	CONSTRAINT "orders_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "shop_discount_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"threshold_cents" integer NOT NULL,
	"discount_percent" integer NOT NULL,
	"stripe_coupon_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_discount_tiers_percent_check" CHECK ("shop_discount_tiers"."discount_percent" > 0 AND "shop_discount_tiers"."discount_percent" <= 100)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_package_id_shop_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."shop_packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_category_id_shop_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."shop_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_print_format_id_shop_print_formats_id_fk" FOREIGN KEY ("print_format_id") REFERENCES "public"."shop_print_formats"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_print_quality_id_shop_print_qualities_id_fk" FOREIGN KEY ("print_quality_id") REFERENCES "public"."shop_print_qualities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_fulfilled_by_users_id_fk" FOREIGN KEY ("fulfilled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_line_items_order_id_idx" ON "order_line_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_discount_tiers_threshold_idx" ON "shop_discount_tiers" USING btree ("threshold_cents");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id");