import {and,eq} from 'drizzle-orm';
import {db,usersTable} from '@workspace/db';
import {sendWhatsAppText} from '../whatsapp/client';
/** Synthetic delivery adapter only. Real OTP/templates stay unconfigured. */
export async function deliverReviewCodeToSink(userId:string,code:string){
 if(process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store'||!/^\d{6}$/.test(code))throw Error('review_code_delivery_disabled');
 const [u]=await db.select({phone:usersTable.phone,role:usersTable.role}).from(usersTable).where(and(eq(usersTable.id,userId),eq(usersTable.status,'verified'))).limit(1);
 if(!u?.phone||!['buyer','seller'].includes(u.role))throw Error('review_recipient_unavailable');
 const r=await sendWhatsAppText(u.phone,`UDC document review code: ${code}. Expires in 2 minutes. Do not share this code. This only opens your document; it does not accept a contract or payment.`);if(!r.delivered)throw Error('review_code_not_delivered');
}
