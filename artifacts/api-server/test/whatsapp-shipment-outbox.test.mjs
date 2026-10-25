import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

test("outbox leases and uncertain-provider outcomes never produce unsafe retries",async()=>{
  const jobs=[],notices=new Map(),users=new Map(),deals=new Map(),preferences=new Map(),members=new Set();
  const fake={execute:async q=>{
    const sql=q.parts.join("?").replace(/\s+/g," ").trim().toLowerCase(),v=q.values;
    if(sql.startsWith("insert into public.whatsapp_shipment_outbox")){
      const [notificationId,dealId,recipientUserId]=v;
      if(jobs.some(j=>j.notificationId===notificationId))return {rows:[]};
      const j={id:randomUUID(),notificationId,dealId,recipientUserId,status:"pending",
        attempts:0,nextAttemptAt:new Date("2026-10-24T00:00:00Z"),claimToken:null,leaseUntil:null};
      jobs.push(j);return {rows:[{id:j.id}]};
    }
    if(sql.startsWith("with expired as")){
      const now=v[0];for(const j of jobs.filter(j=>j.status==="leased"&&j.leaseUntil<=now)){
        Object.assign(j,{status:"uncertain",claimToken:null,leaseUntil:null,reason:"provider_outcome_unknown"});
      }return {rows:[]};
    }
    if(sql.startsWith("with candidate")){
      const [now,token,leaseEnd]=v;
      const j=jobs.find(j=>["pending","retry"].includes(j.status)&&j.attempts<3&&j.nextAttemptAt<=now);
      if(!j)return {rows:[]};
      Object.assign(j,{status:"leased",claimToken:token,leaseUntil:leaseEnd,attempts:j.attempts+1});
      return {rows:[{id:j.id,deal_id:j.dealId,recipient_user_id:j.recipientUserId,attempts:j.attempts,claim_token:token}]};
    }
    if(sql.startsWith("select u.id as user_id")){
      const [jobId,token]=v,j=jobs.find(j=>j.id===jobId&&j.claimToken===token);
      if(!j)return {rows:[]};
      const user=users.get(j.recipientUserId),deal=deals.get(j.dealId),n=notices.get(j.notificationId),pref=preferences.get(j.recipientUserId);
      if(!user||!deal||!n||n.userId!==user.id||!["active","verified"].includes(user.status)
        ||!user.phone||!pref?.optionalWhatsApp||!pref?.reminders
        ||!(deal.buyer===user.id||deal.seller===user.id||
          (user.role==="agent"&&members.has(j.dealId+":"+user.id))))return {rows:[]};
      return {rows:[{user_id:user.id,phone:user.phone,body:n.body,type:"shipment_milestone",role:user.role}]};
    }
    if(sql.startsWith("with updated as (update public.whatsapp_shipment_outbox set status=")){
      const [status,notBefore,messageId,acceptedAt,updatedAt,reason,id,token,now]=v;
      const j=jobs.find(j=>j.id===id&&j.status==="leased"&&j.claimToken===token&&j.leaseUntil>now);
      if(!j)return {rows:[]};
      Object.assign(j,{status,claimToken:null,leaseUntil:null,nextAttemptAt:notBefore,
        providerMessageId:messageId,acceptedAt,reason});
      return {rows:[{id:j.id}]};
    }
    throw Error("Unexpected SQL: "+sql.slice(0,120));
  }};
  const holder={db:fake};globalThis.__outboxFixture=holder;
  const filename=fileURLToPath(new URL("./shipment-outbox-"+randomUUID()+".mjs",import.meta.url));
  const result=await build({stdin:{contents:"export * from '../src/notifications/shipmentOutbox.ts';",
    resolveDir:fileURLToPath(new URL(".",import.meta.url))},write:false,bundle:true,
    packages:"external",platform:"node",format:"esm",
    plugins:[{name:"fake-executor",setup(b){
      b.onResolve({filter:/^@workspace\/db$/},()=>({path:"db",namespace:"fixture"}));
      b.onResolve({filter:/^drizzle-orm$/},()=>({path:"orm",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},arg=>({loader:"js",contents:arg.path==="db"
        ?"export const db=globalThis.__outboxFixture.db;"
        :"export const sql=(parts,...values)=>({parts,values});"}));
    }}]});
  await writeFile(filename,result.outputFiles[0].text);
  try{
    const mod=await import(filename);
    const now=new Date("2026-10-24T12:00:00Z");
    const deal="deal",uid="buyer";deals.set(deal,{buyer:uid,seller:"seller"});
    users.set(uid,{id:uid,role:"buyer",phone:"10000000001",status:"verified"});
    preferences.set(uid,{optionalWhatsApp:true,reminders:true});
    const queue=async id=>{
      notices.set(id,{userId:uid,body:"UDC shipment update: check your authorized deal"});
      return mod.enqueueShipmentWhatsApp(fake,{notificationId:id,dealId:deal,recipientUserId:uid});
    };
    const run=(args={})=>mod.runShipmentWhatsAppOutbox({executor:fake,enabled:true,now,
      policyAuthorized:async()=>true,send:async()=>({delivered:true,messageId:"wamid.synthetic"}),...args});
    assert.equal((await mod.runShipmentWhatsAppOutbox({executor:fake})).enabled,false);
    assert.equal(await queue("one"),true);
    assert.equal(await queue("one"),false);
    let sent=0;
    let outcome=await run({send:async()=>{sent++;return {delivered:true,messageId:"wamid.1"};}});
    assert.equal(outcome.accepted,1);assert.equal(jobs[0].status,"accepted");assert.equal(sent,1);
    outcome=await run({send:async()=>{sent++;return {delivered:true,messageId:"wamid.1"};}});
    assert.equal(outcome.claimed,0);assert.equal(sent,1);

    await queue("timeout");
    outcome=await run({send:async()=>{sent++;throw Error("ambiguous Meta timeout");}});
    assert.equal(outcome.uncertain,1);assert.equal(jobs[1].status,"uncertain");
    outcome=await run({now:new Date("2026-10-25T12:00:00Z"),send:async()=>{sent++;return {delivered:true,messageId:"bad"};}});
    assert.equal(outcome.claimed,0);assert.equal(sent,2,"unknown Meta outcome must never auto resend");

    await queue("preflight");
    outcome=await run({send:async()=>({delivered:false,reason:"not_configured"})});
    assert.equal(outcome.retry,1);assert.equal(jobs[2].attempts,1);
    outcome=await run({send:async()=>({delivered:false,reason:"not_configured"})});
    assert.equal(outcome.claimed,0,"safe retry waits for backoff");
    outcome=await run({now:new Date(now.getTime()+2*60_000),send:async()=>({delivered:false,reason:"preflight_unavailable"})});
    assert.equal(outcome.retry,1);assert.equal(jobs[2].attempts,2);
    outcome=await run({now:new Date(now.getTime()+10*60_000),send:async()=>({delivered:false,reason:"not_configured"})});
    assert.equal(outcome.blocked,1);assert.equal(jobs[2].attempts,3);
    await queue("optout");preferences.get(uid).optionalWhatsApp=false;
    outcome=await run();assert.equal(outcome.cancelled,1);assert.equal(jobs[3].status,"cancelled");
    preferences.get(uid).optionalWhatsApp=true;
    await queue("policy");
    outcome=await run({policyAuthorized:async()=>false});
    assert.equal(outcome.blocked,1);assert.equal(jobs[4].reason,"policy_unverified");
    await queue("expired");
    Object.assign(jobs[5],{status:"leased",claimToken:randomUUID(),leaseUntil:new Date(now.getTime()-1000),attempts:1});
    outcome=await run();
    assert.equal(jobs[5].status,"uncertain");assert.equal(outcome.claimed,0);
    await queue("missingid");
    outcome=await run({send:async()=>({delivered:true})});
    assert.equal(outcome.uncertain,1);assert.equal(jobs[6].status,"uncertain");
    assert.equal(jobs.length,7);
  }finally{
    await unlink(filename);delete globalThis.__outboxFixture;
  }
});
