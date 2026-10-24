import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { dealsTable } from "./deals";
import { shipmentsTable } from "./workflow";

// A shipment may contain several sea containers, air consignments or road loads.
// These are UDC-recorded declarations, NOT a real-time location data feed.
export const shipmentCargoUnitsTable=pgTable("shipment_cargo_units",{
  id:uuid("id").primaryKey().defaultRandom(),
  shipmentId:uuid("shipment_id").notNull().references(()=>shipmentsTable.id,{onDelete:"cascade"}),
  dealId:uuid("deal_id").notNull().references(()=>dealsTable.id,{onDelete:"cascade"}),
  transportMode:text("transport_mode").notNull(),
  unitReference:text("unit_reference").notNull(),
  status:text("status").notNull().default("planned"),
  vesselName:text("vessel_name"),
  voyageNumber:text("voyage_number"),
  flightNumber:text("flight_number"),
  vehicleReference:text("vehicle_reference"),
  billOfLading:text("bill_of_lading"),
  airWaybill:text("air_waybill"),
  currentLocation:text("current_location"),
  lastUpdateSource:text("last_update_source").notNull().default("udc_manual"),
  lastReportedAt:timestamp("last_reported_at",{withTimezone:true}),
  estimatedArrival:timestamp("estimated_arrival",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow().$onUpdate(()=>new Date()),
},table=>[
  uniqueIndex("shipment_cargo_units_ref_unique").on(table.shipmentId,table.unitReference),
  index("shipment_cargo_units_deal_idx").on(table.dealId),
  index("shipment_cargo_units_eta_idx").on(table.estimatedArrival),
  index("shipment_cargo_units_shipment_idx").on(table.shipmentId),
]);
