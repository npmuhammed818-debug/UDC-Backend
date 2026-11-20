import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

// One row per Meta inbound message id so retries, restarts and multiple instances answer a message once.
// Stores only a SHA-256 fingerprint of the provider message id: no phone number, text or raw id.
export const whatsappInboundDedupTable = pgTable("whatsapp_inbound_dedup", {
  idHash: text("id_hash").primaryKey(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  // Passive diagnostic (20 Nov, staging flag UDC_WHATSAPP_DIAG_RECEIPTS): where a
  // claimed message stopped and the error class when the handler escaped before
  // completion. Cleared on completion. Stage/code only - never content.
  failedAt: timestamp("failed_at", { withTimezone: true }),
  failedStage: text("failed_stage"),
  errorClass: text("error_class"),
}, (t) => [index("whatsapp_inbound_dedup_claimed_idx").on(t.claimedAt)]);
