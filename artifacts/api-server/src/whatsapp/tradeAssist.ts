import {eq} from 'drizzle-orm';
import {db,usersTable,whatsappUserContextsTable} from '@workspace/db';
import {saveTradeAssistRequest} from '../deals/tradeAssistRepository';
import {tradeAssistCommand} from '../deals/tradeAssist';
import {sendWhatsAppText} from './client';
/** Explicit commands only, on the user's already selected deal. No inference
 * from distress, sentiment or quoted counterpart instructions. */
export async function handleTradeAssist(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging')return false;
 const kind=tradeAssistCommand(text);if(!kind)return false;
 const [user]=await db.select({id:usersTable.id,role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 if(!user||user.status!=='verified'||!['buyer','seller'].includes(user.role)){await sendWhatsAppText(phone,'Your account needs UDC review before a deal request can be saved.');return true;}
 const [context]=await db.select({dealId:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,user.id)).limit(1);
 if(!context){await sendWhatsAppText(phone,'Open My deals and select the deal first, then send this request again.');return true;}
 const result=await saveTradeAssistRequest(user,context.dealId,kind);
 if('error' in result){await sendWhatsAppText(phone,'This request cannot be saved for the selected deal right now. The deal and its parties are unchanged.');return true;}
 await sendWhatsAppText(phone,'Saved for UDC human review. No person has been contacted yet. No order was placed and no seller changed. Any new seller needs fresh terms and your agreement. Old seller chats and documents stay private on the old deal.');return true;
}
