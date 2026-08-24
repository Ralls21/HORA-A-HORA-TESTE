ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_expires_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_trial_expires_at_idx" ON "users" USING btree ("trial_expires_at");
