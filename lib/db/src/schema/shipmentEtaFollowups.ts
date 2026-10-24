import {date, index, pgTable, text, timestamp, uniqueIndex, uuid} from "drizzle-orm/pg-core";
import {shipmentCargoUnitsTable} from "./shipmentCargoUnits";
import {dealsTable} from "./deals";

// One durable advisory per cargo unit, reason, UTC calendar day; no invented movement.
export const shipmentEtaFollowupsTable=pgTable("shipment_eta_followups",{
  id:uuid("id").primaryKey().defaultRandom(),
  cargoUnitId:uuid("cargo_unit_id").notNull().references(()=>shipmentCargoUnitsTable.id,{onDelete:"cascade"}),
  dealId:uuid("deal_id").notNull().references(()=>dealsTable.id,{onDelete:"cascade"}),
  reason:text("reason").notNull(),
  dayKey:date("day_key").notNull(),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},table=>[
  uniqueIndex("shipment_eta_followups_unique_day_idx").on(table.cargoUnitId,table.reason,table.dayKey),
  index("shipment_eta_followups_deal_idx").on(table.dealId),
]);
