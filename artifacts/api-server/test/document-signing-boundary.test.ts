import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {randomUUID} from "node:crypto";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";

test("storage object ownership prevents signed links to other deals, companies or untrusted URLs",async()=>{
 const file=fileURLToPath(new URL(`./document-boundary-${randomUUID()}.mjs`,import.meta.url));
 const bundle=await build({
   stdin:{contents:"export * from '../src/supabase/documentAccessPath.ts';",
     resolveDir:fileURLToPath(new URL(".",import.meta.url))},
   platform:"node",format:"esm",write:false,bundle:true,packages:"external",
 });
 await writeFile(file,bundle.outputFiles[0].text);
 try{
   const {managedDealDocumentPath:deal,managedCompanyDocumentPath:company}=await import(file);
   const dealA="11111111-1111-4111-8111-111111111111",dealB="22222222-2222-4222-8222-222222222222";
   const companyId="33333333-3333-4333-8333-333333333333";
   const base=`storage://udc-documents/deals/${dealA}/`;
   assert.equal(deal(base+"invoice.pdf",dealA),`deals/${dealA}/invoice.pdf`);
   assert.equal(deal(base+"drafts/loi-a.txt",dealA),`deals/${dealA}/drafts/loi-a.txt`);
   assert.equal(deal(base+"whatsapp/scan_2.pdf",dealA),`deals/${dealA}/whatsapp/scan_2.pdf`);
   const cases=[
     "https://files.example.invalid/private.pdf",
     "https://signed.example/always-on-token",
     "storage://other-bucket/deals/"+dealA+"/a.pdf",
     "storage://udc-documents/identity-proof.pdf",
     "storage://udc-documents/deals/"+dealB+"/a.pdf",
     base+"../secret.pdf",
     base+"%2e%2e/secret.pdf",
     base+"a%2fb.pdf",
     base+"drafts//abc.pdf",
     base+"drafts/../../secret.pdf",
     base+"drafts/./abc.pdf",
     base+"abc.pdf?token=PRIVATE",
     base+"abc.pdf#private",
     base+"folder\\bad.pdf",
     base+"foo/",
     base+".",
     base+"..",
     base+"z".repeat(200)+".pdf",
   ];
   for(const ref of cases) assert.equal(deal(ref,dealA),null,`must reject unmanaged reference: ${ref}`);
   assert.equal(deal(base+"invoice.pdf",dealB),null);
   const companyRef=`storage://udc-documents/companies/${companyId}/passport.pdf`;
   assert.equal(company(companyRef,companyId),`companies/${companyId}/passport.pdf`);
   assert.equal(deal(companyRef,dealA),null,"trade counterparties must not open company ID proofs");
   assert.equal(company(base+"invoice.pdf",companyId),null);
   assert.equal(company(companyRef,dealA),null,"other company owner cannot sign identity proof");
   assert.equal(company(companyRef.replace("passport.pdf","../id.pdf"),companyId),null);
   assert.equal(company("https://private.example/id.pdf",companyId),null);
 } finally{await unlink(file);}
});
