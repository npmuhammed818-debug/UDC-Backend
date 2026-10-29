import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// AKIF shared lesson box (phase 4, owner-approved 29 Oct): generalized lessons
// any customer can benefit from. Deliberately NO customer/user link column -
// a shared lesson cannot point back to anyone by construction. Text enters
// this table only after automatic generalization plus the automatic safety
// check; rejected candidates are never stored here. Owner rules: no human
// review, no auto-deletion, origin real/practice is marked honestly, and
// review is recorded as automatic. Withdrawal stays possible at any time.
export const akifSharedLessonsTable = pgTable(
  "akif_shared_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topic: text("topic").notNull(),
    content: text("content").notNull(),
    origin: text("origin").notNull().default("real"), // real | practice
    status: text("status").notNull().default("approved"), // approved | withdrawn
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("akif_shared_lessons_status_idx").on(table.status),
    index("akif_shared_lessons_topic_idx").on(table.topic),
  ],
);
