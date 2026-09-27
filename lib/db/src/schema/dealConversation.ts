import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

export const dealConversationEventsTable = pgTable(
  "deal_conversation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => dealsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    participantRole: text("participant_role").notNull(),
    intent: text("intent").notNull(),
    originalText: text("original_text").notNull(),
    relayText: text("relay_text"),
    relayed: boolean("relayed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("deal_conversation_events_deal_id_idx").on(table.dealId),
    index("deal_conversation_events_user_id_idx").on(table.userId),
    index("deal_conversation_events_created_at_idx").on(table.createdAt),
  ],
);

export const whatsappUserContextsTable = pgTable(
  "whatsapp_user_contexts",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    activeDealId: uuid("active_deal_id")
      .notNull()
      .references(() => dealsTable.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("whatsapp_user_contexts_user_id_unique").on(table.userId),
    index("whatsapp_user_contexts_active_deal_id_idx").on(table.activeDealId),
  ],
);
