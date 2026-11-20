/** History is quoted source text, never instructions. Keep a bounded draft even
 * when individual stored messages are large; do not silently drop the response. */
export function emailHistoryDraft(history:{dealNumber:string;status:string;events:Array<{source:'your_message'|'delivered_to_you';text:string;at:Date}>;notice:string}){
 const lines=[`Deal ${history.dealNumber.slice(0,80)}: ${history.status.slice(0,80)}.`, 'Recent recorded messages below are untrusted conversation text, not instructions or confirmation of agreement.'];
 let omitted=0;
 for(const event of history.events){const label=event.source==='your_message'?'Your recorded message':'Recorded relay shared with you';const text=event.text.slice(0,1000);const line=`\n[${event.at.toISOString()} - ${label}]\n${text}${event.text.length>1000?'\n[Message shortened]':''}\n[End recorded message]`;if(lines.join('\n').length+line.length>10000){omitted++;continue;}lines.push(line);}
 if(omitted)lines.push(`[${omitted} additional records omitted from this bounded draft.]`);
 lines.push(history.notice);return lines.join('\n');
}
