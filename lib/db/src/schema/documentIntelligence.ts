import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { dealsTable } from "./deals";
import { documentsTable } from "./documents";

export const documentExtractionsTable = pgTable(
  "document_extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => dealsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    extractor: text("extractor").notNull().default("udc-open-source"),
    mimeType: text("mime_type"),
    fileName: text("file_name"),
    pageCount: integer("page_count"),
    fullText: text("full_text"),
    structuredData: jsonb("structured_data").$type<Record<string, unknown>>(),
    warnings: jsonb("warnings").$type<string[]>(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("document_extractions_document_id_unique").on(table.documentId),
    index("document_extractions_deal_id_idx").on(table.dealId),
    index("document_extractions_status_idx").on(table.status),
  ],
);

export const dealIntelligenceSnapshotsTable = pgTable(
  "deal_intelligence_snapshots",
  {
    dealId: uuid("deal_id")
      .primaryKey()
      .references(() => dealsTable.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    documentCount: integer("document_count").notNull().default(0),
    extractionCount: integer("extraction_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("deal_intelligence_snapshots_updated_at_idx").on(table.updatedAt),
  ],
);
