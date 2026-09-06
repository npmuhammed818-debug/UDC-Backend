import { createInsertSchema } from "drizzle-zod";
import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

export const commissionsTable = pgTable(
  "commissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => dealsTable.id),
    beneficiaryUserId: uuid("beneficiary_user_id")
      .notNull()
      .references(() => usersTable.id),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // Legacy agent relationship and commission fields retained for compatibility.
    agentId: uuid("agent_id"),
    commissionType: text("commission_type"),
    commissionRate: numeric("commission_rate", { precision: 8, scale: 4 }),
    commissionAmount: numeric("commission_amount", {
      precision: 18,
      scale: 2,
    }),
  },
  (table) => [
    index("commissions_deal_id_idx").on(table.dealId),
    index("commissions_beneficiary_user_id_idx").on(table.beneficiaryUserId),
    index("commissions_status_idx").on(table.status),
  ],
);

export const insertCommissionSchema = createInsertSchema(
  commissionsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCommission = z.infer<typeof insertCommissionSchema>;
export type Commission = typeof commissionsTable.$inferSelect;