import {and,eq,gte,lt,or} from 'drizzle-orm';
import {db,usersTable,dealConversationEventsTable,dealsTable} from '@workspace/db';
import {sellerResponseSummary} from '../tradeEducation/scorecard';
export async function sellerScorecardBody(userId:string,month:string,start:Date,end:Date){
 return db.transaction(async tx=>{
 const [u]=await tx.select({role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,userId)).limit(1).for('share');if(u?.role!=='seller'||u.status!=='verified')return null;
 const events=await tx.select({dealId:dealConversationEventsTable.dealId,sender:dealConversationEventsTable.userId,role:dealConversationEventsTable.participantRole,at:dealConversationEventsTable.createdAt,buyerId:dealsTable.buyerUserId}).from(dealConversationEventsTable).innerJoin(dealsTable,eq(dealsTable.id,dealConversationEventsTable.dealId)).where(and(eq(dealsTable.sellerUserId,userId),eq(dealConversationEventsTable.relayed,true),or(eq(dealConversationEventsTable.participantRole,'buyer'),eq(dealConversationEventsTable.participantRole,'seller')),gte(dealConversationEventsTable.createdAt,start),lt(dealConversationEventsTable.createdAt,end))).limit(10001).for('share');
 const rows=events.filter(r=>r.role==='seller'?r.sender===userId:r.sender===r.buyerId).map(r=>({dealId:r.dealId,sender:r.sender,receiver:r.role==='seller'?r.buyerId:userId,at:r.at}));
 if(events.length>10000)return null;
 const r=sellerResponseSummary(rows,userId,start,end);return `Your private seller scorecard, ${month} (UTC): ${r.answeredTurns} answered turns, ${r.unansweredTurns} unanswered turns. ${r.medianReplyMinutes===null?'Not enough reply data for a median.':'Median first reply: '+r.medianReplyMinutes+' calendar minutes.'}\n${r.basis}\n${r.notice}\nTip: acknowledge a buyer question when you can, and say when you can give a full answer. No buyer preference or competitor benchmark is guessed.`;
 });
}
