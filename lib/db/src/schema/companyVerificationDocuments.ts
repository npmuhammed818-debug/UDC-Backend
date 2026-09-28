import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

export const companyVerificationDocumentsTable = pgTable(
  "company_verification_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by").notNull().references(() => usersTable.id),
    documentType: text("document_type").notNull(),
    fileUrl: text("file_url").notNull(),
    status: text("status").notNull().default("pending"),
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by").references(() => usersTable.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("company_verification_documents_company_idx").on(table.companyId),
    index("company_verification_documents_status_idx").on(table.status),
    index("company_verification_documents_uploaded_by_idx").on(table.uploadedBy),
  ],
);

export type CompanyVerificationDocument = typeof companyVerificationDocumentsTable.$inferSelect;
