type RecordedRequest={kind:string;status:string;note?:string|null};
/** Keep the queue-only caveat in the same bounded reply as the status. */
export function tradeAssistStatusText(dealNumber:string,requests:RecordedRequest[]){
 const shown=requests.slice(0,5);
 const lines=shown.map(r=>`${r.kind.slice(0,40)}: ${r.status.slice(0,40)}${r.note?' - '+r.note.slice(0,400)+(r.note.length>400?' [note shortened; ask UDC for the full review]':''):''}`);
 return `${dealNumber.slice(0,80)}: your latest recorded help requests.\n${lines.join('\n')||'No help requests recorded for you on this deal.'}\nRecorded queue status only. This does not confirm that a person has been contacted, an issue has been physically resolved, or a seller, order, payment or agreement has changed.`;
}
