ALTER TABLE "images" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "main_location" text;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "secondary_locations" text[];--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "user_tags" text[];--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "web_visible" boolean;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "web_ranking" integer;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "print_visible" boolean;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "print_ranking" integer;