ALTER TABLE "regions" ADD COLUMN "home_parent_id" uuid;--> statement-breakpoint
-- DEFAULT nur für bestehende Zeilen (Hohe Tauern/Wachau) beim Anlegen der
-- Spalte nötig, damit NOT NULL nicht an ihnen scheitert — wird direkt danach
-- wieder entfernt, künftige Inserts müssen home_level immer explizit setzen.
-- npm run db:seed:regions korrigiert Hohe Tauern/Wachau danach auf ihre
-- tatsächliche Anlage-Ebene.
ALTER TABLE "regions" ADD COLUMN "home_level" "administrative_level" NOT NULL DEFAULT 'federal';--> statement-breakpoint
ALTER TABLE "regions" ALTER COLUMN "home_level" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_home_parent_id_administrative_units_id_fk" FOREIGN KEY ("home_parent_id") REFERENCES "public"."administrative_units"("id") ON DELETE set null ON UPDATE no action;