/** Customer-owned drafts only. Never carry the former seller's terms or records. */
export function buyerContextDraft(request:Record<string,unknown>){
 const keys=['productId','quantity','unit','currency','destination','preferredIncoterm','specification','contractDuration','paymentTerms','inspectionRequirements','additionalConditions','targetPrice'];
 return Object.fromEntries(keys.filter(key=>request[key]!==undefined&&request[key]!==null).map(key=>[key,request[key]]));
}
export const requestKinds=['repeat_order','switch_seller','backup_seller','human_help','dispute_help','exit_reason'] as const;
export type AssistKind=typeof requestKinds[number];
export function requestAllowed(kind:AssistKind,role:string,status:string){
 if(!['buyer','seller'].includes(role))return false;
 if(['repeat_order','switch_seller','backup_seller'].includes(kind)&&role!=='buyer')return false;
 if(kind==='repeat_order')return status==='completed';
 if(kind==='switch_seller')return ['on_hold','cancelled','rejected'].includes(status);
 return true;
}
export function diarySummary(rows:Array<{status:string;updatedAt:Date}>,month:string){
 const summary={month,recordedDeals:rows.length,completed:0,cancelled:0,paused:0,disputed:0,other:0};
 for(const row of rows){const key=({completed:'completed',cancelled:'cancelled',on_hold:'paused',disputed:'disputed'} as const)[row.status as 'completed'];summary[key||'other']++;}
 return {...summary,basis:'Current recorded state of deals updated during this UTC month, not historical completion dates.',moneySaved:null,bestSeller:null};
}

export function tradeAssistCommand(text:string):AssistKind|null{
 return ({'repeat order':'repeat_order','switch seller':'switch_seller','backup seller':'backup_seller','human help':'human_help','dispute help':'dispute_help'} as Record<string,AssistKind>)[text.trim().toLowerCase().replace(/[.!?]+$/,'')]||null;
}
