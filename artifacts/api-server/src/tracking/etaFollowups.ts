import {and,asc,eq,gt,inArray} from "drizzle-orm";
import {
  auditLogsTable,db,dealsTable,notificationsTable,shipmentCargoUnitsTable,
  shipmentEtaFollowupsTable,usersTable,
} from "@workspace/db";
import {etaAdvisory} from "./etaAdvisory";

const PAGE_SIZE=200;
const activeStatuses=["planned","booked","in_transit","on_hold"];
const eligibleDealStatuses=["initiated","negotiation","verification","loi","icpo","fco_sco","contract",
  "banking","inspection","loading","shipment","delivery","payment","commission","on_hold","disputed"];

// Only persistent in-app alerts. No SMS/WhatsApp dispatch, no fabricated cargo
// delay or location, and no network dependency in this transaction.
export async function runEtaFollowups(options:{
  database?:typeof db,
  now?:Date,
  actorUserId?:string|null,
}={}){
  const database=options.database??db;
  const now=options.now??new Date();
  if(!Number.isFinite(now.getTime()))throw Error("invalid_utc_time");
  const dayKey=now.toISOString().slice(0,10);
  let cursor:string|undefined;
  let scanned=0,created=0,deduplicated=0;
  for(;;){
    const where=and(
      inArray(shipmentCargoUnitsTable.status,activeStatuses),
      ...(cursor?[gt(shipmentCargoUnitsTable.id,cursor)]:[]),
    );
    const page=await database.select({
      id:shipmentCargoUnitsTable.id,
      dealId:shipmentCargoUnitsTable.dealId,
      status:shipmentCargoUnitsTable.status,
      estimatedArrival:shipmentCargoUnitsTable.estimatedArrival,
      lastReportedAt:shipmentCargoUnitsTable.lastReportedAt,
      dealStatus:dealsTable.status,
      buyerUserId:dealsTable.buyerUserId,
      sellerUserId:dealsTable.sellerUserId,
    }).from(shipmentCargoUnitsTable)
      .innerJoin(dealsTable,eq(dealsTable.id,shipmentCargoUnitsTable.dealId))
      .where(where).orderBy(asc(shipmentCargoUnitsTable.id)).limit(PAGE_SIZE);
    for(const unit of page){
      scanned++;
      if(!eligibleDealStatuses.includes(unit.dealStatus))continue;
      const reason=etaAdvisory(unit.status,unit.estimatedArrival,unit.lastReportedAt,now);
      if(reason!=="overdue_unconfirmed"&&reason!=="last_report_stale")continue;
      const didCreate=await database.transaction(async tx=>{
        const [followup]=await tx.insert(shipmentEtaFollowupsTable)
          .values({cargoUnitId:unit.id,dealId:unit.dealId,reason,dayKey})
          .onConflictDoNothing().returning({id:shipmentEtaFollowupsTable.id});
        if(!followup)return false;
        const eligibleRecipientIds=[...new Set([unit.buyerUserId,unit.sellerUserId].filter(Boolean))];
        const recipients=eligibleRecipientIds.length
          ?await tx.select({id:usersTable.id}).from(usersTable)
             .where(and(inArray(usersTable.id,eligibleRecipientIds),
               inArray(usersTable.status,["active","verified"])))
          :[];
        const title=reason==="overdue_unconfirmed"?"Shipment ETA needs confirmation":"Shipment update needs review";
        const body=reason==="overdue_unconfirmed"
          ?"A recorded cargo ETA has passed without an arrival confirmation. UDC must verify with the shipping party."
          :"The last recorded cargo update is over 48 hours old. UDC must request a status confirmation.";
        if(recipients.length)await tx.insert(notificationsTable).values(recipients.map(recipient=>({
          userId:recipient.id,type:"shipment_eta_followup",title,body,
          link:`/deals/${unit.dealId}/tracking`,
        })));
        await tx.insert(auditLogsTable).values({
          actorUserId:options.actorUserId??null,
          action:"shipment_eta_followup_created",
          entityType:"deal",entityId:unit.dealId,
          metadata:{cargoUnitId:unit.id,reason,dayKey,recipientCount:recipients.length},
        });
        return true;
      });
      if(didCreate)created++;else deduplicated++;
    }
    if(page.length<PAGE_SIZE)break;
    cursor=page[page.length-1].id;
  }
  return {scanned,created,deduplicated,dayKey,channel:"in_app_only" as const};
}
