ALTER TABLE "records" ADD COLUMN IF NOT EXISTS "study_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN IF NOT EXISTS "study_names" text[] DEFAULT '{}'::text[] NOT NULL;
