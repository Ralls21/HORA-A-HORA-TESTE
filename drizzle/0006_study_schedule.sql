ALTER TABLE "studies_registry" ADD COLUMN IF NOT EXISTS "preferred_days" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "studies_registry" ADD COLUMN IF NOT EXISTS "preferred_time" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "studies_registry" ADD COLUMN IF NOT EXISTS "address" text DEFAULT '' NOT NULL;
