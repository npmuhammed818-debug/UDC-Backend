import {and,eq} from 'drizzle-orm';
import {db,usersTable,dealsTable,whatsappUserContextsTable} from '@workspace/db';
import {saveTradeAssistRequest} from '../deals/tradeAssistRepository';
import {sendWhatsAppText,sendWhatsAppInteractive} from './client';
export const helpButtonId=(dealId:string)=>'udc:human_help:'+dealId;
export const helpButtonDeal=(id:string)=>/^udc:human_help:([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.exec(id)?.[1]??null;
/** This is an explicit request, not a promise that a human is online. The deal
 * is embedded in the button so a later selected-deal change cannot redirect it. */
export async function handleHumanHelpButton(phone:string,id:string){
 const dealId=helpButtonDeal(id);if(!dealId||process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store')return false;
 const [u]=await db.select({id:usersTable.id,role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 const result=u&&u.status==='verified'&&['buyer','seller'].includes(u.role)?await saveTradeAssistRequest(u,dealId,'human_help'):{error:403};
 await sendWhatsAppText(phone,'error'in result?'That deal is unavailable to your verified account. No help request was created.':`${result.repeated?'Your help request is already recorded.':'Your help request is saved for UDC review.'} Status: ${result.status.replaceAll('_',' ')}. This does not mean a person is online or has contacted you. No deal, order or payment was changed.`);return true;
}
export async function offerHumanHelpButton(phone:string){
 if(process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store')return false;
 const [u]=await db.select({id:usersTable.id,role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);if(!u||u.status!=='verified'||!['buyer','seller'].includes(u.role))return false;
 const [c]=await db.select({id:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,u.id)).limit(1);if(!c)return false;
 const [d]=await db.select({id:dealsTable.id,number:dealsTable.dealNumber}).from(dealsTable).where(and(eq(dealsTable.id,c.id),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,u.id))).limit(1);if(!d)return false;
 await sendWhatsAppInteractive(phone,{type:'button',body:{text:`Need a person for ${d.number}? Tap to save a private help request for UDC review. No promise of immediate contact.`},action:{buttons:[{type:'reply',reply:{id:helpButtonId(d.id),title:'Request human help'}}]}});return true;
}
