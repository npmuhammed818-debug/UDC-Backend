import {currentEmailAccountConsent} from '../channels/emailAccount';
import {and,eq,gte,lt,or,desc,sql} from 'drizzle-orm';
import {db,usersTable,dealConversationEventsTable,dealsTable,auditLogsTable,notificationPreferencesTable} from '@workspace/db';
import {sellerResponseSummary} from '../tradeEducation/scorecard';
import {sendWhatsAppText} from './client';
export async function handleSellerScorecard(phone:string,text:string){
 if(process.env.UDC_APP_ENV!=='staging'||!/^my scorecard(?: \d{4}-(?:0[1-9]|1[0-2]))?$/i.test(text.trim()))return false;
 const [user]=await db.select({id:usersTable.id,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 if(!user||user.role!=='seller'||user.status!=='verified'){await sendWhatsAppText(phone,'Your private seller scorecard needs a verified seller account.');return true;}
 const month=text.trim().split(/\s+/)[2]||new Date().toISOString().slice(0,7),start=new Date(month+'-01T00:00:00Z'),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
 if(start.getTime()>Date.now()){await sendWhatsAppText(phone,'Choose the current or a past UTC month. No future activity is reported.');return true;}
 const body=await sellerScorecardBody(user.id,month,start,end);await sendWhatsAppText(phone,body||'There are too many records for a reliable scorecard summary. Ask UDC for a reviewed report.');return true;
}

async function sellerScorecardBody(userId:string,month:string,start:Date,end:Date){
 const events=await db.select({dealId:dealConversationEventsTable.dealId,sender:dealConversationEventsTable.userId,role:dealConversationEventsTable.participantRole,at:dealConversationEventsTable.createdAt,buyerId:dealsTable.buyerUserId}).from(dealConversationEventsTable).innerJoin(dealsTable,eq(dealsTable.id,dealConversationEventsTable.dealId)).where(and(eq(dealsTable.sellerUserId,userId),eq(dealConversationEventsTable.relayed,true),or(eq(dealConversationEventsTable.participantRole,'buyer'),eq(dealConversationEventsTable.participantRole,'seller')),gte(dealConversationEventsTable.createdAt,start),lt(dealConversationEventsTable.createdAt,end))).limit(10001);
 const rows=events.filter(r=>r.role==='seller'?r.sender===userId:r.sender===r.buyerId).map(r=>({dealId:r.dealId,sender:r.sender,receiver:r.role==='seller'?r.buyerId:userId,at:r.at}));
 if(events.length>10000)return null;
 const r=sellerResponseSummary(rows,userId,start,end);return `Your private seller scorecard, ${month} (UTC): ${r.answeredTurns} answered turns, ${r.unansweredTurns} unanswered turns. ${r.medianReplyMinutes===null?'Not enough reply data for a median.':'Median first reply: '+r.medianReplyMinutes+' calendar minutes.'}\n${r.basis}\n${r.notice}\nTip: acknowledge a buyer question when you can, and say when you can give a full answer. No buyer preference or competitor benchmark is guessed.`;
}
const monthlySafe=()=>process.env.UDC_APP_ENV==='staging'&&process.env.AKIF_WHATSAPP_REPLY_SINK==='store';
export async function handleMonthlyScorecard(phone:string,text:string){
 const m=/^monthly scorecard (on|off)$/i.exec(text.trim());if(!m||!monthlySafe())return false;
 const [u]=await db.select({id:usersTable.id,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);if(!u||u.status!=='verified'||u.role!=='seller'||!await currentEmailAccountConsent(u.id)){await sendWhatsAppText(phone,'Monthly scorecards need your verified seller account and current privacy consent.');return true;}
 const enabled=m[1].toLowerCase()==='on';await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'seller_scorecard:'+u.id}))`);await tx.insert(auditLogsTable).values({actorUserId:u.id,action:'seller_scorecard_preference',entityType:'user',entityId:u.id,createdAt:sql`clock_timestamp()`,metadata:{enabled}});});await sendWhatsAppText(phone,enabled?'Monthly private scorecard is on for this synthetic staging test. Only the last closed UTC month is summarized. No ratings or competitor benchmarks. Send monthly scorecard off to stop.':'Monthly private scorecard is off.');return true;
}
/** Explicit QA scan only. No timer, real provider or automatic subscription. */
export async function runMonthlyScorecards(now=new Date()){
 if(!monthlySafe())return {disabled:true,recorded:0};if(!Number.isFinite(now.getTime()))throw Error('invalid_time');const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)),start=new Date(end);start.setUTCMonth(start.getUTCMonth()-1);const month=start.toISOString().slice(0,7);let recorded=0;
 const prefs=await db.selectDistinctOn([auditLogsTable.actorUserId]).from(auditLogsTable).where(eq(auditLogsTable.action,'seller_scorecard_preference')).orderBy(auditLogsTable.actorUserId,desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(101);if(prefs.length>100)throw Error('scorecard_batch_requires_review');
 for(const p of prefs){if(!p.actorUserId||p.metadata?.enabled!==true)continue;await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'seller_scorecard:'+p.actorUserId}))`);
 const [latest]=await tx.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'seller_scorecard_preference'),eq(auditLogsTable.actorUserId,p.actorUserId!))).orderBy(desc(auditLogsTable.createdAt),desc(auditLogsTable.id)).limit(1);if(latest?.metadata?.enabled!==true)return;
 const [u]=await tx.select({phone:usersTable.phone,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,p.actorUserId!)).limit(1);if(!u?.phone||u.role!=='seller'||u.status!=='verified'||!await currentEmailAccountConsent(p.actorUserId!))return;
 const [global]=await tx.select({optional:notificationPreferencesTable.optionalWhatsApp,announcements:notificationPreferencesTable.announcements}).from(notificationPreferencesTable).where(eq(notificationPreferencesTable.userId,p.actorUserId!)).limit(1);if(global&&(global.optional===false||global.announcements===false))return;
 const [prior]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'seller_scorecard_sink_delivered'),eq(auditLogsTable.actorUserId,p.actorUserId!),sql`${auditLogsTable.metadata}->>'month'=${month}`)).limit(1);if(prior)return;
 const body=await sellerScorecardBody(p.actorUserId!,month,start,end);if(!body)return;const sent=await sendWhatsAppText(u.phone,body);if(sent.delivered){await tx.insert(auditLogsTable).values({actorUserId:p.actorUserId!,action:'seller_scorecard_sink_delivered',entityType:'user',entityId:p.actorUserId!,metadata:{month,synthetic:true}});recorded++;}
 });}return {disabled:false,recorded};
}
