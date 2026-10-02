import { boolean, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationPreferencesTable = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    optionalInApp: boolean("optional_in_app").notNull().default(true),
    optionalWhatsApp: boolean("optional_whatsapp").notNull().default(true),
    reminders: boolean("reminders").notNull().default(true),
    announcements: boolean("announcements").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("notification_preferences_user_id_unique").on(table.userId),
  ],
);
