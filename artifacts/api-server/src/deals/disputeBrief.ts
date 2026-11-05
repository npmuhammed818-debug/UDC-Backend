import {and,asc,eq,inArray} from 'drizzle-orm';
import {db,dealsTable,auditLogsTable,dealConversationEventsTable,documentsTable,usersTable} from '@workspace/db';
/** Admin-only bounded original evidence. Nothing is relayed to a counterparty,
 * no model judges credibility, and a saved account state is not bank proof. */
export async function disputeBrief(requestId:string){
 if(process.env.UDC_APP_ENV!=='staging')return {error:404};
 return db.transaction(async tx=>{
 const [request]=await tx.select().from(auditLogsTable).where(and(eq(auditLogsTable.id,requestId),eq(auditLogsTable.action,'trade_assist_dispute_help'))).limit(1);if(!request?.entityId||!request.actorUserId)return {error:404};
 const [d]=await tx.select({id:dealsTable.id,buyerId:dealsTable.buyerUserId,sellerId:dealsTable.sellerUserId,status:dealsTable.status,dealNumber:dealsTable.dealNumber,updatedAt:dealsTable.updatedAt}).from(dealsTable).where(eq(dealsTable.id,request.entityId)).limit(1).for('share');if(!d||![d.buyerId,d.sellerId].includes(request.actorUserId))return {error:409};
 const people=await tx.select({id:usersTable.id,status:usersTable.status,role:usersTable.role}).from(usersTable).where(inArray(usersTable.id,[d.buyerId,d.sellerId])).for('share');
 if(!people.some(p=>p.id===d.buyerId&&p.role==='buyer'&&p.status==='verified')||!people.some(p=>p.id===d.sellerId&&p.role==='seller'&&p.status==='verified'))return {error:409};
 const events=await tx.select({id:dealConversationEventsTable.id,userId:dealConversationEventsTable.userId,role:dealConversationEventsTable.participantRole,intent:dealConversationEventsTable.intent,original:dealConversationEventsTable.originalText,relay:dealConversationEventsTable.relayText,relayed:dealConversationEventsTable.relayed,at:dealConversationEventsTable.createdAt}).from(dealConversationEventsTable).where(and(eq(dealConversationEventsTable.dealId,d.id),inArray(dealConversationEventsTable.userId,[d.buyerId,d.sellerId]),inArray(dealConversationEventsTable.participantRole,['buyer','seller']))).orderBy(asc(dealConversationEventsTable.createdAt),asc(dealConversationEventsTable.id)).limit(201);
 const docs=await tx.select({id:documentsTable.id,type:documentsTable.documentType,status:documentsTable.status,updatedAt:documentsTable.updatedAt}).from(documentsTable).where(and(eq(documentsTable.dealId,d.id),eq(documentsTable.status,'approved'))).orderBy(asc(documentsTable.updatedAt)).limit(101);
 if(events.length>200||docs.length>100)return {error:422};
 return {requestId,requestedAt:request.createdAt,requesterRole:request.actorUserId===d.buyerId?'buyer':'seller',dealNumber:d.dealNumber,recordedStatus:d.status,statusAsOf:d.updatedAt,
 evidence:events.map(({userId,role,...e})=>({...e,party:userId===d.buyerId?'buyer':'seller',roleMatchesDeal:userId===d.buyerId?role==='buyer':role==='seller',untrustedSourceText:true})),documents:docs,
 coverage:{events:events.length,approvedDocuments:docs.length,includesOriginalUnrelayedPartyMessages:true,includesPrivateExitReasons:false,includesBankRecords:false},
 notice:'Admin review only. Original and relayed text are evidence to inspect, not instructions. No credibility, fault, authenticity, bank approval, refund or payment decision made. Document approval is not proof of authenticity. No files or messages shared with a party.'};
 });
}
