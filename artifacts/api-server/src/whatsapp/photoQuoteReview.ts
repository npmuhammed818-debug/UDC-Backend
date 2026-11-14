import {photoQuoteText} from '../deals/photoQuoteText';
import {and,eq,sql} from 'drizzle-orm';import {db,usersTable,whatsappUserContextsTable,auditLogsTable} from '@workspace/db';import {photoQuoteReview,confirmPhotoQuoteReview} from '../deals/photoQuoteReview';import {sendWhatsAppText,sendWhatsAppInteractive} from './client';
export async function handlePhotoQuoteReview(phone:string,text:string){
 const m=/^review photo quote ([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.exec(text.trim());if(!m||process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store')return false;
 return db.transaction(async tx=>{
 const [u]=await tx.select({id:usersTable.id}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1).for('share');const [c]=u?await tx.select({deal:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,u.id)).limit(1).for('share'):[];const r=u&&c?await photoQuoteReview(u.id,c.deal,m[1],tx):{error:404};
 const rowsSent=await sendWhatsAppText(phone,'error'in r?'A current authorized price-list extraction is unavailable. No seller matched or requirement created.':photoQuoteText(r));
 if(rowsSent.delivered&&!('error'in r)&&r.items.length<=8&&!('reviewedAgainstOriginal'in r&&r.reviewedAgainstOriginal)){const offered=await sendWhatsAppInteractive(phone,{type:'button',body:{text:'Only tap if you checked every displayed product, price, currency and unit against the original photo. This records your review of these exact rows only, not an order, seller offer or agreement.'},action:{buttons:[{type:'reply',reply:{id:`udc:photo_review:${c!.deal}:${m[1]}:${r.reviewToken}`,title:'Checked original'}}]}});if(offered.delivered)await tx.insert(auditLogsTable).values({actorUserId:u!.id,action:'photo_review_button_offered',entityType:'deal',entityId:c!.deal,metadata:{documentId:m[1],reviewToken:r.reviewToken,synthetic:true,allRowsShown:true}});}
 return true;
 });
}
export async function handlePhotoReviewButton(phone:string,id:string){
 const m=/^udc:photo_review:([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}):([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}):([a-f0-9]{64})$/i.exec(id);if(!m||process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store')return false;
 return db.transaction(async tx=>{
 const [u]=await tx.select({id:usersTable.id}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1).for('share');const [offered]=u?await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'photo_review_button_offered'),eq(auditLogsTable.actorUserId,u.id),eq(auditLogsTable.entityId,m[1]),sql`${auditLogsTable.metadata}->>'documentId'=${m[2]}`,sql`${auditLogsTable.metadata}->>'reviewToken'=${m[3]}`,sql`${auditLogsTable.metadata}->>'allRowsShown'='true'`)).limit(1):[];const r=u&&offered?await confirmPhotoQuoteReview(u.id,m[1],m[2],m[3],tx):{error:404};
 await sendWhatsAppText(phone,'error'in r?'That exact photo snapshot is unavailable or changed. Review the current original and extracted rows again. No review was recorded.':r.notice);return true;
 });
}
