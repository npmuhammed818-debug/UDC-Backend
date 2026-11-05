import {eq} from 'drizzle-orm';import {db,usersTable} from '@workspace/db';import {relationshipMemory,relationshipMemoryText} from '../deals/relationshipMemory';import {sendWhatsAppText} from './client';
export async function handleRelationshipMemory(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store'||!/^our deal history[.!?]?$/i.test(text.trim()))return false;
 const [u]=await db.select({id:usersTable.id}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);const result=u?await relationshipMemory(u.id):{error:403};
 await sendWhatsAppText(phone,'error'in result?'Select your own deal with current verified buyer and seller accounts. No previous records were shown.':relationshipMemoryText(result));return true;
}
