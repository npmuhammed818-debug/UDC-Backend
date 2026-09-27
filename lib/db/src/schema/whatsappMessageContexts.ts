import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

export const whatsappMessageContextsTable = pgTable(
  "whatsapp_message_contexts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerMessageId: text("provider_message_id").notNull(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => dealsTable.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("whatsapp_message_contexts_provider_message_id_unique").on(
      table.providerMessageId,
    ),
    index("whatsapp_message_contexts_deal_id_idx").on(table.dealId),
    index("whatsapp_message_contexts_recipient_user_id_idx").on(
      table.recipientUserId,
    ),
  ],
);
