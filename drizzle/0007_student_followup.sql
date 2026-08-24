ALTER TABLE "studies_registry" ADD COLUMN IF NOT EXISTS "reminders_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "studies_registry" ADD COLUMN IF NOT EXISTS "next_meeting_on" date;
--> statement-breakpoint
ALTER TABLE "studies_registry" ADD COLUMN IF NOT EXISTS "recurrence" text DEFAULT 'weekly' NOT NULL;
--> statement-breakpoint
ALTER TABLE "studies_registry" ADD COLUMN IF NOT EXISTS "stale_after_days" integer DEFAULT 14 NOT NULL;
--> statement-breakpoint
ALTER TABLE "studies_registry" ADD COLUMN IF NOT EXISTS "last_contact_on" date;
--> statement-breakpoint
ALTER TABLE "studies_registry" ADD COLUMN IF NOT EXISTS "current_subject" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "studies_registry" ADD COLUMN IF NOT EXISTS "progress" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "study_id" integer NOT NULL,
  "event_date" date NOT NULL,
  "event_time" text DEFAULT '' NOT NULL,
  "status" text NOT NULL,
  "subject" text DEFAULT '' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "rescheduled_to" date,
  "rescheduled_time" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_events_user_study_date_idx" ON "study_events" USING btree ("user_id", "study_id", "event_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_events_user_date_idx" ON "study_events" USING btree ("user_id", "event_date");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_events" ADD CONSTRAINT "study_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_events" ADD CONSTRAINT "study_events_study_id_studies_registry_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies_registry"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
