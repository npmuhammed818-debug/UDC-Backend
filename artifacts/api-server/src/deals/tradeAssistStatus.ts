import {tradeAssistStatusText} from './tradeAssistStatusText';
import {and,eq,desc,inArray,sql} from 'drizzle-orm';
import {db,usersTable,dealsTable,auditLogsTable} from '@workspace/db';
import {requestKinds} from './tradeAssist';
/** Only the current requester's own queue on one exact direct-party deal.
 * No staffing, contact, physical resolution or terms change is inferred. */
export async function tradeAssistStatus(userId:string,dealId:string){return db.transaction(async tx=>{
 const [u]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');
 if(u?.status!=='verified'||!['buyer','seller'].includes(u.role))return null;
 const [d]=await tx.select({number:dealsTable.dealNumber}).from(dealsTable).where(and(eq(dealsTable.id,dealId),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,userId))).limit(1).for('share');if(!d)return null;
 const requests=await tx.select({id:auditLogsTable.id,action:auditLogsTable.action}).from(auditLogsTable).where(and(eq(auditLogsTable.actorUserId,userId),eq(auditLogsTable.entityId,dealId),inArray(auditLogsTable.action,requestKinds.map(k=>'trade_assist_'+k)))).orderBy(desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(5).for('share');
 const reviews=requests.length?await tx.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_assist_review_recorded'),eq(auditLogsTable.entityId,dealId),inArray(sql<string>`${auditLogsTable.metadata}->>'requestId'`,requests.map(r=>r.id)))).orderBy(desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(101).for('share'):[];
 if(reviews.length>100)return null;
 const records=requests.map(r=>{const review=reviews.find(v=>v.metadata?.requestId===r.id),status=String(review?.metadata?.status);return {kind:r.action.replace('trade_assist_','').replaceAll('_',' '),status:['triaged','resolved','declined'].includes(status)?status:'awaiting human review',note:typeof review?.metadata?.note==='string'?review.metadata.note:null};});
 return tradeAssistStatusText(d.number,records);
});}
