import {eq} from 'drizzle-orm';import {db,usersTable,whatsappUserContextsTable} from '@workspace/db';import {photoQuoteReview,confirmPhotoQuoteReview} from '../deals/photoQuoteReview';import {sendWhatsAppText,sendWhatsAppInteractive} from './client';
export async function handlePhotoQuoteReview(phone:string,text:string){
 const m=/^review photo quote ([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.exec(text.trim());if(!m||process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store')return false;
 const [u]=await db.select({id:usersTable.id}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);const [c]=u?await db.select({deal:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,u.id)).limit(1):[];const r=u&&c?await photoQuoteReview(u.id,c.deal,m[1]):{error:404};
 await sendWhatsAppText(phone,'error'in r?'A current authorized price-list extraction is unavailable. No seller matched or requirement created.':`${r.dealNumber}: ${r.items.length} unverified extracted price-list rows.\n${r.items.slice(0,8).map((item,i)=>`${i+1}. ${item.product.slice(0,80)}: ${item.unitPrice} ${item.currency} per ${item.unit}`).join('\n')}\n${r.items.length>8?'Additional rows omitted from this message. Ask UDC for private review.\n':''}${r.notice}`);
 if(!('error'in r)&&r.items.length<=8&&!('reviewedAgainstOriginal'in r&&r.reviewedAgainstOriginal))await sendWhatsAppInteractive(phone,{type:'button',body:{text:'Only tap if you checked every displayed product, price, currency and unit against the original photo. This records your review of these exact rows only, not an order, seller offer or agreement.'},action:{buttons:[{type:'reply',reply:{id:`udc:photo_review:${c!.deal}:${m[1]}:${r.reviewToken}`,title:'Checked original'}}]}});
 return true;
}
export async function handlePhotoReviewButton(phone:string,id:string){
 const m=/^udc:photo_review:([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}):([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}):([a-f0-9]{64})$/i.exec(id);if(!m||process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store')return false;
 const [u]=await db.select({id:usersTable.id}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);const r=u?await confirmPhotoQuoteReview(u.id,m[1],m[2],m[3]):{error:404};
 await sendWhatsAppText(phone,'error'in r?'That exact photo snapshot is unavailable or changed. Review the current original and extracted rows again. No review was recorded.':r.notice);return true;
}
