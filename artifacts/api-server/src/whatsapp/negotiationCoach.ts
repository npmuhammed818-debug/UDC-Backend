import {and,eq} from 'drizzle-orm';
import {db,usersTable,whatsappUserContextsTable,dealsTable} from '@workspace/db';
import {counterCoachCommand,counterCoach} from '../tradeEducation/coach';
import {sendWhatsAppText} from './client';
export async function handleNegotiationCoach(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging')return false;const input=counterCoachCommand(text);if(!input)return false;
 const result=await db.transaction(async tx=>{
 const [u]=await tx.select({id:usersTable.id,role:usersTable.role,status:usersTable.status}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1).for('share');
 if(!u||!['buyer','seller'].includes(u.role)||u.status!=='verified')return 'A negotiation draft needs your verified buyer or seller account.';
 const [c]=await tx.select({id:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,u.id)).limit(1).for('share');
 const [d]=c?await tx.select({currency:dealsTable.currency,unit:dealsTable.unit,status:dealsTable.status,incoterm:dealsTable.incoterm,destination:dealsTable.destination}).from(dealsTable).where(and(eq(dealsTable.id,c.id),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,u.id))).limit(1).for('share'):[];
 if(!d)return 'Select one of your own deals before asking for a private negotiation draft.';
 const r=counterCoach(input,d);return 'error'in r?r.error:`Draft for you to review, not sent:\n${r.draft}\n${r.notice}`;
 });
 await sendWhatsAppText(phone,result);return true;
}
