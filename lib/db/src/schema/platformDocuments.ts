import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const platformDocumentsTable = pgTable(
  "platform_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentType: text("document_type").notNull(),
    version: text("version").notNull(),
    fileUrl: text("file_url").notNull(),
    status: text("status").notNull().default("active"),
    lawyerReference: text("lawyer_reference"),
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => usersTable.id),
    approvedAt: timestamp("approved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("platform_documents_type_status_idx").on(table.documentType, table.status),
    index("platform_documents_created_at_idx").on(table.createdAt),
  ],
);

export type PlatformDocument = typeof platformDocumentsTable.$inferSelect;
