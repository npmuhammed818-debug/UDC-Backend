import {and,eq,gte,lt,or} from 'drizzle-orm';
import {db,usersTable,dealConversationEventsTable,dealsTable} from '@workspace/db';
import {sellerResponseSummary} from '../tradeEducation/scorecard';
import {sendWhatsAppText} from './client';
export async function handleSellerScorecard(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging'||!/^my scorecard(?: \d{4}-(?:0[1-9]|1[0-2]))?$/i.test(text.trim()))return false;
 const [user]=await db.select({id:usersTable.id,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 if(!user||user.role!=='seller'||user.status!=='verified'){await sendWhatsAppText(phone,'Your private seller scorecard needs a verified seller account.');return true;}
 const month=text.trim().split(/\s+/)[2]||new Date().toISOString().slice(0,7),start=new Date(month+'-01T00:00:00Z'),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
 const events=await db.select({dealId:dealConversationEventsTable.dealId,sender:dealConversationEventsTable.userId,role:dealConversationEventsTable.participantRole,at:dealConversationEventsTable.createdAt,buyerId:dealsTable.buyerUserId}).from(dealConversationEventsTable).innerJoin(dealsTable,eq(dealsTable.id,dealConversationEventsTable.dealId)).where(and(eq(dealsTable.sellerUserId,user.id),eq(dealConversationEventsTable.relayed,true),or(eq(dealConversationEventsTable.participantRole,'buyer'),eq(dealConversationEventsTable.participantRole,'seller')),gte(dealConversationEventsTable.createdAt,start),lt(dealConversationEventsTable.createdAt,end))).limit(10001);
 const rows=events.filter(r=>r.role==='seller'?r.sender===user.id:r.sender===r.buyerId).map(r=>({dealId:r.dealId,sender:r.sender,receiver:r.role==='seller'?r.buyerId:user.id,at:r.at}));
 if(events.length>10000){await sendWhatsAppText(phone,'There are too many records for a reliable scorecard summary. Ask UDC for a reviewed report.');return true;}
 const r=sellerResponseSummary(rows,user.id,start,end);await sendWhatsAppText(phone,`Your private seller scorecard, ${month} (UTC): ${r.answeredTurns} answered turns, ${r.unansweredTurns} unanswered turns. ${r.medianReplyMinutes===null?'Not enough reply data for a median.':'Median first reply: '+r.medianReplyMinutes+' calendar minutes.'}\n${r.basis}\n${r.notice}\nTip: acknowledge a buyer question when you can, and say when you can give a full answer. No buyer preference or competitor benchmark is guessed.`);return true;
}
