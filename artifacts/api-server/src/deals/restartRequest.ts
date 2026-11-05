import {and,eq,sql} from 'drizzle-orm';
import {db,auditLogsTable,dealsTable,buyerRequestsTable,usersTable} from '@workspace/db';
/** Creates a pending requirement, never a replacement deal. The current
 * buyer-owned request is the only source, not an audit snapshot or seller terms. */
export async function prepareRestartRequest(requestId:string,adminId:string){
 if(process.env.UDC_APP_ENV!=='staging')return {error:404};
 return db.transaction(async tx=>{
  const [request]=await tx.select().from(auditLogsTable).where(and(eq(auditLogsTable.id,requestId),sql`${auditLogsTable.action} in ('trade_assist_switch_seller','trade_assist_repeat_order','trade_assist_backup_seller')`)).limit(1).for('update');
  if(!request||!request.entityId||!request.actorUserId)return {error:404};
  const [prior]=await tx.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_restart_requirement_prepared'),sql`${auditLogsTable.metadata}->>'requestId'=${requestId}`)).limit(1);
  if(prior)return {requirementId:String(prior.metadata?.requirementId),repeated:true};
  const [deal]=await tx.select({id:dealsTable.id,buyerId:dealsTable.buyerUserId,requestId:dealsTable.buyerRequestId,status:dealsTable.status}).from(dealsTable).where(eq(dealsTable.id,request.entityId)).limit(1).for('share');
  if(!deal||deal.buyerId!==request.actorUserId||!deal.requestId)return {error:409};
  const eligible=request.action==='trade_assist_repeat_order'?deal.status==='completed':request.action==='trade_assist_switch_seller'?['cancelled','rejected','on_hold'].includes(deal.status):true;
  if(!eligible)return {error:409};
  const [buyer]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,deal.buyerId)).limit(1).for('share');
  if(buyer?.role!=='buyer'||buyer.status!=='verified')return {error:409};
  const [source]=await tx.select().from(buyerRequestsTable).where(and(eq(buyerRequestsTable.id,deal.requestId),eq(buyerRequestsTable.buyerUserId,deal.buyerId))).limit(1).for('share');
  if(!source)return {error:409};
  const [created]=await tx.insert(buyerRequestsTable).values({buyerUserId:deal.buyerId,companyId:source.companyId,productId:source.productId,quantity:source.quantity,unit:source.unit,currency:source.currency,targetPrice:source.targetPrice,destination:source.destination,preferredIncoterm:source.preferredIncoterm,specification:source.specification,contractDuration:source.contractDuration,paymentTerms:source.paymentTerms,inspectionRequirements:source.inspectionRequirements,additionalConditions:source.additionalConditions,status:'pending_admin_review'}).returning({id:buyerRequestsTable.id});
  await tx.insert(auditLogsTable).values({actorUserId:adminId,action:'trade_restart_requirement_prepared',entityType:'deal',entityId:deal.id,metadata:{requestId,requirementId:created.id,sourceRequirementId:source.id,kind:request.action,noSellerRecordsCopied:true,noDealCreated:true,requiresFreshTerms:true}});
  return {requirementId:created.id,repeated:false};
 });
}
