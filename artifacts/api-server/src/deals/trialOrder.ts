import {and,eq,sql} from 'drizzle-orm';
import {db,usersTable,dealsTable,buyerRequestsTable,auditLogsTable,whatsappUserContextsTable} from '@workspace/db';
import {sendWhatsAppText} from '../whatsapp/client';
import {trialOrderCommand,reducedQuantity} from './trialOrderText';
export async function prepareTrialOrder(userId:string,dealId:string,quantity:string,unit:string){
 if(process.env.UDC_APP_ENV!=='staging')return {error:404};
 return db.transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'trial_order:'+userId+':'+dealId}))`);
 const [u]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');if(u?.role!=='buyer'||u.status!=='verified')return {error:403};
 const [d]=await tx.select({requestId:dealsTable.buyerRequestId,status:dealsTable.status}).from(dealsTable).where(and(eq(dealsTable.id,dealId),eq(dealsTable.buyerUserId,userId))).limit(1).for('share');if(!d?.requestId)return {error:404};if(!['initiated','negotiation'].includes(d.status))return {error:409};
 const [r]=await tx.select().from(buyerRequestsTable).where(and(eq(buyerRequestsTable.id,d.requestId),eq(buyerRequestsTable.buyerUserId,userId))).limit(1).for('share');if(!r||unit!==r.unit||!reducedQuantity(quantity,r.quantity))return {error:409};
 const [prior]=await tx.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trial_requirement_prepared'),eq(auditLogsTable.actorUserId,userId),eq(auditLogsTable.entityId,dealId),sql`${auditLogsTable.metadata}->>'quantity'=${quantity}`,sql`${auditLogsTable.metadata}->>'unit'=${unit}`)).limit(1);if(prior)return {requirementId:String(prior.metadata?.requirementId),repeated:true};
 const [newRequest]=await tx.insert(buyerRequestsTable).values({buyerUserId:userId,companyId:r.companyId,productId:r.productId,quantity,unit:r.unit,currency:r.currency,destination:r.destination,preferredIncoterm:r.preferredIncoterm,specification:r.specification,contractDuration:r.contractDuration,paymentTerms:r.paymentTerms,inspectionRequirements:r.inspectionRequirements,additionalConditions:r.additionalConditions,status:'pending_admin_review',targetPrice:null}).returning({id:buyerRequestsTable.id});
 await tx.insert(auditLogsTable).values({actorUserId:userId,action:'trial_requirement_prepared',entityType:'deal',entityId:dealId,metadata:{requirementId:newRequest.id,sourceRequirementId:r.id,quantity,unit,noSellerTermsCopied:true,noOrderCreated:true,requiresFreshQuote:true}});return {requirementId:newRequest.id,repeated:false};
 });
}
export async function handleTrialOrder(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging')return false;const input=trialOrderCommand(text);if(!input)return false;
 const [u]=await db.select({id:usersTable.id}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);const [c]=u?await db.select({id:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,u.id)).limit(1):[];
 if(!u||!c){await sendWhatsAppText(phone,'Select your buyer negotiation deal first. No trial order was made.');return true;}
 const r=await prepareTrialOrder(u.id,c.id,input.quantity,input.unit);await sendWhatsAppText(phone,'error'in r?'Trial request needs your own pre-contract buyer deal, the exact recorded unit and a positive quantity smaller than the original. No order or change was made.':`${r.repeated?'Your earlier trial draft is already saved.':'A smaller pending buyer requirement is prepared for human review.'} Quantity: ${input.quantity} ${input.unit}. This is not an order. Old seller terms and prices do not carry over; fresh seller quote, MOQ, freight, inspection and your agreement are required. Original deal unchanged.`);return true;
}
