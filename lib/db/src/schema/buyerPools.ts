import { index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

export const buyerPoolsTable = pgTable("buyer_pools", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => dealsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("forming"),
  targetQuantity: numeric("target_quantity", { precision: 20, scale: 6 }).notNull(),
  unit: text("unit").notNull(),
  instrumentStructure: text("instrument_structure").notNull().default("bank_review_required"),
  bankApprovalStatus: text("bank_approval_status").notNull().default("not_reviewed"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("buyer_pools_deal_unique").on(t.dealId),
  index("buyer_pools_status_idx").on(t.status),
]);

export const buyerPoolAllocationsTable = pgTable("buyer_pool_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  poolId: uuid("pool_id").notNull().references(() => buyerPoolsTable.id, { onDelete: "cascade" }),
  buyerUserId: uuid("buyer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
  committedValue: numeric("committed_value", { precision: 18, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("invited"),
  instrumentReference: text("instrument_reference"),
  instrumentStatus: text("instrument_status").notNull().default("not_started"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("buyer_pool_allocations_pool_buyer_unique").on(t.poolId, t.buyerUserId),
  index("buyer_pool_allocations_buyer_idx").on(t.buyerUserId),
  index("buyer_pool_allocations_status_idx").on(t.status),
]);
