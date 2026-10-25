import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

// One row per Meta inbound message id so retries, restarts and multiple instances answer a message once.
// Stores only a SHA-256 fingerprint of the provider message id: no phone number, text or raw id.
export const whatsappInboundDedupTable = pgTable("whatsapp_inbound_dedup", {
  idHash: text("id_hash").primaryKey(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [index("whatsapp_inbound_dedup_claimed_idx").on(t.claimedAt)]);
