import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

export const dealMeetingsTable = pgTable("deal_meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => dealsTable.id, { onDelete: "cascade" }),
  requestedBy: uuid("requested_by").notNull().references(() => usersTable.id),
  scheduledBy: uuid("scheduled_by").references(() => usersTable.id),
  status: text("status").notNull().default("requested"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  provider: text("provider"),
  meetingUrl: text("meeting_url"),
  agenda: text("agenda"),
  adminNotes: text("admin_notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("deal_meetings_deal_idx").on(t.dealId), index("deal_meetings_status_idx").on(t.status), index("deal_meetings_scheduled_idx").on(t.scheduledAt)]);

export const dealCasesTable = pgTable("deal_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => dealsTable.id, { onDelete: "cascade" }),
  openedBy: uuid("opened_by").notNull().references(() => usersTable.id),
  assignedTo: uuid("assigned_to").references(() => usersTable.id),
  caseType: text("case_type").notNull().default("trade_issue"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("open"),
  summary: text("summary").notNull(),
  resolution: text("resolution"),
  evidence: jsonb("evidence").$type<Array<{ documentId?: string; note?: string }>>().default([]),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("deal_cases_deal_idx").on(t.dealId), index("deal_cases_status_idx").on(t.status), index("deal_cases_assigned_idx").on(t.assignedTo)]);

export const customsClearanceTable = pgTable("customs_clearance", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => dealsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("not_started"),
  country: text("country"),
  port: text("port"),
  brokerName: text("broker_name"),
  reference: text("reference"),
  notes: text("notes"),
  clearedAt: timestamp("cleared_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("customs_clearance_deal_unique").on(t.dealId), index("customs_clearance_status_idx").on(t.status)]);

export const dealFeedbackTable = pgTable("deal_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => dealsTable.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subjectUserId: uuid("subject_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  rating: text("rating").notNull(),
  comment: text("comment"),
  status: text("status").notNull().default("pending_review"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("deal_feedback_author_deal_unique").on(t.dealId, t.authorUserId), index("deal_feedback_subject_idx").on(t.subjectUserId), index("deal_feedback_status_idx").on(t.status)]);
