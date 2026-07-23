ALTER TABLE "administrative_units" ADD COLUMN "published" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "administrative_units" ALTER COLUMN "published" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "administrative_units" ADD CONSTRAINT "administrative_units_federal_published_check" CHECK ("level" <> 'federal' OR "published" = true);
