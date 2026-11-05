import {createHmac,timingSafeEqual} from 'node:crypto';
import {and,eq,sql} from 'drizzle-orm';
import {db,auditLogsTable} from '@workspace/db';
import {emailAccount,emailDealHistory} from './emailAccount';
import {processEmailPilot,type EmailEvidence} from './emailPilot';
/** A disposable synthetic fixture envelope, NOT Gmail, SMTP, SES, Mailgun or
 * another provider signature. There is no live-mailbox route or provider trust. */
export async function receiveSyntheticEmail(raw:string,timestamp:string,signature:string){
 if(process.env.UDC_APP_ENV!=='staging'||process.env.UDC_EMAIL_PILOT_MODE!=='synthetic'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store')return 'disabled';
 const secret=process.env.UDC_EMAIL_SYNTHETIC_DELIVERY_SECRET;if(!secret||secret.length<32||raw.length>30000||!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>120000||!/^[a-f0-9]{64}$/.test(signature))return 'unauthenticated_fixture';
 const expected=createHmac('sha256',secret).update(timestamp+'\n'+raw).digest('hex');if(!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return 'unauthenticated_fixture';
 let event:EmailEvidence;try{const value=JSON.parse(raw);if(!value||value.syntheticFixture!==true||typeof value.event!=='object')return 'invalid';event=value.event;for(const key of ['eventId','messageId','threadId','from','subject','text'])if(typeof (event as any)[key]!=='string')return 'invalid';if(!Array.isArray(event.to)||!Array.isArray(event.cc)||[...event.to,...event.cc].some(x=>typeof x!=='string')||!Array.isArray(event.attachments)||event.attachments.some(a=>!a||typeof a.id!=='string'||typeof a.name!=='string'||typeof a.type!=='string'||typeof a.bytes!=='number')||typeof event.autoSubmitted!=='boolean'||typeof event.bulk!=='boolean'||event.replyTo!==undefined&&typeof event.replyTo!=='string')return 'invalid';}catch{return 'invalid';}
 const account=emailAccount();if(!account)return 'disabled';
 // Drafts contain only a bounded original-history read, no model or tool engine.
 return processEmailPilot(event,{
 verifyDelivery:async()=>({signatureValid:true,dmarcAligned:true,authenticatedFrom:event.from}),
 startAccountLink:address=>account.service.startFromAuthenticatedEmail(address),
 resolveVerifiedAddress:address=>account.repository.resolve(address),
 claim:messageId=>db.transaction(async tx=>{const id=createHmac('sha256',secret).update(messageId).digest('hex');await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'email_fixture:'+id}))`);const [prior]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'email_synthetic_claim'),sql`${auditLogsTable.metadata}->>'messageHash'=${id}`)).limit(1);if(prior)return false;await tx.insert(auditLogsTable).values({action:'email_synthetic_claim',entityType:'email_fixture',metadata:{messageHash:id,state:'claimed_not_sent'}});return true;}),
 respondDraft:async()=>{const match=/^history ([a-f0-9-]{36})$/i.exec(event.text.trim());if(!match)return 'Staging email test only. No order, deal or payment action was taken. Shared history reads need an exact deal reference.';const history=await emailDealHistory(event.from,match[1]);return history?`Deal ${history.dealNumber}: ${history.status}.\n${history.events.map(e=>`${e.source==='your_message'?'You':'Shared with you'}: ${e.text}`).join('\n')}\n${history.notice}`:'That deal history is unavailable for this account.';},
 saveDraft:async draft=>{const current=await account.repository.resolve(event.from);if(!current)throw Error('email_binding_revoked');await db.insert(auditLogsTable).values({actorUserId:current.userId,action:'email_synthetic_draft',entityType:'email_fixture',metadata:{...draft,state:'drafted_not_sent',synthetic:true}});},
 });
}
