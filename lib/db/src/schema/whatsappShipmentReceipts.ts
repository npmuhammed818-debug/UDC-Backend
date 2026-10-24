import {index,pgTable,text,timestamp,uniqueIndex,uuid} from "drizzle-orm/pg-core";

// Meta webhooks are authenticated by the signed webhook boundary. This table
// holds metadata only, no phone numbers, message contents, or failure details.
export const whatsappShipmentReceiptsTable=pgTable("whatsapp_shipment_receipts",{
  id:uuid("id").primaryKey().defaultRandom(),
  providerMessageId:text("provider_message_id").notNull(),
  providerStatus:text("provider_status").notNull(),
  recipientFingerprint:text("recipient_fingerprint").notNull(),
  providerTimestamp:timestamp("provider_timestamp",{withTimezone:true}).notNull(),
  appliedAt:timestamp("applied_at",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("whatsapp_shipment_receipt_event_unique")
    .on(t.providerMessageId,t.providerStatus,t.providerTimestamp),
  index("whatsapp_shipment_receipt_unapplied_idx").on(t.appliedAt,t.createdAt),
]);
