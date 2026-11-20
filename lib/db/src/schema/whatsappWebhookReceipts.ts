import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Passive webhook diagnostic (20 Nov, staging-only flag UDC_WHATSAPP_DIAG_RECEIPTS):
// one content-free row per POST /api/webhooks/whatsapp - payload class, item count,
// handler outcome and whether the HMAC signature checked out. No bodies, phone
// numbers, provider ids or payload hashes are stored. Retention: 7 days, purged
// by the webhook inbox runner tick.
export const whatsappWebhookReceiptsTable = pgTable(
  "whatsapp_webhook_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    payloadClass: text("payload_class").notNull(),
    itemCount: integer("item_count").notNull(),
    handlerOutcome: text("handler_outcome").notNull(),
    signed: boolean("signed").notNull(),
  },
  (table) => [index("whatsapp_webhook_receipts_received_idx").on(table.receivedAt)],
);
