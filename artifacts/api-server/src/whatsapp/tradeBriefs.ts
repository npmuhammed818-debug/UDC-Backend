import {and,desc,eq,inArray,sql} from 'drizzle-orm';
import {db,usersTable,auditLogsTable,notificationPreferencesTable} from '@workspace/db';
import {currentEmailAccountConsent} from '../channels/emailAccount';
import {eligibleBrief,formatBrief,reviewedBriefs,type BriefKind} from '../tradeBriefs/bulletins';
import {sendWhatsAppText} from './client';
const safe=()=>process.env.UDC_APP_ENV==='staging'&&process.env.AKIF_WHATSAPP_REPLY_SINK==='store';
export async function handleTradeBrief(phone:string,text:string){
 const m=/^(market news|festival timing)(?: (on|off))?$/i.exec(text.trim());if(!m||!safe())return false;
 const kind:BriefKind=m[1].toLowerCase()==='market news'?'market':'festival';
 const [u]=await db.select({id:usersTable.id,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 if(!u||u.status!=='verified'||!['buyer','seller'].includes(u.role)||!await currentEmailAccountConsent(u.id)){await sendWhatsAppText(phone,'Trade briefs need your current verified UDC account and privacy consent.');return true;}
 if(m[2]){const optIn=m[2].toLowerCase()==='on';await db.insert(auditLogsTable).values({actorUserId:u.id,action:'trade_brief_preference',entityType:'user',entityId:u.id,createdAt:sql`clock_timestamp()`,metadata:{kind,optIn,scope:'reviewed_bulletins_only'}});await sendWhatsAppText(phone,optIn?`Optional ${m[1].toLowerCase()} briefs are on for this staging test. At most one per week; no order, pricing or deadline is assumed.`:`Optional ${m[1].toLowerCase()} briefs are off.`);return true;}
 const candidates=reviewedBriefs.filter(b=>b.kind===kind&&eligibleBrief(b,new Date()));await sendWhatsAppText(phone,candidates.length?candidates.map(formatBrief).join('\n\n'):'No current reviewed brief is available. Old material is not a fresh market update.');return true;
}
/** Invoked by explicit QA only; no auto-start interval. Sink gate cannot send real
 * Meta messages. Current privacy, account and opt-out rechecked on each scan. */
export async function runTradeBriefs(now=new Date()){
 if(!safe())return {disabled:true,recorded:0};let recorded=0;
 const preferences=await db.select({userId:auditLogsTable.actorUserId,m:auditLogsTable.metadata,at:auditLogsTable.createdAt}).from(auditLogsTable).where(eq(auditLogsTable.action,'trade_brief_preference')).orderBy(desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(2000);const seen=new Set<string>();
 for(const p of preferences){const kind=p.m?.kind as BriefKind;if(!p.userId||!['market','festival'].includes(kind))continue;const key=p.userId+':'+kind;if(seen.has(key))continue;seen.add(key);if(p.m?.optIn!==true)continue;
 await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'trade_brief:'+key}))`);const [latest]=await tx.select({m:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_brief_preference'),eq(auditLogsTable.actorUserId,p.userId!),sql`${auditLogsTable.metadata}->>'kind'=${kind}`)).orderBy(desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(1);if(latest?.m?.optIn!==true)return;
 const [u]=await tx.select({phone:usersTable.phone,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,p.userId!)).limit(1);if(!u?.phone||u.status!=='verified'||!['buyer','seller'].includes(u.role)||!await currentEmailAccountConsent(p.userId!))return;
 const [notifications]=await tx.select({optional:notificationPreferencesTable.optionalWhatsApp,announcements:notificationPreferencesTable.announcements}).from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId,p.userId!)).limit(1);if(notifications&&(notifications.optional===false||notifications.announcements===false))return;
 const [prior]=await tx.select({m:auditLogsTable.metadata,at:auditLogsTable.createdAt}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_brief_sink_delivered'),eq(auditLogsTable.actorUserId,p.userId!),sql`${auditLogsTable.metadata}->>'kind'=${kind}`)).orderBy(desc(auditLogsTable.createdAt)).limit(1);if(prior&&prior.at.getTime()>now.getTime()-7*86400000)return;
 const brief=reviewedBriefs.find(b=>b.kind===kind&&eligibleBrief(b,now)&&b.id!==prior?.m?.briefId);if(!brief)return;
 const r=await sendWhatsAppText(u.phone,formatBrief(brief));if(!r.delivered)return;await tx.insert(auditLogsTable).values({actorUserId:p.userId!,action:'trade_brief_sink_delivered',entityType:'user',entityId:p.userId!,createdAt:now,metadata:{kind,briefId:brief.id,source:brief.source,synthetic:true}});recorded++;});
 }return {disabled:false,recorded};
}
