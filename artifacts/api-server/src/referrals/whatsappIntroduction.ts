import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db, usersTable, referralsTable, auditLogsTable } from '@workspace/db';
import { sendWhatsAppInteractive, sendWhatsAppText } from '../whatsapp/client';
import { agentReferralCode } from './invitation';

export async function handleWhatsAppIntroduction(phone:string,message:{text?:{body?:string};interactive?:{button_reply?:{id?:string}}}){
 const code=/^referral\s+UDC-([a-f0-9-]{8,36})$/i.exec(message.text?.body?.trim()??'');
 const button=/^udc:referral:(accept|decline):([a-f0-9-]{36})$/.exec(message.interactive?.button_reply?.id??'');
 if(!code&&!button)return false;
 const [user]=await db.select().from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 if(!user||!['buyer','seller'].includes(user.role)||['suspended','rejected'].includes(user.status)){
  await sendWhatsAppText(phone,'Register as a buyer or seller from Menu first, then send the referral code here.');return true;
 }
 if(code){
  const normalized=code[1].replaceAll('-','').toLowerCase();
  const candidates=normalized.length===32
   ? await db.select().from(usersTable).where(and(eq(usersTable.id,code[1].toLowerCase()),eq(usersTable.role,'agent'),eq(usersTable.status,'verified'))).limit(2)
   : await db.select().from(usersTable).where(and(sql`${usersTable.id}::text LIKE ${normalized+'%'}`,eq(usersTable.role,'agent'),eq(usersTable.status,'verified'))).limit(2);
  const agent=candidates.length===1?candidates[0]:undefined;
  if(!agent||agent.id===user.id){await sendWhatsAppText(phone,candidates.length>1?'That referral code is ambiguous. Ask the agent to share their current code.':'That verified agent referral is unavailable.');return true;}
  const [existing]=await db.select({id:referralsTable.id}).from(referralsTable).where(eq(referralsTable.referredUserId,user.id)).limit(1);
  if(existing){await sendWhatsAppText(phone,'An introduction is already recorded for your account. Ask UDC to review any correction.');return true;}
  const id=randomUUID();await db.insert(auditLogsTable).values({id,actorUserId:user.id,action:'whatsapp_referral_requested',entityType:'user',entityId:user.id,metadata:{agentUserId:agent.id,expiresAt:new Date(Date.now()+24*60*60_000).toISOString()}});
  await sendWhatsAppInteractive(phone,{type:'button',body:{text:`Did ${agent.fullName||'this verified agent'} introduce you to UDC? Confirm only if you want this introduction recorded for UDC review. This does not agree any commission or give access to your private documents.`},action:{buttons:[{type:'reply',reply:{id:'udc:referral:accept:'+id,title:'Confirm introduction'}},{type:'reply',reply:{id:'udc:referral:decline:'+id,title:'No thanks'}}]}});return true;
 }
 const reply=await db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'referral:'+user.id}))`);
  const [request]=await tx.select().from(auditLogsTable).where(and(eq(auditLogsTable.id,button![2]),eq(auditLogsTable.actorUserId,user.id),eq(auditLogsTable.action,'whatsapp_referral_requested'))).limit(1);
  const metadata=request?.metadata as any;
  if(!metadata||Date.parse(metadata.expiresAt)<=Date.now())return 'That introduction request expired or is unavailable.';
  const [decision]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.entityId,request.id),eq(auditLogsTable.action,'whatsapp_referral_decided'))).limit(1);
  if(decision)return 'Your introduction decision is already recorded.';
  const [current]=await tx.select().from(usersTable).where(eq(usersTable.id,user.id)).limit(1);
  const [agent]=await tx.select().from(usersTable).where(and(eq(usersTable.id,metadata.agentUserId),eq(usersTable.role,'agent'),eq(usersTable.status,'verified'))).limit(1);
  if(!current||!['buyer','seller'].includes(current.role)||['suspended','rejected'].includes(current.status)||!agent)return 'This introduction needs UDC review.';
  const [existing]=await tx.select({id:referralsTable.id}).from(referralsTable).where(eq(referralsTable.referredUserId,user.id)).limit(1);
  if(existing)return 'An introduction is already recorded. UDC must review corrections.';
  const accept=button![1]==='accept';
  if(accept)await tx.insert(referralsTable).values({agentUserId:agent.id,referredUserId:user.id,referralCode:agentReferralCode(agent.id),status:'pending'});
  await tx.insert(auditLogsTable).values({actorUserId:user.id,entityType:'referral_request',entityId:request.id,action:'whatsapp_referral_decided',metadata:{accepted:accept,agentUserId:agent.id,requiresAdminReview:true}});
  return accept?'Your introduction is recorded for UDC review. No commission or private deal access is agreed automatically.':'No introduction was added.';
 },{isolationLevel:'serializable'});
 await sendWhatsAppText(phone,reply);return true;
}
