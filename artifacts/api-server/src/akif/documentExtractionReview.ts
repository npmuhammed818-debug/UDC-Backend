/** Extraction is source material, never evidence of authenticity or approval.
 * Any reported limitation or vision/OCR source stays for human review. */
export function documentExtractionReview(text:string,warnings:string[]){
 const normalized=[...new Set(warnings.filter(w=>typeof w==='string'&&w.trim()).map(w=>w.slice(0,160)))];
 if(!text.trim())normalized.push('extracted_text_empty');
 if(/\[UNREADABLE\]/i.test(text))normalized.push('document_has_unreadable_text');
 return {status:normalized.length?'needs_review' as const:'completed' as const,warnings:[...new Set(normalized)]};
}
export function parseDocumentExtractionObject(raw:string):Record<string,unknown>{
 const value=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 // Do not fish an object out of prose or accept a root array/scalar.
 const data:unknown=JSON.parse(value);
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('document_ai_invalid_object');
 return data as Record<string,unknown>;
}
