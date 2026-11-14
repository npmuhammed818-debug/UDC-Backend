import {eq} from 'drizzle-orm';
import {db,usersTable} from '@workspace/db';
import {dealTermTip} from '../deals/dealTermTip';
import {sendWhatsAppText} from './client';
/** Contextual learning on explicit ask. Reads the selected deal's exact rule;
 * never assumes a named place, rule version, payment term or trade acceptance. */
export async function handleDealTermTip(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store'||!/^explain (?:my|this) deal(?:'s)? (?:incoterm|trade term)[.!?]?$/i.test(text.trim()))return false;
 const [u]=await db.select({id:usersTable.id}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 const body=u?await dealTermTip(u.id):null;await sendWhatsAppText(phone,body||'Select one of your own deals using your verified buyer or seller account first. No private term read.');return true;
}
