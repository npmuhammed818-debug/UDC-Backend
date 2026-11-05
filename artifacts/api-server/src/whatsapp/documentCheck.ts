import {eq} from 'drizzle-orm';import {db,usersTable,whatsappUserContextsTable} from '@workspace/db';
import {documentCheckRead} from '../deals/documentCheckRead';import {documentCheckText} from '../deals/documentCheckText';import {sendWhatsAppText} from './client';
export async function handleDocumentCheck(phone:string,text:string){
 const m=/^check document ([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/i.exec(text.trim());if(!m||process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store')return false;
 const [u]=await db.select({id:usersTable.id}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);const [c]=u?await db.select({deal:whatsappUserContextsTable.activeDealId}).from(whatsappUserContextsTable).where(eq(whatsappUserContextsTable.userId,u.id)).limit(1):[];
 const r=u&&c?await documentCheckRead(u.id,c.deal,m[1]):{error:404};await sendWhatsAppText(phone,'error'in r?'That document comparison is unavailable for your selected deal. Current approval, access and extraction are required. No approval or terms change made.':documentCheckText(r));return true;
}
