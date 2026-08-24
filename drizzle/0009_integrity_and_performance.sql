CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "password_resets_user_id_idx" ON "password_resets" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "password_resets_expires_at_idx" ON "password_resets" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "records_study_ids_gin_idx" ON "records" USING gin ("study_ids");
CREATE UNIQUE INDEX IF NOT EXISTS "studies_registry_id_user_unique" ON "studies_registry" USING btree ("id", "user_id");

ALTER TABLE "users" ADD CONSTRAINT "users_goal_hours_check" CHECK ("goal_hours" between 1 and 200) NOT VALID;
ALTER TABLE "users" ADD CONSTRAINT "users_annual_goal_hours_check" CHECK ("annual_goal_hours" between 1 and 2400) NOT VALID;
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" in ('user', 'admin')) NOT VALID;
ALTER TABLE "users" ADD CONSTRAINT "users_rounding_mode_check" CHECK ("rounding_mode" in ('none', 'nearest', 'up', 'down')) NOT VALID;

ALTER TABLE "records" ADD CONSTRAINT "records_minutes_check" CHECK ("minutes" between 0 and 12000) NOT VALID;
ALTER TABLE "records" ADD CONSTRAINT "records_ldc_minutes_check" CHECK ("ldc_minutes" between 0 and 12000) NOT VALID;
ALTER TABLE "records" ADD CONSTRAINT "records_counts_check" CHECK ("publications" between 0 and 9999 and "studies" between 0 and 9999) NOT VALID;
ALTER TABLE "records" ADD CONSTRAINT "records_period_check" CHECK ("month" between 1 and 12 and "year" between 2000 and 2200) NOT VALID;

ALTER TABLE "studies_registry" ADD CONSTRAINT "studies_registry_progress_check" CHECK ("progress" between 0 and 100) NOT VALID;
ALTER TABLE "studies_registry" ADD CONSTRAINT "studies_registry_stale_days_check" CHECK ("stale_after_days" between 1 and 365) NOT VALID;
ALTER TABLE "studies_registry" ADD CONSTRAINT "studies_registry_recurrence_check" CHECK ("recurrence" in ('none', 'weekly')) NOT VALID;

ALTER TABLE "study_events" ADD CONSTRAINT "study_events_progress_check" CHECK ("progress" between 0 and 100) NOT VALID;
ALTER TABLE "study_events" ADD CONSTRAINT "study_events_status_check" CHECK ("status" in ('present', 'absent', 'rescheduled')) NOT VALID;
ALTER TABLE "study_events" ADD CONSTRAINT "study_events_reschedule_check" CHECK ("status" <> 'rescheduled' or ("rescheduled_to" is not null and "rescheduled_to" > "event_date")) NOT VALID;
ALTER TABLE "study_events" ADD CONSTRAINT "study_events_study_user_fk" FOREIGN KEY ("study_id", "user_id") REFERENCES "studies_registry"("id", "user_id") ON DELETE CASCADE NOT VALID;
