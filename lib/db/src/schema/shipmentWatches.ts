import {boolean, index, pgTable, text, timestamp, uniqueIndex, uuid} from "drizzle-orm/pg-core";
import {dealsTable} from "./deals";
import {usersTable} from "./users";

// One watched carrier tracking number per user (Master Plan: automatic shipment
// updates). The watcher polls sparingly and records the last event fingerprint
// so a customer is only messaged on a real change (shipped / delayed / delivered).
export const shipmentWatchesTable=pgTable("shipment_watches",{
  id:uuid("id").primaryKey().defaultRandom(),
  userId:uuid("user_id").notNull().references(()=>usersTable.id,{onDelete:"cascade"}),
  dealId:uuid("deal_id").references(()=>dealsTable.id,{onDelete:"set null"}),
  trackingNumber:text("tracking_number").notNull(),
  active:boolean("active").notNull().default(true),
  lastFingerprint:text("last_fingerprint"),
  lastClass:text("last_class"),
  lastPolledAt:timestamp("last_polled_at",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},table=>[
  uniqueIndex("shipment_watches_user_number_idx").on(table.userId,table.trackingNumber),
  index("shipment_watches_active_idx").on(table.active),
]);
