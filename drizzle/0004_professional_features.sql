ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "annual_goal_hours" integer DEFAULT 600 NOT NULL;
--> statement-breakpoint
UPDATE "users" SET "annual_goal_hours" = GREATEST(1, "goal_hours" * 12) WHERE "annual_goal_hours" = 600 AND "goal_hours" <> 50;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rounding_mode" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN IF NOT EXISTS "ldc_minutes" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studies_registry" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "name" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "started_on" date NOT NULL,
  "ended_on" date,
  "notes" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studies_registry_user_active_idx" ON "studies_registry" USING btree ("user_id", "active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "studies_registry_user_period_idx" ON "studies_registry" USING btree ("user_id", "started_on", "ended_on");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "studies_registry" ADD CONSTRAINT "studies_registry_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
