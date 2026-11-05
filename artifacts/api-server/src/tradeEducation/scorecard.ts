/** First reply after an unanswered inbound message, within the same deal. Back-to-back
 * messages form one turn. No cross-deal joins, wall-clock business-hour promises or ratings. */
export function sellerResponseSummary(rows:Array<{dealId:string;sender:string;receiver:string;at:Date}>,seller:string,start:Date,end:Date){
 const sorted=[...rows].sort((a,b)=>a.at.getTime()-b.at.getTime()),pending=new Map<string,number>(),samples:number[]=[];let inboundTurns=0;
 for(const r of sorted){const at=r.at.getTime();if(at<start.getTime()||at>=end.getTime()||!Number.isFinite(at))continue;
  if(r.receiver===seller&&r.sender!==seller){if(!pending.has(r.dealId)){pending.set(r.dealId,at);inboundTurns++;}}
  else if(r.sender===seller&&r.receiver!==seller&&pending.has(r.dealId)){const delay=at-pending.get(r.dealId)!;if(delay>=0){samples.push(delay);pending.delete(r.dealId);}}
 }
 samples.sort((a,b)=>a-b);const n=samples.length;return {inboundTurns,answeredTurns:n,unansweredTurns:pending.size,medianReplyMinutes:n?Math.round((n%2?samples[(n-1)/2]:(samples[n/2-1]+samples[n/2])/2)/60000):null,basis:'First successfully relayed reply to each successfully relayed inbound turn on the same deal in this UTC month. Calendar minutes, not working hours. Boundary-crossing replies and unrelayed messages, admin messages and messages outside UDC are excluded.',notice:'Private activity summary, not a seller rating, delivery record or comparison with other sellers.'};
}
