import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile,unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('company screening is private, bounded and assistive; model output cannot verify a company',async()=>{
 const key='__companyScreeningFixture',state:any={text:'Synthetic company registration',calls:0,output:{companyName:'Example Ltd',registrationNumber:'ABC123',country:'India',confidence:0.8,observations:[]}};(globalThis as any)[key]=state;
 const output=fileURLToPath(new URL('./company-screening-'+randomUUID()+'.mjs',import.meta.url));
 const bundle=await build({stdin:{contents:"export * from '../src/akif/companyScreening';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'screening-boundaries',setup(b){
  b.onResolve({filter:/documentExtractorClient$/},()=>({path:'extractor',namespace:'fixture'}));b.onResolve({filter:/intelligence\/hermesClient$/},()=>({path:'model',namespace:'fixture'}));b.onResolve({filter:/supabase\/storage$/},()=>({path:'storage',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='extractor'?`export const extractDocumentBytes=async()=>({text:globalThis.${key}.text});`:args.path==='model'?`export const runConversationChat=async()=>{const s=globalThis.${key};s.calls++;return {content:JSON.stringify(s.output)}};`:'export const parseStoragePath=x=>x.startsWith("storage://private/")?x.slice(18):null;export const downloadDocumentBytes=async()=>({bytes:Buffer.from("%PDF-synthetic-evidence"),contentType:"application/pdf"});'}));
 }}]});
 await writeFile(output,bundle.outputFiles[0].text);
 try{
  const {screenCompanyEvidence}=await import(output);const company={companyName:'Example Ltd',registrationNumber:'ABC123',country:'India'},doc={companyId:'company',fileUrl:'storage://private/companies/company/evidence.pdf'};
  await assert.rejects(screenCompanyEvidence({...doc,fileUrl:'https://untrusted.example/evidence.pdf'},company),/private_company/);assert.equal(state.calls,0);
  const report=await screenCompanyEvidence(doc,company);assert.equal(report.authenticityVerified,false);assert.equal(report.status,'needs_human_review');assert.ok(report.comparisons.every((c:any)=>c.result==='matches_profile'));
  state.output.registrationNumber='OTHER';const conflict=await screenCompanyEvidence(doc,company);assert.equal(conflict.comparisons.find((c:any)=>c.field==='registrationNumber').result,'manual_comparison_required');
  state.output.verified=true;await assert.rejects(screenCompanyEvidence(doc,company));delete state.output.verified;
  state.text='';const before=state.calls;const empty=await screenCompanyEvidence(doc,company);assert.equal(state.calls,before);assert.equal(empty.authenticityVerified,false);assert.equal(empty.confidence,0);
 }finally{await unlink(output);delete (globalThis as any)[key];}
});
