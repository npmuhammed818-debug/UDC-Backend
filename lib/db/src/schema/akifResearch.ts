import { createInsertSchema } from "drizzle-zod";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const akifResearchRunsTable = pgTable(
  "akif_research_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestedBy: uuid("requested_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    intent: text("intent").notNull(),
    product: text("product"),
    hsCode: text("hs_code"),
    targetCountry: text("target_country"),
    direction: text("direction"),
    status: text("status").notNull().default("pending"),
    query: jsonb("query").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    evidence: jsonb("evidence").$type<Array<Record<string, unknown>>>().notNull().default([]),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("akif_research_runs_requested_by_idx").on(table.requestedBy, table.createdAt),
    index("akif_research_runs_status_idx").on(table.status, table.createdAt),
  ],
);

export const insertAkifResearchRunSchema = createInsertSchema(
  akifResearchRunsTable,
).omit({
  id: true,
  createdAt: true,
});

export type InsertAkifResearchRun = z.infer<typeof insertAkifResearchRunSchema>;
export type AkifResearchRun = typeof akifResearchRunsTable.$inferSelect;
