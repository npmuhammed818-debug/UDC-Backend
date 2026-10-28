import {index,integer,pgTable,text,timestamp,uniqueIndex,uuid} from "drizzle-orm/pg-core";
import {notificationsTable} from "./workflow";
import {dealsTable} from "./deals";
import {usersTable} from "./users";

// One outbound intent per durable in-app notification. No stored phone,
// tokens, supplier contacts, signed URLs or provider response body.
export const whatsappShipmentOutboxTable=pgTable("whatsapp_shipment_outbox",{
  id:uuid("id").primaryKey().defaultRandom(),
  notificationId:uuid("notification_id").notNull().references(()=>notificationsTable.id,{onDelete:"cascade"}),
  // Null for user-initiated jobs without a deal (shipment watch updates). Deal-linked
  // jobs still cascade with their deal; null rows cascade with the notification.
  dealId:uuid("deal_id").references(()=>dealsTable.id,{onDelete:"cascade"}),
  recipientUserId:uuid("recipient_user_id").notNull().references(()=>usersTable.id,{onDelete:"cascade"}),
  status:text("status").notNull().default("pending"),
  attempts:integer("attempts").notNull().default(0),
  nextAttemptAt:timestamp("next_attempt_at",{withTimezone:true}).notNull().defaultNow(),
  claimToken:uuid("claim_token"),
  leaseUntil:timestamp("lease_until",{withTimezone:true}),
  providerMessageId:text("provider_message_id"),
  lastFailureCategory:text("last_failure_category"),
  acceptedAt:timestamp("accepted_at",{withTimezone:true}),
  deliveryStatus:text("delivery_status").notNull().default("unconfirmed"),
  providerStatusAt:timestamp("provider_status_at",{withTimezone:true}),
  deliveredAt:timestamp("delivered_at",{withTimezone:true}),
  readAt:timestamp("read_at",{withTimezone:true}),
  failedAt:timestamp("failed_at",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("whatsapp_shipment_outbox_notification_unique").on(t.notificationId),
  uniqueIndex("whatsapp_shipment_outbox_provider_id_unique").on(t.providerMessageId),
  index("whatsapp_shipment_outbox_next_idx").on(t.status,t.nextAttemptAt),
  index("whatsapp_shipment_outbox_recipient_idx").on(t.recipientUserId),
]);
