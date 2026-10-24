import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";

test("Meta approved template check is GET-only, bounded and secret-safe",async()=>{
  const file=fileURLToPath(new URL(`./meta-templates-${randomUUID()}.mjs`,import.meta.url));
  const bundle=await build({
    stdin:{contents:"export * from '../src/whatsapp/templateReadiness.ts';",
      resolveDir:fileURLToPath(new URL(".",import.meta.url))},
    write:false,bundle:true,packages:"external",platform:"node",format:"esm",
  });
  await writeFile(file,bundle.outputFiles[0].text);
  try{
    const mod=await import(file),secret="PRIVATE_META_TEST_TOKEN";
    let calls=0;
    const output={
      data:[
        {name:"udc_shipment_update",language:"en_US",status:"APPROVED",category:"UTILITY",components:[{text:"PRIVATE_TEXT"}]},
        {name:"udc_shipment_delay",language:"en_US",status:"PENDING",category:"UTILITY"},
        {name:"udc_internal_campaign",language:"en_US",status:"APPROVED",category:"MARKETING"},
        {name:"<bad name>",language:"xx-XY",status:"INVALID",category:"UTILITY"},
      ],
      paging:{next:"https://graph.facebook.com/v21.0/private-secret-next-page"},
    };
    const fetcher=async(url,opts)=>{
      calls++;
      assert.equal(opts.method,"GET");
      assert.ok(String(url).startsWith("https://graph.facebook.com/v21.0/123456789/message_templates"));
      assert.equal(url.searchParams.get("limit"),"50");
      assert.equal(url.searchParams.get("fields"),"name,language,category,status");
      assert.equal(opts.headers.authorization,"Bearer "+secret);
      assert.equal(opts.redirect,"error");
      return new Response(JSON.stringify(output),{status:200,headers:{"content-type":"application/json"}});
    };
    let r=await mod.readWhatsAppTemplateReadiness({
      wabaId:"123456789",token:secret,transport:fetcher});
    assert.equal(r.ok,true);assert.equal(calls,1);
    assert.equal(r.approvedUtility,1);assert.equal(r.productionReady,false);
    assert.equal(r.canSend,false);assert.equal(r.incomplete,true);
    assert.equal(r.templates.length,4);
    assert.ok(!JSON.stringify(r).includes(secret));
    assert.ok(!JSON.stringify(r).includes("PRIVATE_TEXT"));
    assert.ok(!JSON.stringify(r).includes("private-secret-next-page"));
    assert.equal(r.templates[3].status,"UNKNOWN");
    r=await mod.readWhatsAppTemplateReadiness({wabaId:"wrong-id",token:secret,transport:fetcher});
    assert.equal(r.configured,false);assert.equal(calls,1,"missing config cannot contact provider");
    for(const status of [401,403,429,500]){
      const fake=async()=>new Response(JSON.stringify({error:{message:"PRIVATE "+secret}}),{status});
      r=await mod.readWhatsAppTemplateReadiness({wabaId:"123456789",token:secret,transport:fake});
      assert.equal(r.ok,false);
      assert.equal(r.productionReady,false);
      assert.ok(!JSON.stringify(r).includes(secret));
    }
    r=await mod.readWhatsAppTemplateReadiness({
      wabaId:"123456789",token:secret,transport:async()=>new Response("not json",{status:200}),
    });
    assert.equal(r.reason,"meta_template_invalid_response");
    r=await mod.readWhatsAppTemplateReadiness({
      wabaId:"123456789",token:secret,
      transport:async()=>new Response("a".repeat(100000),{status:200,headers:{"content-length":"100000"}}),
    });
    assert.equal(r.reason,"meta_template_response_too_large");
    r=await mod.readWhatsAppTemplateReadiness({
      wabaId:"123456789",token:secret,transport:async()=>{throw Error("TOKEN "+secret);},
    });
    assert.equal(r.reason,"meta_template_connection_failed");
    assert.ok(!JSON.stringify(r).includes(secret));
  }finally{await unlink(file);}
});

test("Meta template status routes require an admin and rate-limit repeated probes",async()=>{
  const state={calls:0,configured:true,fail:false};
  (globalThis as any).__metaReadinessFixture=state;
  const filename=fileURLToPath(new URL(`./meta-route-${randomUUID()}.mjs`,import.meta.url));
  const bundle=await build({
    stdin:{contents:"import express from 'express';import router from '../src/routes/whatsappTemplateReadiness.ts';const app=express();app.use(express.json());app.use(router);export default app;",
      resolveDir:fileURLToPath(new URL(".",import.meta.url))},
    write:false,bundle:true,packages:"external",platform:"node",format:"esm",
    plugins:[{name:"meta-route-fixtures",setup(b){
      b.onResolve({filter:/./},a=>{
        if(a.importer.endsWith("/routes/whatsappTemplateReadiness.ts") &&
          ["../auth/middleware","../whatsapp/templateReadiness"].includes(a.path)){
          return {path:a.path,namespace:"fixture"};
        }
      });
      b.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"js",contents:
        args.path==="../auth/middleware"
          ?"export const requireRole=role=>(req,res,next)=>{if(req.header('x-qa-role')!==role){res.status(403).json({error:'forbidden'});return;}req.authUser={id:req.header('x-qa-admin')||'qa-admin'};next();};"
          :"const s=globalThis.__metaReadinessFixture;"+
            "export const whatsappTemplateConfigStatus=()=>({configured:s.configured,enabledForSending:false,safeToSendProactively:false});"+
            "export const readWhatsAppTemplateReadiness=async()=>{s.calls++;return s.fail?{configured:true,ok:false,reason:'meta_template_access_denied',productionReady:false}:{configured:true,ok:true,templates:[{name:'qa_utility',language:'en_US',status:'APPROVED',category:'UTILITY'}],approvedUtility:1,productionReady:false};};",
      }));
    }}],
  });
  await writeFile(filename,bundle.outputFiles[0].text);
  let server:any;
  try{
    const {default:app}=await import(filename);
    server=app.listen(0,"127.0.0.1");
    await new Promise(resolve=>server.once("listening",resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const request=async(path,role="admin",adminId="qa-admin",method="GET")=>{
      const response=await fetch(base+path,{method,headers:{"x-qa-role":role,"x-qa-admin":adminId,
        "content-type":"application/json"},...(method==="POST"?{body:"{}"}:{})});
      return {code:response.status,body:await response.json(),headers:response.headers};
    };
    let r=await request("/admin/whatsapp/readiness","buyer");
    assert.equal(r.code,403);assert.equal(state.calls,0);
    r=await request("/admin/whatsapp/readiness");
    assert.equal(r.code,200);assert.equal(r.body.configured,true);assert.equal(r.body.safeToSendProactively,false);
    assert.equal(state.calls,0,"static status must never call Meta");
    r=await request("/admin/whatsapp/templates/check","buyer","unauthorized","POST");
    assert.equal(r.code,403);assert.equal(state.calls,0);
    r=await request("/admin/whatsapp/templates/check","admin","test-a","POST");
    assert.equal(r.code,200);assert.equal(r.body.approvedUtility,1);
    assert.equal(state.calls,1);
    r=await request("/admin/whatsapp/templates/check","admin","test-a","POST");
    assert.equal(r.code,429);assert.equal(state.calls,1);
    assert.ok(Number(r.headers.get("retry-after"))>0);
    state.fail=true;
    r=await request("/admin/whatsapp/templates/check","admin","test-b","POST");
    assert.equal(r.code,502);assert.equal(r.body.reason,"meta_template_access_denied");
    assert.equal(state.calls,2);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    await unlink(filename);delete (globalThis as any).__metaReadinessFixture;
  }
});
