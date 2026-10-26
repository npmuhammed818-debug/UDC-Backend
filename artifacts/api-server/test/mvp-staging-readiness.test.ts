import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {randomUUID} from "node:crypto";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";

test("admin staging readiness is read-only, fail-closed and secret-free",async()=>{
 const s={role:"admin",status:"verified",reads:0,dbError:false,rows:[]};
 globalThis.__mvpStageQa=s;
 const file=fileURLToPath(new URL(`./stage-qa-${randomUUID()}.mjs`,import.meta.url));
 const buildResult=await build({
   stdin:{contents:"import express from 'express';import router from '../src/routes/stagingReadiness.ts';export {buildMvpStagingReadiness,evaluateMvpEnvironment,requiredMvpTables} from '../src/release/mvpStagingReadiness.ts';const app=express();app.use((req,res,next)=>{const s=globalThis.__mvpStageQa;if(s.role)req.authUser={id:'qa',role:s.role,status:s.status};next()});app.use(router);export default app;",
     resolveDir:fileURLToPath(new URL(".",import.meta.url))},
   bundle:true,platform:"node",format:"esm",write:false,packages:"external",
   plugins:[{name:"readiness-fixture",setup(b){
     b.onResolve({filter:/^@workspace\/db$/},()=>({path:"db",namespace:"fixture"}));
     b.onResolve({filter:/^drizzle-orm$/},()=>({path:"orm",namespace:"fixture"}));
     b.onResolve({filter:/auth\/middleware$/},()=>({path:"auth",namespace:"fixture"}));
     b.onLoad({filter:/.*/,namespace:"fixture"},arg=>({loader:"js",contents:
       arg.path==="db"?"export const db={execute:async()=>{const s=globalThis.__mvpStageQa;s.reads++;if(s.dbError)throw Error('PRIVATE_POSTGRES_URL');return {rows:s.rows};}};":
       arg.path==="orm"?"export const sql=(parts,...values)=>({parts,values});":
       "export const requireRole=role=>(req,res,next)=>{if(!req.authUser){res.status(401).json({error:'authentication_required'});return;}if(req.authUser.status==='suspended'||req.authUser.role!==role){res.status(403).json({error:'insufficient_permissions'});return;}next();};",
     }));
   }}],
 });
 await writeFile(file,buildResult.outputFiles[0].text);
 let server;
 try{
   const lib=await import(file);
   const tables=lib.requiredMvpTables;
   assert.equal(tables.length,9);
   const allPresent=tables.map(table_name=>({table_name,rls_enabled:true}));
   s.rows=allPresent;
   const env={WHATSAPP_APP_SECRET:"PRIVATE_META_SECRET",WHATSAPP_ACCESS_TOKEN:"PRIVATE_TOKEN",
     WHATSAPP_PHONE_NUMBER_ID:"123",WHATSAPP_BUSINESS_ACCOUNT_ID:"456",
     RESEND_API_KEY:"PRIVATE_RESEND_KEY",UDC_AUTH_EMAIL_FROM:"otp@example.test",
     UDC_AUTH_EMAIL_VERIFIED_DOMAIN:"example.test",UDC_AUTH_EMAIL_TRANSPORT:"resend",
     UDC_AUTH_EMAIL_SEND_ENABLED:"true",UDC_WHATSAPP_WINDOW_EVIDENCE_ENABLED:"true",
     UDC_ETA_FOLLOWUPS_ENABLED:"true"};
   const checks=lib.evaluateMvpEnvironment(env);
   assert.equal(checks.find(x=>x.id==="email_provider").state,"configured");
   assert.equal(checks.find(x=>x.id==="whatsapp_credentials").state,"configured");
   assert.equal(checks.find(x=>x.id==="email_send_gate").state,"review_required");
   assert.equal(checks.find(x=>x.id==="shipment_send_gate").state,"disabled");
   assert.equal(checks.find(x=>x.id==="chat_typing_flag").state,"disabled");assert.equal(lib.evaluateMvpEnvironment({...env,UDC_WHATSAPP_TYPING:"on",UDC_WHATSAPP_REACTIONS:"on"}).filter(x=>x.id.startsWith("chat_")).every(x=>x.state==="configured"),true);
   assert.equal(lib.evaluateMvpEnvironment({...env,UDC_SHIPMENT_WHATSAPP_SEND_ENABLED:"true"}).find(x=>x.id==="shipment_send_gate").state,"review_required");
   assert.ok(!JSON.stringify(checks).includes("PRIVATE_"));
   let report=await lib.buildMvpStagingReadiness({env});
   assert.equal(report.schema.allPresentWithRls,true);
   assert.equal(report.launchReady,false);
   assert.equal(report.schemaVerified,false);
   assert.equal(report.stagingApproved,false);
   assert.equal(report.readOnly,true);
   s.rows=allPresent.slice(1).map((x,i)=>i===1?{...x,rls_enabled:false}:x);
   report=await lib.buildMvpStagingReadiness({env:{}});
   assert.equal(report.schema.allPresentWithRls,false);
   assert.equal(report.schema.objects[0].present,false);
   assert.equal(report.schema.objects[2].rlsEnabled,false);
   s.dbError=true;
   report=await lib.buildMvpStagingReadiness({env:{}});
   assert.equal(report.schema,null);
   assert.equal(report.launchReady,false);
   assert.equal(report.checks.at(-1).state,"unavailable");
   assert.ok(!JSON.stringify(report).includes("PRIVATE_POSTGRES_URL"));
   s.dbError=false;
   server=lib.default.listen(0,"127.0.0.1");
   await new Promise(resolve=>server.once("listening",resolve));
   const base=`http://127.0.0.1:${server.address().port}`;
   for(const [role,status,expected] of [[null,null,401],["buyer","verified",403],["seller","verified",403],
     ["agent","verified",403],["admin","suspended",403]]){
     s.role=role;s.status=status;
     const before=s.reads;
     const res=await fetch(base+"/admin/release/staging-readiness");
     assert.equal(res.status,expected);
     assert.equal(s.reads,before,"non-admin cannot query Postgres");
   }
   s.role="admin";s.status="verified";
   const res=await fetch(base+"/admin/release/staging-readiness");
   assert.equal(res.status,200);
   assert.equal(res.headers.get("cache-control"),"no-store");
   const payload=await res.json();
   assert.equal(payload.launchReady,false);
   assert.equal(payload.stagingApproved,false);
   assert.equal(payload.schemaVerified,false);
   assert.ok(!JSON.stringify(payload).includes("PRIVATE_"));
 }finally{
   if(server)await new Promise(resolve=>server.close(resolve));
   await unlink(file);delete globalThis.__mvpStageQa;
 }
});
