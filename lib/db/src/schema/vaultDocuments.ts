import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { companyVerificationDocumentsTable } from "./companyVerificationDocuments";
import { usersTable } from "./users";

// Only a SHA-256 of the link token is stored; the token itself exists once, in the link.
export const vaultUploadLinksTable = pgTable(
  "vault_upload_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vault_upload_links_user_idx").on(t.userId), index("vault_upload_links_expiry_idx").on(t.expiresAt)],
);

export const vaultAccessLogTable = pgTable(
  "vault_access_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    documentId: uuid("document_id").references(() => companyVerificationDocumentsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vault_access_log_document_idx").on(t.documentId), index("vault_access_log_actor_idx").on(t.actorUserId)],
);

export const vaultDeletionRequestsTable = pgTable(
  "vault_deletion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => companyVerificationDocumentsTable.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("requested"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("vault_deletion_requests_document_idx").on(t.documentId)],
);
