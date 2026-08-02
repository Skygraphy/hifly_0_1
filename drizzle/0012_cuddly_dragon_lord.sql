CREATE OR REPLACE FUNCTION migrate_user_tags_to_jsonb_20260726(tags text[]) RETURNS jsonb AS $$
  SELECT CASE WHEN tags IS NULL THEN NULL
              ELSE (SELECT jsonb_agg(jsonb_build_object('tag', t, 'addedBy', NULL)) FROM unnest(tags) AS t)
         END;
$$ LANGUAGE sql IMMUTABLE;--> statement-breakpoint
ALTER TABLE "images" ALTER COLUMN "user_tags" SET DATA TYPE jsonb USING migrate_user_tags_to_jsonb_20260726("user_tags");--> statement-breakpoint
DROP FUNCTION migrate_user_tags_to_jsonb_20260726(text[]);
