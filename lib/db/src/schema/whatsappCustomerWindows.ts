import {pgTable,text,timestamp,uuid,index} from "drizzle-orm/pg-core";
import {usersTable} from "./users";

// Last SIGNED customer-initiated message for current user/phone pair.
// No raw phone number, message body, provider message ID or token is stored.
export const whatsappCustomerWindowsTable=pgTable("whatsapp_customer_windows",{
  userId:uuid("user_id").primaryKey().references(()=>usersTable.id,{onDelete:"cascade"}),
  phoneFingerprint:text("phone_fingerprint").notNull(),
  providerMessageFingerprint:text("provider_message_fingerprint").notNull(),
  lastInboundAt:timestamp("last_inbound_at",{withTimezone:true}).notNull(),
  recordedAt:timestamp("recorded_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("whatsapp_customer_windows_recent_idx").on(t.lastInboundAt)]);
