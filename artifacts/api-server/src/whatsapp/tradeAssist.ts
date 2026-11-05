import {tradeAssistStatus} from '../deals/tradeAssistStatus';
import {and,eq} from 'drizzle-orm';
import {db,usersTable,whatsappUserContextsTable,dealsTable} from '@workspace/db';
import {saveTradeAssistRequest} from '../deals/tradeAssistRepository';
import {tradeAssistCommand} from '../deals/tradeAssist';
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
 const [deal]=await db.select({id:dealsTable.id}).from(dealsTable).where(and(eq(dealsTable.id,context.dealId),eq(user.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,user.id))).limit(1);
 if(!deal){await sendWhatsAppText(phone,'This selected deal is not available for your account.');return true;}
 if(statusAsk){
  const body=await tradeAssistStatus(user.id,context.dealId);
  await sendWhatsAppText(phone,body||'This private request status is unavailable for your current account and deal.');return true;
 }
 const result=await saveTradeAssistRequest(user,context.dealId,reason?'exit_reason':kind!,reason?.[1].toLowerCase());
 if('error' in result){await sendWhatsAppText(phone,'This request cannot be saved for the selected deal right now. The deal and its parties are unchanged.');return true;}
 await sendWhatsAppText(phone,(result.repeated?'This request was already recorded. Status: '+result.status+'. ':'Saved for UDC human review. ' )+' This request action does not contact a person, place an order or change a seller. Any new seller needs fresh terms and your agreement. Old seller chats and documents stay private on the old deal.');return true;
}
