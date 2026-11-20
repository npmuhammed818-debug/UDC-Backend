import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

// AKIF private long-term memory, one row per remembered fact, preference or
// correction, locked to exactly one customer. Owner rules (28-29 Oct):
// memories are never auto-deleted (no expires column on purpose); deletion
// happens only when the customer asks, and cascades with the account.
// Learning reads chats with AKIF only, never documents; writes are gated on
// the customer's learning opt-in (users.akif_learning_opt_in, default false).
export const akifCustomerMemoriesTable = pgTable(
  "akif_customer_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => dealsTable.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(), // preference | correction | fact
    content: text("content").notNull(),
    source: text("source").notNull(), // where it came from, e.g. whatsapp message id
    status: text("status").notNull().default("active"), // active | withdrawn
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("akif_customer_memories_user_status_idx").on(
      table.userId,
      table.status,
    ),
    index("akif_customer_memories_user_deal_idx").on(
      table.userId,
      table.dealId,
    ),
  ],
);
