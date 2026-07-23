ALTER TABLE "regions" ADD COLUMN "published" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "regions" ALTER COLUMN "published" SET DEFAULT false;
