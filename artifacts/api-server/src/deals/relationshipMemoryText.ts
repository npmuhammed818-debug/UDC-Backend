export function relationshipMemoryText(result:{dealNumber:string;priorRecordedDeals:number;priorRecordedCompletions:number;notice:string}){
 return `${result.dealNumber}: ${result.priorRecordedDeals} prior recorded deals with this same party; ${result.priorRecordedCompletions} with a recorded completion transition.\n${result.notice}`;
}
