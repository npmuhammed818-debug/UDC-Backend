import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { dealsTable } from "./deals";
import { documentsTable } from "./documents";
import { usersTable } from "./users";

export const dealParticipantsTable = pgTable(
  "deal_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => dealsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    participantRole: text("participant_role").notNull(),
    status: text("status").notNull().default("active"),
    referredByAgentUserId: uuid("referred_by_agent_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    referralPosition: integer("referral_position"),
    commissionSharePct: numeric("commission_share_pct", { precision: 6, scale: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("deal_participants_deal_user_role_unique").on(
      table.dealId,
      table.userId,
      table.participantRole,
    ),
    index("deal_participants_deal_id_idx").on(table.dealId),
    index("deal_participants_user_id_idx").on(table.userId),
    index("deal_participants_referrer_idx").on(table.referredByAgentUserId),
    index("deal_participants_chain_idx").on(table.dealId, table.referralPosition),
  ],
);

export const documentAccessTable = pgTable(
  "document_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    accessRole: text("access_role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("document_access_document_user_unique").on(
      table.documentId,
      table.userId,
    ),
    index("document_access_user_id_idx").on(table.userId),
  ],
);

export const notificationsTable = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_user_read_idx").on(table.userId, table.readAt),
    index("notifications_created_at_idx").on(table.createdAt),
  ],
);

export const referralsTable = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentUserId: uuid("agent_user_id")
      .notNull()
      .references(() => usersTable.id),
    referredUserId: uuid("referred_user_id")
      .notNull()
      .references(() => usersTable.id),
    referralCode: text("referral_code").notNull(),
    status: text("status").notNull().default("pending"),
    commissionRate: numeric("commission_rate", { precision: 6, scale: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("referrals_referred_user_unique").on(table.referredUserId),
    index("referrals_agent_user_id_idx").on(table.agentUserId),
    index("referrals_code_idx").on(table.referralCode),
  ],
);

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_actor_user_id_idx").on(table.actorUserId),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export const dealFinancialsTable = pgTable(
  "deal_financials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => dealsTable.id, { onDelete: "cascade" }),
    instrumentType: text("instrument_type").$type<"DLC">().notNull().default("DLC"),
    status: text("status").notNull().default("not_started"),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    currency: text("currency").notNull().default("USD"),
    terms: text("terms").default("Release after SGS inspection at destination"),
    reference: text("reference"),
    provider: text("provider"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("deal_financials_deal_id_idx").on(table.dealId),
    index("deal_financials_status_idx").on(table.status),
  ],
);

export const shipmentsTable = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => dealsTable.id, { onDelete: "cascade" }),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    status: text("status").notNull().default("planned"),
    origin: text("origin"),
    destination: text("destination"),
    estimatedArrival: timestamp("estimated_arrival", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("shipments_deal_id_idx").on(table.dealId),
    index("shipments_tracking_number_idx").on(table.trackingNumber),
    index("shipments_status_idx").on(table.status),
  ],
);

export const inspectionsTable = pgTable(
  "inspections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => dealsTable.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => usersTable.id),
    inspectorName: text("inspector_name"),
    status: text("status").notNull().default("requested"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    resultSummary: text("result_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("inspections_deal_id_idx").on(table.dealId),
    index("inspections_status_idx").on(table.status),
  ],
);

export const insertDealParticipantSchema = createInsertSchema(
  dealParticipantsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentAccessSchema = createInsertSchema(
  documentAccessTable,
).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(
  notificationsTable,
).omit({ id: true, createdAt: true });
export const insertReferralSchema = createInsertSchema(referralsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({
  id: true,
  createdAt: true,
});
export const insertDealFinancialSchema = createInsertSchema(
  dealFinancialsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertShipmentSchema = createInsertSchema(shipmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertInspectionSchema = createInsertSchema(inspectionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDealParticipant = z.infer<
  typeof insertDealParticipantSchema
>;
export type InsertDocumentAccess = z.infer<typeof insertDocumentAccessSchema>;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type InsertDealFinancial = z.infer<typeof insertDealFinancialSchema>;
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type InsertInspection = z.infer<typeof insertInspectionSchema>;