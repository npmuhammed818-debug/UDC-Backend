import {and,eq,inArray,desc,lt} from 'drizzle-orm';
import {db,usersTable,dealsTable,auditLogsTable,whatsappUserContextsTable} from '@workspace/db';
import {completionEvidence} from './completionEvidence';
/** Same current direct pair only. Counts are recorded activity, never delivery,
 * reliability, savings or advice to add/change a contractual penalty. */
export async function relationshipMemory(userId:string,dealId?:string){return db.transaction(async tx=>{
 const [u]=await tx.select({status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');if(!u||u.status!=='verified'||!['buyer','seller'].includes(u.role))return {error:403};
 const [context]=dealId?[{dealId}]:await tx.select({dealId:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,userId)).limit(1);if(!context)return {error:404};
 const [current]=await tx.select({id:dealsTable.id,buyer:dealsTable.buyerUserId,seller:dealsTable.sellerUserId,number:dealsTable.dealNumber,createdAt:dealsTable.createdAt}).from(dealsTable).where(and(eq(dealsTable.id,context.dealId),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,userId))).limit(1).for('share');if(!current)return {error:404};
 const other=u.role==='buyer'?current.seller:current.buyer;
 const [counterparty]=await tx.select({status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,other)).limit(1).for('share');if(!counterparty||counterparty.status!=='verified'||counterparty.role!==(u.role==='buyer'?'seller':'buyer'))return {error:409};
 const deals=await tx.select({id:dealsTable.id,createdAt:dealsTable.createdAt}).from(dealsTable).where(and(eq(dealsTable.buyerUserId,current.buyer),eq(dealsTable.sellerUserId,current.seller),lt(dealsTable.createdAt,current.createdAt))).orderBy(desc(dealsTable.createdAt)).limit(102).for('share');
 const previous=deals.filter(d=>d.id!==current.id);if(previous.length>100)return {error:422};
 const events=previous.length?await tx.select({dealId:auditLogsTable.entityId,at:auditLogsTable.createdAt,metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'deal_status_updated'),eq(auditLogsTable.entityType,'deal'),inArray(auditLogsTable.entityId,previous.map(d=>d.id)))).limit(10001).for('share'):[];if(events.length>10000)return {error:422};
 const evidence=completionEvidence(events.filter((e):e is typeof e&{dealId:string}=>!!e.dealId),new Date(0),new Date());
 return {dealNumber:current.number,priorRecordedDeals:previous.length,priorRecordedCompletions:evidence.records.length,physicalDeliveryEvidenceAvailable:false,termsChanged:false,notice:'Private recorded history for the same current buyer and seller only, excluding this deal. Missing audit history is not zero activity. A recorded completion does not prove timely delivery, payment, product quality or reliability. No prior messages, documents, prices, identities or private exit reasons are shown. Ask UDC to review evidence before proposing any new term.'};
});}
