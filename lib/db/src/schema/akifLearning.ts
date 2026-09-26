import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { akifResearchRunsTable } from "./akifResearch";
import { usersTable } from "./users";

export const akifLearningEventsTable = pgTable(
  "akif_learning_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    researchRunId: uuid("research_run_id").references(
      () => akifResearchRunsTable.id,
      { onDelete: "set null" },
    ),
    requestedBy: uuid("requested_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    status: text("status").notNull().default("requested"),
    skillChangeId: text("skill_change_id"),
    inputSummary: text("input_summary"),
    hermesResponse: jsonb("hermes_response")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("akif_learning_events_research_run_idx").on(
      table.researchRunId,
      table.createdAt,
    ),
    index("akif_learning_events_status_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);
