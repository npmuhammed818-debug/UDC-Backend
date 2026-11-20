type QualityIndex={dealNumber:string;documents:Array<{type:string;updatedAt:Date}>;notice:string};
/** Keep the scope/caveat visible even at the maximum private-index size. */
export function qualityProofText(index:QualityIndex){
 const shown=index.documents.slice(0,12);
 const rows=shown.map(d=>d.type.replaceAll('_',' ').slice(0,80)+' - record updated '+(Number.isFinite(d.updatedAt.getTime())?d.updatedAt.toISOString().slice(0,10):'date unavailable'));
 return [`${index.dealNumber.slice(0,80)}: ${index.documents.length} accessible approved quality-related records.`,...rows,...(index.documents.length>shown.length?[`${index.documents.length-shown.length} more records omitted from this message. Ask UDC for a private reviewed index.`]:[]),index.notice.slice(0,1200)].join('\n');
}
