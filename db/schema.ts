import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    goalHours: integer("goal_hours").notNull().default(50),
    annualGoalHours: integer("annual_goal_hours").notNull().default(600),
    roundingMode: text("rounding_mode", { enum: ["none", "nearest", "up", "down"] }).notNull().default("none"),
    role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
    active: boolean("active").notNull().default(true),
    trialExpiresAt: timestamp("trial_expires_at", { withTimezone: true }),
    trialCreatedByEmail: text("trial_created_by_email"),
    trialCreationRequestId: text("trial_creation_request_id"),
    lastAccessAt: timestamp("last_access_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_trial_creation_request_unique").on(table.trialCreationRequestId),
    index("users_trial_expires_at_idx").on(table.trialExpiresAt),
    check("users_goal_hours_check", sql`${table.goalHours} between 1 and 200`),
    check("users_annual_goal_hours_check", sql`${table.annualGoalHours} between 1 and 2400`),
    check("users_role_check", sql`${table.role} in ('user', 'admin')`),
    check("users_rounding_mode_check", sql`${table.roundingMode} in ('none', 'nearest', 'up', 'down')`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_token_unique").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("password_resets_token_unique").on(table.tokenHash),
    index("password_resets_user_id_idx").on(table.userId),
    index("password_resets_expires_at_idx").on(table.expiresAt),
  ],
);

export const records = pgTable(
  "records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    weekday: text("weekday").notNull(),
    minutes: integer("minutes").notNull(),
    ldcMinutes: integer("ldc_minutes").notNull().default(0),
    publications: integer("publications").notNull().default(0),
    studies: integer("studies").notNull().default(0),
    studyIds: integer("study_ids").array().notNull().default([]),
    studyNames: text("study_names").array().notNull().default([]),
    notes: text("notes").notNull().default(""),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("records_user_date_unique").on(table.userId, table.date),
    index("records_user_period_idx").on(table.userId, table.year, table.month),
    index("records_study_ids_gin_idx").using("gin", table.studyIds),
    check("records_minutes_check", sql`${table.minutes} between 0 and 12000`),
    check("records_ldc_minutes_check", sql`${table.ldcMinutes} between 0 and 12000`),
    check("records_counts_check", sql`${table.publications} between 0 and 9999 and ${table.studies} between 0 and 9999`),
    check("records_period_check", sql`${table.month} between 1 and 12 and ${table.year} between 2000 and 2200`),
  ],
);

export const studiesRegistry = pgTable(
  "studies_registry",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    startedOn: date("started_on", { mode: "string" }).notNull(),
    endedOn: date("ended_on", { mode: "string" }),
    preferredDays: text("preferred_days").array().notNull().default([]),
    preferredTime: text("preferred_time").notNull().default(""),
    address: text("address").notNull().default(""),
    remindersEnabled: boolean("reminders_enabled").notNull().default(false),
    nextMeetingOn: date("next_meeting_on", { mode: "string" }),
    recurrence: text("recurrence", { enum: ["none", "weekly"] }).notNull().default("weekly"),
    staleAfterDays: integer("stale_after_days").notNull().default(14),
    lastContactOn: date("last_contact_on", { mode: "string" }),
    currentSubject: text("current_subject").notNull().default(""),
    progress: integer("progress").notNull().default(0),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("studies_registry_user_active_idx").on(table.userId, table.active),
    index("studies_registry_user_period_idx").on(table.userId, table.startedOn, table.endedOn),
    uniqueIndex("studies_registry_id_user_unique").on(table.id, table.userId),
    check("studies_registry_progress_check", sql`${table.progress} between 0 and 100`),
    check("studies_registry_stale_days_check", sql`${table.staleAfterDays} between 1 and 365`),
    check("studies_registry_recurrence_check", sql`${table.recurrence} in ('none', 'weekly')`),
  ],
);

export const studyEvents = pgTable(
  "study_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    studyId: integer("study_id").notNull().references(() => studiesRegistry.id, { onDelete: "cascade" }),
    eventDate: date("event_date", { mode: "string" }).notNull(),
    eventTime: text("event_time").notNull().default(""),
    status: text("status", { enum: ["present", "absent", "rescheduled"] }).notNull(),
    subject: text("subject").notNull().default(""),
    progress: integer("progress").notNull().default(0),
    notes: text("notes").notNull().default(""),
    rescheduledTo: date("rescheduled_to", { mode: "string" }),
    rescheduledTime: text("rescheduled_time").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("study_events_user_study_date_idx").on(table.userId, table.studyId, table.eventDate),
    index("study_events_user_date_idx").on(table.userId, table.eventDate),
    foreignKey({
      name: "study_events_study_user_fk",
      columns: [table.studyId, table.userId],
      foreignColumns: [studiesRegistry.id, studiesRegistry.userId],
    }).onDelete("cascade"),
    check("study_events_progress_check", sql`${table.progress} between 0 and 100`),
    check("study_events_status_check", sql`${table.status} in ('present', 'absent', 'rescheduled')`),
    check("study_events_reschedule_check", sql`${table.status} <> 'rescheduled' or (${table.rescheduledTo} is not null and ${table.rescheduledTo} > ${table.eventDate})`),
  ],
);

export type User = typeof users.$inferSelect;
export type RecordEntry = typeof records.$inferSelect;
export type StudyRegistryEntry = typeof studiesRegistry.$inferSelect;
export type StudyEventEntry = typeof studyEvents.$inferSelect;
