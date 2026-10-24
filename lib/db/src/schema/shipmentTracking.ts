import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dealsTable } from "./deals";
import { usersTable } from "./users";
import { shipmentsTable } from "./workflow";

// Append-only, admin-reviewed tracking history. Carrier/AIS/GPS data is NEVER inferred.
export const shipmentTrackingEventsTable = pgTable("shipment_tracking_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  shipmentId: uuid("shipment_id").notNull().references(() => shipmentsTable.id, {onDelete:"cascade"}),
  dealId: uuid("deal_id").notNull().references(() => dealsTable.id, {onDelete:"cascade"}),
  kind: text("kind").notNull(),
  shipmentStatus: text("shipment_status"),
  location: text("location"),
  note: text("note"),
  source: text("source").notNull().default("udc_manual"),
  sourceReference: text("source_reference"),
  occurredAt: timestamp("occurred_at",{withTimezone:true}).notNull(),
  recordedByUserId: uuid("recorded_by_user_id").references(() => usersTable.id,{onDelete:"set null"}),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},table=>[
  index("shipment_tracking_events_shipment_time_idx").on(table.shipmentId,table.occurredAt),
  index("shipment_tracking_events_deal_time_idx").on(table.dealId,table.occurredAt),
]);
