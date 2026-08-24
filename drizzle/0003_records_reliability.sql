CREATE TABLE IF NOT EXISTS "records" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "date" date NOT NULL,
  "weekday" text NOT NULL,
  "minutes" integer NOT NULL,
  "publications" integer DEFAULT 0 NOT NULL,
  "studies" integer DEFAULT 0 NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "month" integer NOT NULL,
  "year" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "records_user_date_unique" ON "records" USING btree ("user_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "records_user_period_idx" ON "records" USING btree ("user_id", "year", "month");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "records" ADD CONSTRAINT "records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
