import {and,eq,sql,desc} from 'drizzle-orm';
import {db,dealsTable,buyerRequestsTable,usersTable,auditLogsTable} from '@workspace/db';
import {buyerContextDraft,requestAllowed,type AssistKind} from './tradeAssist';
export async function saveTradeAssistRequest(u:{id:string;role:string},id:string,kind:AssistKind,reason?:string,expectedPhone?:string){
 if(process.env.UDC_APP_ENV!=='staging')return {error:404};
 return await db.transaction(async tx=>{
   await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'assist:'+u.id+':'+id+':'+kind}))`);
   const [currentUser]=await tx.select({status:usersTable.status,role:usersTable.role,phone:usersTable.phone}).from(usersTable).where(eq(usersTable.id,u.id)).limit(1).for('share');
   if(!currentUser||currentUser.status!=='verified'||currentUser.role!==u.role||(expectedPhone!==undefined&&currentUser.phone!==expectedPhone))return {error:403};
   const [deal]=await tx.select().from(dealsTable).where(and(eq(dealsTable.id,id),eq(u.role==='buyer'?dealsTable.buyerUserId:dealsTable.sellerUserId,u.id))).limit(1).for('share');
   if(!deal)return {error:404};
   if(!requestAllowed(kind,u.role,deal.status))return {error:409};
   const action='trade_assist_'+kind;
   const [prior]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.actorUserId,u.id),eq(auditLogsTable.entityId,id),eq(auditLogsTable.action,action))).limit(1);
   if(prior){const [review]=await tx.select({metadata:auditLogsTable.metadata}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'trade_assist_review_recorded'),sql`${auditLogsTable.metadata}->>'requestId'=${prior.id}`)).orderBy(desc(auditLogsTable.createdAt)).limit(1);return {requestId:prior.id,repeated:true,status:String(review?.metadata?.status||'awaiting_human_review')};}
   let buyerDraft;
   if(['repeat_order','switch_seller','backup_seller'].includes(kind)){
    if(!deal.buyerRequestId)return {error:409};
    const [request]=await tx.select().from(buyerRequestsTable).where(and(eq(buyerRequestsTable.id,deal.buyerRequestId),eq(buyerRequestsTable.buyerUserId,u.id))).limit(1).for('share');
    if(!request)return {error:409};
    buyerDraft=buyerContextDraft(request);
   }
   const [saved]=await tx.insert(auditLogsTable).values({actorUserId:u.id,action,entityType:'deal',entityId:id,metadata:{state:'awaiting_human_review',...(reason?{reason:reason}:{}),...(buyerDraft?{buyerDraft}:{}),noCounterpartyTransfer:true,noCommitment:true}}).returning({id:auditLogsTable.id});
   return {requestId:saved.id,repeated:false,status:'awaiting_human_review'};
  });
}
