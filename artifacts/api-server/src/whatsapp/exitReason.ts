import {and,eq,sql} from 'drizzle-orm';
import {db,usersTable,dealsTable,auditLogsTable} from '@workspace/db';
import {saveTradeAssistRequest} from '../deals/tradeAssistRepository';
import {sendWhatsAppInteractive,sendWhatsAppText} from './client';
const reasons=['price','delay','trust','quality','terms','other','skip'] as const;
export function exitReasonChoice(id:string){const m=/^udc:exit:([0-9a-f-]{36}):(price|delay|trust|quality|terms|other|skip)$/.exec(id);return m?{dealId:m[1],reason:m[2]}:null;}
export async function promptExitReason(phone:string,dealId:string){if(process.env.UDC_APP_ENV!=='staging')return;await sendWhatsAppInteractive(phone,{type:'list',body:{text:'Optional: why did you close this deal? Your answer is private to UDC review, not sent to the other party. You can skip.'},action:{button:'Choose or skip',sections:[{title:'Private exit reason',rows:reasons.map(reason=>({id:`udc:exit:${dealId}:${reason}`,title:reason==='skip'?'Skip':reason[0].toUpperCase()+reason.slice(1)}))}]}});}
export async function handleExitReason(phone:string,id:string){
 if(process.env.UDC_APP_ENV!=='staging')return false;const c=exitReasonChoice(id);if(!c)return false;
 const [u]=await db.select({id:usersTable.id,status:usersTable.status,role:usersTable.role}).from(usersTable).where(eq(usersTable.phone,phone)).limit(1);
 if(!u||u.status!=='verified'||!['buyer','seller'].includes(u.role)){await sendWhatsAppText(phone,'That private exit question is not available for this account.');return true;}
 const [d]=await db.select({id:dealsTable.id}).from(dealsTable).where(and(eq(dealsTable.id,c.dealId),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,u.id),eq(dealsTable.status,'cancelled'))).limit(1);
 const [closed]=d?await db.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'deal_closed_by_party'),eq(auditLogsTable.actorUserId,u.id),eq(auditLogsTable.entityId,c.dealId))).limit(1):[];
 if(!closed){await sendWhatsAppText(phone,'That private exit question is not available for your closed deal.');return true;}
 if(c.reason==='skip'){
 await db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'exit_skip:'+u.id+':'+c.dealId}))`);const [prior]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_exit_reason_skipped'),eq(auditLogsTable.actorUserId,u.id),eq(auditLogsTable.entityId,c.dealId))).limit(1);if(!prior)await tx.insert(auditLogsTable).values({actorUserId:u.id,action:'trade_exit_reason_skipped',entityType:'deal',entityId:c.dealId,metadata:{private:true}});});await sendWhatsAppText(phone,'Skipped. No reason was sent to the other party.');return true;
 }
 const result=await saveTradeAssistRequest(u,c.dealId,'exit_reason',c.reason);await sendWhatsAppText(phone,'error'in result?'Your reason could not be saved. The deal is unchanged.':result.repeated?'Your earlier private answer is already recorded. It was not sent to the other party.':'Your reason is saved privately for UDC review. It was not sent to the other party.');return true;
}
