CREATE TABLE "image_favorites" (
	"user_id" uuid NOT NULL,
	"image_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "image_favorites_user_id_image_id_pk" PRIMARY KEY("user_id","image_id")
);
--> statement-breakpoint
ALTER TABLE "image_favorites" ADD CONSTRAINT "image_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_favorites" ADD CONSTRAINT "image_favorites_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;