/** A recorded transition is evidence of a recorded status change, never proof
 * of actual delivery/payment or performance. Deduplicate same-deal completions. */
export function completionEvidence(rows:Array<{dealId:string;at:Date;metadata:Record<string,unknown>|null}>,start:Date,end:Date){
 const byDeal=new Map<string,{dealId:string;at:Date}>();let malformed=0;
 for(const r of rows){if(r.metadata?.newStatus!=='completed')continue;if(typeof r.metadata.previousStatus!=='string'||!['initiated','negotiation','verification','loi','icpo','fco_sco','contract','banking','inspection','loading','shipment','delivery','payment','commission','on_hold','cancelled','rejected','disputed'].includes(r.metadata.previousStatus)||!Number.isFinite(r.at.getTime())||r.metadata.previousStatus==='completed'||r.at<start||r.at>=end||!r.dealId){malformed++;continue;}const p=byDeal.get(r.dealId);if(!p||r.at<p.at)byDeal.set(r.dealId,{dealId:r.dealId,at:r.at});}
 return {records:[...byDeal.values()].sort((a,b)=>a.at.getTime()-b.at.getTime()),ignored:malformed,basis:'One recorded transition into completed per deal in the UTC month. Audit records can be incomplete. This is not proof of physical delivery, payment receipt, quality or financial savings.'};
}
