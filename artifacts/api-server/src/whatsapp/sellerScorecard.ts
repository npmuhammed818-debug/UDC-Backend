import {and,eq,gte,lt,or} from 'drizzle-orm';
import {db,usersTable,messagesTable,dealsTable} from '@workspace/db';
import {sellerResponseSummary} from '../tradeEducation/scorecard';
import {sendWhatsAppText} from './client';
export async function handleSellerScorecard(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging'||!/^my scorecard(?: \d{4}-(?:0[1-9]|1[0-2]))?$/i.test(text.trim()))return false;
 const [user]=await db.select({id:usersTable.id,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 if(!user||user.role!=='seller'||user.status!=='verified'){await sendWhatsAppText(phone,'Your private seller scorecard needs a verified seller account.');return true;}
 const month=text.trim().split(/\s+/)[2]||new Date().toISOString().slice(0,7),start=new Date(month+'-01T00:00:00Z'),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
 const rows=await db.select({dealId:messagesTable.dealId,sender:messagesTable.senderUserId,receiver:messagesTable.receiverUserId,at:messagesTable.createdAt}).from(messagesTable).innerJoin(dealsTable,eq(dealsTable.id,messagesTable.dealId)).where(and(eq(dealsTable.sellerUserId,user.id),or(eq(messagesTable.senderUserId,user.id),eq(messagesTable.receiverUserId,user.id)),gte(messagesTable.createdAt,start),lt(messagesTable.createdAt,end))).limit(10001);
 if(rows.length>10000){await sendWhatsAppText(phone,'There are too many records for a reliable scorecard summary. Ask UDC for a reviewed report.');return true;}
 const r=sellerResponseSummary(rows,user.id,start,end);await sendWhatsAppText(phone,`Your private seller scorecard, ${month} (UTC): ${r.answeredTurns} answered turns, ${r.unansweredTurns} unanswered turns. ${r.medianReplyMinutes===null?'Not enough reply data for a median.':'Median first reply: '+r.medianReplyMinutes+' calendar minutes.'}\n${r.basis}\n${r.notice}\nTip: acknowledge a buyer question when you can, and say when you can give a full answer. No buyer preference or competitor benchmark is guessed.`);return true;
}
