import {and,eq} from 'drizzle-orm';
import {db,usersTable,whatsappUserContextsTable,dealsTable} from '@workspace/db';
import {statusPicturePng} from '../deals/statusPicturePng';
import {sendSyntheticStatusImage,sendWhatsAppText} from './client';
export async function handleStatusPicture(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store'||!/^(?:deal status picture|deal progress picture)[.!?]?$/i.test(text.trim()))return false;
 const result=await db.transaction(async tx=>{
 const [u]=await tx.select({id:usersTable.id,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1).for('share');if(!u||u.status!=='verified'||!['buyer','seller'].includes(u.role))return null;
 const [c]=await tx.select({id:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,u.id)).limit(1).for('share');if(!c)return null;
 const [d]=await tx.select({dealNumber:dealsTable.dealNumber,status:dealsTable.status,updatedAt:dealsTable.updatedAt}).from(dealsTable).where(and(eq(dealsTable.id,c.id),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,u.id))).limit(1).for('share');if(!d)return null;
 return sendSyntheticStatusImage(phone,statusPicturePng({...d,asOf:d.updatedAt.toISOString()}),`${d.dealNumber}: recorded stage ${d.status.replaceAll('_',' ')}. As of ${d.updatedAt.toISOString()}. Stage only, not payment or delivery confirmation.`);
 });if(!result)await sendWhatsAppText(phone,'Select one of your own deals using your verified buyer or seller account. No picture was shared.');return true;
}
