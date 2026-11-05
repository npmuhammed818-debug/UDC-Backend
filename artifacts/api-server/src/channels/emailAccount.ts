import {createHmac} from 'node:crypto';
import {and,or,desc,eq,inArray,sql} from 'drizzle-orm';
import {db,usersTable,auditLogsTable,dealsTable,dealConversationEventsTable} from '@workspace/db';
import {POLICY_VERSION} from '../privacy/policies';
import {consentVersion} from '../privacy/consentNotice';
import {emailLinkRepository} from './emailBindingRepository';
import {emailBindingService} from './emailBinding';
export async function currentEmailAccountConsent(userId:string,executor:Pick<typeof db,'select'|'execute'>=db,lockConsent=false){
 const secret=process.env.WHATSAPP_APP_SECRET;if(!secret||secret.length<16)return null;
 const [u]=await executor.select({phone:usersTable.phone,status:usersTable.status}).from(usersTable).where(eq(usersTable.id,userId)).limit(1);if(!u?.phone||u.status!=='verified')return null;
 const fingerprint=createHmac('sha256',secret).update(u.phone).digest('hex');
 if(lockConsent)await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${'whatsapp-consent:'+fingerprint}))`);
 const [r]=await executor.select({m:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.entityType,'whatsapp_consent'),sql`${auditLogsTable.metadata}->>'fingerprint'=${fingerprint}`)).orderBy(desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(1);
 const version=consentVersion(POLICY_VERSION);return r?.m?.status==='accepted'&&r.m.policyVersion===version?version:null;
}
export function emailAccount(){const secret=process.env.UDC_EMAIL_BINDING_SECRET;if(!secret||secret.length<32)return null;const repository=emailLinkRepository(currentEmailAccountConsent,secret);return {repository,service:emailBindingService(repository.ports,secret)};}
/** No model, send, mutation, document bytes, counterpart originals, or unrelated
 * account events. Existing WhatsApp deal history is read from its original table. */
export async function emailDealHistory(address:string,dealId:string){
 const account=emailAccount();const principal=account&&await account.repository.resolve(address);if(!principal||!['buyer','seller'].includes(principal.role))return null;
 const [d]=await db.select({id:dealsTable.id,buyer:dealsTable.buyerUserId,seller:dealsTable.sellerUserId,status:dealsTable.status,number:dealsTable.dealNumber}).from(dealsTable).where(eq(dealsTable.id,dealId)).limit(1);if(!d||(principal.role==='buyer'?d.buyer:d.seller)!==principal.userId)return null;
 const counterpart=d.buyer===principal.userId?d.seller:d.buyer;
 const events=await db.select({id:dealConversationEventsTable.id,userId:dealConversationEventsTable.userId,original:dealConversationEventsTable.originalText,relay:dealConversationEventsTable.relayText,relayed:dealConversationEventsTable.relayed,at:dealConversationEventsTable.createdAt}).from(dealConversationEventsTable).where(and(eq(dealConversationEventsTable.dealId,dealId),or(and(eq(dealConversationEventsTable.userId,principal.userId),eq(dealConversationEventsTable.participantRole,d.buyer===principal.userId?'buyer':'seller')),and(eq(dealConversationEventsTable.userId,counterpart!),eq(dealConversationEventsTable.participantRole,d.buyer===principal.userId?'seller':'buyer'))))).orderBy(desc(dealConversationEventsTable.createdAt),desc(dealConversationEventsTable.id)).limit(24);
 // Resolve once more after read, so a concurrent suspension, withdrawal or changed
 // registration cannot turn the earlier check into a permanent permission.
 const still=await account!.repository.resolve(address);if(still?.userId!==principal.userId||still.role!==principal.role||still.consentVersion!==principal.consentVersion)return null;
 const [currentDeal]=await db.select({buyer:dealsTable.buyerUserId,seller:dealsTable.sellerUserId}).from(dealsTable).where(eq(dealsTable.id,dealId)).limit(1);if(!currentDeal||currentDeal.buyer!==d.buyer||currentDeal.seller!==d.seller)return null;
 return {dealNumber:d.number,status:d.status,historyKey:principal.historyKey,events:events.reverse().flatMap<{source:'your_message'|'delivered_to_you';text:string;at:Date}>(e=>e.userId===principal.userId?(typeof e.original==='string'&&e.original.trim()?[{source:'your_message' as const,text:e.original,at:e.at}]:[]):e.relayed&&typeof e.relay==='string'&&e.relay.trim()?[{source:'delivered_to_you' as const,text:e.relay,at:e.at}]:[]),notice:'Recent history only. A message is not acceptance, a payment instruction or a new agreement.'};
}
