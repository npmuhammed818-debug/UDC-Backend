import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const whatsappWebhookInboxTable = pgTable(
  "whatsapp_webhook_inbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawBodyBase64: text("raw_body_base64").notNull(),
    signature: text("signature"),
    contentType: text("content_type"),
    payloadSha256: text("payload_sha256"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    forwardedAt: timestamp("forwarded_at", { withTimezone: true }),
    forwardStatus: integer("forward_status"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("whatsapp_webhook_inbox_payload_sha256_unique").on(table.payloadSha256),
    index("whatsapp_webhook_inbox_pending_idx").on(table.processedAt, table.receivedAt),
  ],
);
