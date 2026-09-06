import { createInsertSchema } from "drizzle-zod";
import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

export const messagesTable = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => dealsTable.id),
    senderUserId: uuid("sender_user_id")
      .notNull()
      .references(() => usersTable.id),
    receiverUserId: uuid("receiver_user_id")
      .notNull()
      .references(() => usersTable.id),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("messages_deal_id_created_at_idx").on(
      table.dealId,
      table.createdAt,
    ),
    index("messages_sender_user_id_idx").on(table.senderUserId),
    index("messages_receiver_user_id_idx").on(table.receiverUserId),
  ],
);

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;