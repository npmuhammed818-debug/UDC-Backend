import {and,desc,eq} from 'drizzle-orm';
import {db,usersTable,auditLogsTable} from '@workspace/db';
import {currencyPreferenceCommand,addPriceReferences} from '../marketData/priceCurrency';
import {minorUnitDigits} from '../referrals/currencyPrecision';
export async function setPriceCurrency(phone:string,text:string){
 const code=currencyPreferenceCommand(text);if(!code)return null;
 if(code!=='OFF'&&minorUnitDigits(code)===null)return 'That currency is not supported. No preference changed.';
 return db.transaction(async tx=>{
 const [u]=await tx.select({id:usersTable.id,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1).for('share');
 if(!u||u.status!=='verified'||!['buyer','seller'].includes(u.role))return 'Your account needs UDC review before a price currency can be saved.';
 await tx.insert(auditLogsTable).values({actorUserId:u.id,action:'price_currency_preference',entityType:'user',entityId:u.id,metadata:{currency:code}});
 return code==='OFF'?'Automatic reference conversions are off. Original price currencies stay unchanged.':`Price references will also show ${code} when an explicit currency code and dated rate are available. Original quotes, units and deal/payment terms stay unchanged. Send price currency off to stop.`;
 });
}
export async function priceReferenceForRecipient(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging'||!/(?:\b[A-Z]{3}\s+\d|\d\s+[A-Z]{3}\b)/.test(text)||text.includes('[Indicative FX]'))return text;
 try{
 const [u]=await db.select({id:usersTable.id,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 if(!u||u.status!=='verified'||!['buyer','seller'].includes(u.role))return text;
 const [p]=await db.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.actorUserId,u.id),eq(auditLogsTable.action,'price_currency_preference'),eq(auditLogsTable.entityId,u.id))).orderBy(desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(1);
 const code=p?.metadata?.currency;if(typeof code!=='string'||code==='OFF')return text;
 return await addPriceReferences(text,code);
 }catch{return text;} // preference lookup failure cannot alter an original quote
}
