ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_created_by_email" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_creation_request_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_trial_creation_request_unique" ON "users" USING btree ("trial_creation_request_id");
