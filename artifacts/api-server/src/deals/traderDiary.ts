import {and,eq,gte,lt,or} from 'drizzle-orm';
import {db,auditLogsTable,dealsTable,usersTable} from '@workspace/db';
import {completionEvidence} from './completionEvidence';
export async function traderCompletionDiary(userId:string,month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return {error:400};const start=new Date(month+'-01T00:00:00Z'),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);if(start.getTime()>Date.now())return {error:400};
 return db.transaction(async tx=>{
 const [u]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');if(!u||u.status!=='verified'||!['buyer','seller'].includes(u.role))return {error:403};
 // Filter by the immutable audit event's month, never the deal's mutable updatedAt.
 const rows=await tx.select({dealId:auditLogsTable.entityId,at:auditLogsTable.createdAt,metadata:auditLogsTable.metadata}).from(auditLogsTable).innerJoin(dealsTable,eq(dealsTable.id,auditLogsTable.entityId)).where(and(eq(auditLogsTable.action,'deal_status_updated'),eq(auditLogsTable.entityType,'deal'),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,userId),gte(auditLogsTable.createdAt,start),lt(auditLogsTable.createdAt,end))).limit(10001).for('share');
 if(rows.length>10000)return {error:422};const result=completionEvidence(rows.filter((r):r is typeof r&{dealId:string}=>!!r.dealId),start,end);
 return {month,recordedCompletionTransitions:result.records.length,ignoredRecords:result.ignored,moneySaved:null,bestSeller:null,basis:result.basis,notice:'Private summary for your current direct-party deals only. Missing historic audit data is not zero activity. No values, supplier identities or private notes disclosed.'};
 });
}
