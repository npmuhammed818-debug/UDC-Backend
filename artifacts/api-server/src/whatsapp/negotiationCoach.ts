import {and,eq} from 'drizzle-orm';
import {db,usersTable,whatsappUserContextsTable,dealsTable} from '@workspace/db';
import {counterCoachCommand,counterCoach} from '../tradeEducation/coach';
import {sendWhatsAppText} from './client';
export async function handleNegotiationCoach(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging')return false;const input=counterCoachCommand(text);if(!input)return false;
 const [u]=await db.select({id:usersTable.id,role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 if(!u||!['buyer','seller'].includes(u.role)||u.status!=='verified'){await sendWhatsAppText(phone,'A negotiation draft needs your verified buyer or seller account.');return true;}
 const [c]=await db.select({id:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,u.id)).limit(1);
 const [d]=c?await db.select({currency:dealsTable.currency,unit:dealsTable.unit,status:dealsTable.status,incoterm:dealsTable.incoterm,destination:dealsTable.destination}).from(dealsTable).where(and(eq(dealsTable.id,c.id),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,u.id))).limit(1):[];
 if(!d){await sendWhatsAppText(phone,'Select one of your own deals before asking for a private negotiation draft.');return true;}
 const r=counterCoach(input,d);await sendWhatsAppText(phone,'error'in r?r.error:`Draft for you to review, not sent:\n${r.draft}\n${r.notice}`);return true;
}
