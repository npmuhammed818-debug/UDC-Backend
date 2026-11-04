import {and,eq,desc,inArray,sql} from 'drizzle-orm';
import {db,usersTable,whatsappUserContextsTable,auditLogsTable,dealsTable} from '@workspace/db';
import {dealAccess} from '../deals/access';
import {saveTradeAssistRequest} from '../deals/tradeAssistRepository';
import {tradeAssistCommand,requestKinds} from '../deals/tradeAssist';
import {sendWhatsAppText} from './client';
/** Explicit commands only, on the user's already selected deal. No inference
 * from distress, sentiment or quoted counterpart instructions. */
export async function handleTradeAssist(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging')return false;
 const kind=tradeAssistCommand(text),statusAsk=text.trim().toLowerCase()==='request status',reason=/^exit reason (price|delay|trust|quality|terms|other)$/i.exec(text.trim());if(!kind&&!statusAsk&&!reason)return false;
 const [user]=await db.select({id:usersTable.id,role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 if(!user||user.status!=='verified'||!['buyer','seller'].includes(user.role)){await sendWhatsAppText(phone,'Your account needs UDC review before a deal request can be saved.');return true;}
 const [context]=await db.select({dealId:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,user.id)).limit(1);
 if(!context){await sendWhatsAppText(phone,'Open My deals and select the deal first, then send this request again.');return true;}
 const [deal]=await db.select({id:dealsTable.id}).from(dealsTable).where(and(eq(dealsTable.id,context.dealId),dealAccess(user.id,user.role))).limit(1);
 if(!deal){await sendWhatsAppText(phone,'This selected deal is not available for your account.');return true;}
 if(statusAsk){
  const requests=await db.select({id:auditLogsTable.id,action:auditLogsTable.action}).from(auditLogsTable).where(and(eq(auditLogsTable.actorUserId,user.id),eq(auditLogsTable.entityId,context.dealId),inArray(auditLogsTable.action,requestKinds.map(k=>'trade_assist_'+k)))).orderBy(desc(auditLogsTable.createdAt)).limit(5);
  const reviews=requests.length?await db.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_assist_review_recorded'),inArray(sql<string>`${auditLogsTable.metadata}->>'requestId'`,requests.map(r=>r.id)))).orderBy(desc(auditLogsTable.createdAt)):[];
  const body=requests.map(r=>{const review=reviews.find(v=>v.metadata?.requestId===r.id);return r.action.replace('trade_assist_','').replaceAll('_',' ')+': '+String(review?.metadata?.status||'awaiting human review').replaceAll('_',' ')+(typeof review?.metadata?.note==='string'?' - '+review.metadata.note:'');}).join('\n');
  await sendWhatsAppText(phone,body||'No help requests are recorded for you on the selected deal.');return true;
 }
 const result=await saveTradeAssistRequest(user,context.dealId,reason?'exit_reason':kind!,reason?.[1].toLowerCase());
 if('error' in result){await sendWhatsAppText(phone,'This request cannot be saved for the selected deal right now. The deal and its parties are unchanged.');return true;}
 await sendWhatsAppText(phone,(result.repeated?'This request was already recorded. Status: '+result.status+'. ':'Saved for UDC human review. ' )+' This request action does not contact a person, place an order or change a seller. Any new seller needs fresh terms and your agreement. Old seller chats and documents stay private on the old deal.');return true;
}
