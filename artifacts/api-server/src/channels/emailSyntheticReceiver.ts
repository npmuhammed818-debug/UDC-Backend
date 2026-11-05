import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {and,eq,sql} from 'drizzle-orm';
import {db,auditLogsTable} from '@workspace/db';
import {emailAccount} from './emailAccount';
import {emailReadOnlyDraft} from './emailReadOnlyDraft';
import type {ConversationPrincipal} from './conversationPort';
import {processEmailPilot,type EmailEvidence} from './emailPilot';
/** A disposable synthetic fixture envelope, NOT Gmail, SMTP, SES, Mailgun or
 * another provider signature. There is no live-mailbox route or provider trust. */
export async function receiveSyntheticEmail(raw:string,timestamp:string,signature:string){
 if(process.env.UDC_APP_ENV!=='staging'||process.env.UDC_EMAIL_PILOT_MODE!=='synthetic'||process.env.AKIF_WHATSAPP_REPLY_SINK!=='store')return 'disabled';
 const secret=process.env.UDC_EMAIL_SYNTHETIC_DELIVERY_SECRET;if(!secret||secret.length<32||raw.length>30000||!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>120000||!/^[a-f0-9]{64}$/.test(signature))return 'unauthenticated_fixture';
 const expected=createHmac('sha256',secret).update(timestamp+'\n'+raw).digest('hex');if(!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return 'unauthenticated_fixture';
 let event:EmailEvidence;try{const value=JSON.parse(raw);if(!value||value.syntheticFixture!==true||typeof value.event!=='object')return 'invalid';event=value.event;for(const key of ['eventId','messageId','threadId','from','subject','text'])if(typeof (event as any)[key]!=='string')return 'invalid';if(!Array.isArray(event.to)||!Array.isArray(event.cc)||[...event.to,...event.cc].some(x=>typeof x!=='string')||!Array.isArray(event.attachments)||event.attachments.some(a=>!a||typeof a.id!=='string'||typeof a.name!=='string'||typeof a.type!=='string'||typeof a.bytes!=='number')||typeof event.autoSubmitted!=='boolean'||typeof event.bulk!=='boolean'||event.replyTo!==undefined&&typeof event.replyTo!=='string')return 'invalid';}catch{return 'invalid';}
 const account=emailAccount();if(!account)return 'disabled';
 let draftPrincipal:ConversationPrincipal|undefined;
 const messageHash=createHmac('sha256',secret).update(event.messageId).digest('hex');let claimed=false;const leaseId=randomUUID();
 const finish=async(state:string)=>db.execute(sql`update audit_logs set metadata=metadata||${JSON.stringify({state,leaseUntil:0})}::jsonb where action='email_synthetic_claim' and metadata->>'messageHash'=${messageHash} and metadata->>'leaseId'=${leaseId}`);
 try{
 // Drafts contain only a bounded original-history read, no model or tool engine.
 const result=await processEmailPilot(event,{
 verifyDelivery:async()=>({signatureValid:true,dmarcAligned:true,authenticatedFrom:event.from}),
 startAccountLink:address=>account.service.startFromAuthenticatedEmail(address),
 resolveVerifiedAddress:address=>account.repository.resolve(address),
 claim:()=>db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'email_fixture:'+messageHash}))`);const [prior]=await tx.select({id:auditLogsTable.id,m:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'email_synthetic_claim'),sql`${auditLogsTable.metadata}->>'messageHash'=${messageHash}`)).limit(1).for('update');
 if(prior&&(prior.m?.state==='completed'||Number(prior.m?.leaseUntil)>Date.now()))return false;
 const attempts=Number(prior?.m?.attempts||0);if(attempts>=3)return false;
 const metadata={messageHash,leaseId,state:'processing_not_sent',leaseUntil:Date.now()+120000,attempts:attempts+1};if(prior)await tx.update(auditLogsTable).set({metadata}).where(eq(auditLogsTable.id,prior.id));else await tx.insert(auditLogsTable).values({action:'email_synthetic_claim',entityType:'email_fixture',metadata});claimed=true;return true;}),
 respondDraft:async({principal})=>{draftPrincipal=principal;return emailReadOnlyDraft(event.from,event.text);},
 saveDraft:async draft=>{if(!draftPrincipal)throw Error('email_draft_principal_missing');const expected=draftPrincipal;await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'email_link:'+expected.userId}))`);const current=await account.repository.resolve(event.from);if(!current||current.userId!==expected.userId||current.role!==expected.role||current.consentVersion!==expected.consentVersion)throw Error('email_binding_changed');await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'email_fixture:'+messageHash}))`);const [lease]=await tx.select({m:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'email_synthetic_claim'),sql`${auditLogsTable.metadata}->>'messageHash'=${messageHash}`)).limit(1).for('update');if(lease?.m?.leaseId!==leaseId||Number(lease.m.leaseUntil)<=Date.now())throw Error('email_processing_lease_lost');const [prior]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'email_synthetic_draft'),sql`${auditLogsTable.metadata}->>'messageHash'=${messageHash}`)).limit(1);if(!prior)await tx.insert(auditLogsTable).values({actorUserId:current.userId,action:'email_synthetic_draft',entityType:'email_fixture',metadata:{...draft,messageHash,state:'drafted_not_sent',synthetic:true}});});},
 });
 if(claimed)await finish('completed');return result;
 }catch{if(claimed)await finish('retryable_failure');return 'draft_processing_failed_not_sent';}
}
