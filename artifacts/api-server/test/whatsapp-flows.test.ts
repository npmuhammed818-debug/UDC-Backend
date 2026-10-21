import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile,unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

test('Meta Flow provisioning publishes validated assets and never advertises failed forms',async()=>{
  const state:any={audits:[]};(globalThis as any).__flowPublishFixture=state;
  const output=fileURLToPath(new URL(`./flow-publish-${randomUUID()}.mjs`,import.meta.url));
  const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/whatsapp/setupFlows.ts',import.meta.url))],platform:'node',format:'esm',bundle:true,packages:'external',write:false,plugins:[{name:'flow-publish-fixture',setup(b){b.onResolve({filter:/^@workspace\/db$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/^drizzle-orm$/},()=>({path:'orm',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='db'?"const s=globalThis.__flowPublishFixture;export const auditLogsTable={};export const db={insert:()=>({values:async v=>s.audits.push(v)}),select:()=>({from:()=>({where:()=>({orderBy:()=>({limit:async()=>[]})})})})};":"export const eq=()=>null;export const and=()=>null;export const desc=()=>null;export const sql=()=>null;"}));}}]});
  await writeFile(output,bundle.outputFiles[0].text);
  const previousFetch=globalThis.fetch,previousToken=process.env.WHATSAPP_ACCESS_TOKEN,previousWaba=process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  try{
    const m=await import(output);
    delete process.env.WHATSAPP_ACCESS_TOKEN;assert.equal((await m.provisionChatFlows()).reason,'waba_credentials_missing');
    process.env.WHATSAPP_ACCESS_TOKEN='synthetic-flow-token';process.env.WHATSAPP_BUSINESS_ACCOUNT_ID='987';
    let mode='create',counter=0;const statuses:any={};let calls:any[]=[];
    globalThis.fetch=async(url,init)=>{
      const path=String(url);calls.push({path,method:init?.method});assert.equal((init?.headers as any).authorization,'Bearer synthetic-flow-token');assert.ok(init?.signal);
      if(mode==='provider_error')return new Response('{"error":{"code":10,"message":"secret-provider-detail"}}',{status:403});
      if(path.includes('/987/flows?'))return Response.json({data:mode==='existing'?[{id:'101',name:'UDC_Chat_Profile_v1',status:'PUBLISHED'},{id:'102',name:'UDC_Buyer_Requirement_v1',status:'PUBLISHED'},{id:'103',name:'UDC_Seller_Offer_v1',status:'PUBLISHED'},{id:'104',name:'UDC_Agent_Profile_v1',status:'PUBLISHED'}]:[]});
      if(path.endsWith('/987/flows')){const id=String(101+counter++);statuses[id]='DRAFT';assert.equal((init!.body as URLSearchParams).get('categories'),'["OTHER"]');return Response.json({id});}
      const id=path.match(/\/(\d+)(?:\/|\?)/)?.[1];
      if(path.endsWith('/assets')){
        const body=init!.body as FormData;assert.equal(body.get('asset_type'),'FLOW_JSON');const file=body.get('file') as Blob;const definition=JSON.parse(await file.text());assert.equal(definition.screens[0].terminal,true);assert.equal(definition.screens[0].layout.children[0].children.at(-1)['on-click-action'].name,'complete');
        return Response.json(mode==='schema_error'?{success:true,validation_errors:[{error:'Synthetic invalid field',error_type:'SCHEMA_ERROR',line_start:1}]}:{success:true,validation_errors:[]});
      }
      if(path.endsWith('/publish')){if(id)statuses[id]='PUBLISHED';return Response.json({success:true});}
      return Response.json({id,status:mode==='existing'?'PUBLISHED':statuses[id!]});
    };
    const result=await m.provisionChatFlows();assert.equal(result.status,'ready');assert.equal(result.results.length,4);assert.equal(state.audits.length,4);assert.ok(state.audits.every((a:any)=>a.metadata.status==='PUBLISHED'));
    mode='existing';calls=[];state.audits=[];await m.provisionChatFlows();assert.ok(calls.every(c=>c.method==='GET'));assert.equal(state.audits.length,4);
    mode='schema_error';counter=0;calls=[];state.audits=[];await assert.rejects(m.provisionChatFlows(),/schema_rejected_profile/);assert.ok(!calls.some(c=>c.path.endsWith('/publish')));assert.equal(state.audits.filter((a:any)=>a.action==='whatsapp_flow_published').length,0);assert.equal(state.audits[0].action,'whatsapp_flow_validation_failed');
    mode='provider_error';await assert.rejects(m.provisionChatFlows(),{message:'meta_flow_http_403_code_10'});
    assert.equal(await m.publishedFlowId('buyer'),null);
  }finally{await unlink(output);delete (globalThis as any).__flowPublishFixture;globalThis.fetch=previousFetch;if(previousToken===undefined)delete process.env.WHATSAPP_ACCESS_TOKEN;else process.env.WHATSAPP_ACCESS_TOKEN=previousToken;if(previousWaba===undefined)delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;else process.env.WHATSAPP_BUSINESS_ACCOUNT_ID=previousWaba;}
});
