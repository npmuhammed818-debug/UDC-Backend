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

export const documentsTable = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => dealsTable.id),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => usersTable.id),
    documentType: text("document_type").notNull(),
    fileUrl: text("file_url").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("documents_deal_id_idx").on(table.dealId),
    index("documents_uploaded_by_idx").on(table.uploadedBy),
    index("documents_status_idx").on(table.status),
    index("documents_document_type_idx").on(table.documentType),
  ],
);

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;