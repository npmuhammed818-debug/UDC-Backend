import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// AKIF task planner (phase 7, owner-approved 29 Oct: code only, no deploy).
// One row per customer goal, private to that customer like their memories.
// Steps carry honest states; a gated step cannot complete without the
// customer's explicit yes in the chat. Tasks are operational state, not
// learning: no shared store reads or writes happen here.
export type AkifTaskStep = {
  label: string;
  state: "pending" | "in_progress" | "awaiting_approval" | "completed" | "failed" | "skipped";
  gated?: boolean;
  approved?: boolean;
};

export const akifTasksTable = pgTable(
  "akif_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    goal: text("goal").notNull(),
    steps: jsonb("steps").$type<AkifTaskStep[]>().notNull().default([]),
    state: text("state").notNull().default("in_progress"), // pending | in_progress | awaiting_approval | completed | failed | cancelled
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("akif_tasks_user_state_idx").on(table.userId, table.state),
  ],
);
