import {db,auditLogsTable,commissionsTable,dealsTable,dealParticipantsTable,usersTable,notificationsTable} from '@workspace/db';
import {and,eq,desc,sql} from 'drizzle-orm';import {calculateCommissionAmount} from './commissionAmount.ts';import {commissionAmountFitsStorage} from './currencyPrecision.ts';
export class ProposalError extends Error{}
export type ProposalTx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function prepareCommissionProposals(tx:ProposalTx,dealId:string){
 await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'commission_proposals:'+dealId}))`);
 const [deal]=await tx.select().from(dealsTable).where(eq(dealsTable.id,dealId)).limit(1);if(!deal||deal.status!=='completed')return [];
 const terms=await tx.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityType,'deal'),eq(auditLogsTable.entityId,dealId),eq(auditLogsTable.action,'commission_terms_agreed'))).orderBy(desc(auditLogsTable.createdAt));
 const proposals=[];const seen=new Set<string>();
 for(const record of terms){const rule=record.metadata as any;if(!rule?.beneficiaryUserId||seen.has(rule.beneficiaryUserId))continue;seen.add(rule.beneficiaryUserId);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'commission:'+dealId+':'+rule.beneficiaryUserId}))`);
  const [existing]=await tx.select({id:auditLogsTable.id}).from(auditLogsTable).where(and(eq(auditLogsTable.action,'commission_proposal_prepared'),eq(auditLogsTable.entityId,record.id))).limit(1);if(existing)continue;
  const [owed]=await tx.select({id:commissionsTable.id}).from(commissionsTable).where(and(eq(commissionsTable.dealId,dealId),eq(commissionsTable.beneficiaryUserId,rule.beneficiaryUserId))).limit(1);if(owed)continue;
  const amount=calculateCommissionAmount({method:rule.method,quantity:deal.quantity,unit:deal.unit,agreedPrice:deal.agreedPrice,rate:rule.rate,amount:rule.amount,currency:rule.currency});if(!commissionAmountFitsStorage(amount))throw new ProposalError('commission_precision_exceeds_storage');
  const [proposal]=await tx.insert(auditLogsTable).values({actorUserId:null,action:'commission_proposal_prepared',entityType:'commission_proposal',entityId:record.id,metadata:{dealId,termsRecordId:record.id,beneficiaryUserId:rule.beneficiaryUserId,method:rule.method,rate:rule.rate??null,amount,currency:rule.currency,quantity:deal.quantity,unit:deal.unit,agreedPrice:deal.agreedPrice,status:'awaiting_human_approval',notLiability:true}}).returning();proposals.push(proposal);
 }return proposals;
}
export async function approveCommissionProposal(proposalId:string,adminId:string){return db.transaction(async tx=>{
 const [proposal]=await tx.select().from(auditLogsTable).where(and(eq(auditLogsTable.id,proposalId),eq(auditLogsTable.action,'commission_proposal_prepared'))).limit(1);if(!proposal)throw new ProposalError('proposal_not_found');const p=proposal.metadata as any;
 await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'commission_proposals:'+p.dealId}))`);
 await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'commission:'+p.dealId+':'+p.beneficiaryUserId}))`);
 const [deal]=await tx.select().from(dealsTable).where(eq(dealsTable.id,p.dealId)).limit(1);if(!deal||deal.status!=='completed')throw new ProposalError('completed_deal_required');
 const rules=await tx.select().from(auditLogsTable).where(and(eq(auditLogsTable.entityType,'deal'),eq(auditLogsTable.entityId,p.dealId),eq(auditLogsTable.action,'commission_terms_agreed'))).orderBy(desc(auditLogsTable.createdAt));const rule=rules.find(r=>(r.metadata as any)?.beneficiaryUserId===p.beneficiaryUserId);if(!rule||rule.id!==p.termsRecordId)throw new ProposalError('commission_agreed_terms_changed');
 const amount=calculateCommissionAmount({method:p.method,quantity:deal.quantity,unit:deal.unit,agreedPrice:deal.agreedPrice,rate:p.rate??undefined,amount:p.amount,currency:p.currency});if((p.method!=='fixed_amount'&&deal.currency.toUpperCase()!==p.currency)||amount!==p.amount||deal.quantity!==p.quantity||deal.unit!==p.unit||deal.agreedPrice!==p.agreedPrice)throw new ProposalError('commission_deal_terms_changed');if(!commissionAmountFitsStorage(amount))throw new ProposalError('commission_precision_exceeds_storage');
 const [user]=await tx.select().from(usersTable).where(eq(usersTable.id,p.beneficiaryUserId)).limit(1);if(!user||['suspended','rejected'].includes(user.status))throw new ProposalError('beneficiary_unavailable');
 if(user.role==='agent'){const [assigned]=await tx.select({id:dealParticipantsTable.id}).from(dealParticipantsTable).where(and(eq(dealParticipantsTable.dealId,p.dealId),eq(dealParticipantsTable.userId,user.id),eq(dealParticipantsTable.participantRole,'agent'),eq(dealParticipantsTable.status,'active'))).limit(1);if(!assigned)throw new ProposalError('agent_must_be_assigned_to_deal');}
 const [existing]=await tx.select({id:commissionsTable.id}).from(commissionsTable).where(and(eq(commissionsTable.dealId,p.dealId),eq(commissionsTable.beneficiaryUserId,p.beneficiaryUserId))).limit(1);if(existing)throw new ProposalError('commission_already_recorded');
 const [commission]=await tx.insert(commissionsTable).values({dealId:p.dealId,beneficiaryUserId:p.beneficiaryUserId,amount,currency:p.currency,status:'pending',commissionType:p.method,commissionRate:p.rate??undefined,commissionAmount:amount}).returning();
 await tx.insert(auditLogsTable).values({actorUserId:adminId,action:'commission_proposal_approved',entityType:'commission_proposal',entityId:proposal.id,metadata:{commissionId:commission.id,termsRecordId:p.termsRecordId,dealId:p.dealId,amount,currency:p.currency,humanApproved:true}});
 await tx.insert(notificationsTable).values({userId:p.beneficiaryUserId,type:'commission_created',title:'Commission recorded',body:`A ${p.currency} ${amount} commission was approved for your completed deal. This is not a bank payment.`,link:'/commissions'});return commission;
});}
