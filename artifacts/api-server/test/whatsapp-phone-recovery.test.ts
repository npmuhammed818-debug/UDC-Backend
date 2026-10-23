import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

test("verified email is required before migrating a WhatsApp number to its original UDC identity",async t=>{
  const path=fileURLToPath(new URL("./phone-recovery-"+randomUUID()+".mjs",import.meta.url));
  const bundle=await build({
    stdin:{contents:"export * from '../src/whatsapp/phoneRecovery.ts';",resolveDir:fileURLToPath(new URL(".",import.meta.url))},
    platform:"node",format:"esm",bundle:true,packages:"external",write:false,
    plugins:[{name:"safe-postgres-fixture",setup(b){
      b.onResolve({filter:/^@workspace\/db$/},()=>({path:"db",namespace:"fixture"}));
      b.onResolve({filter:/^drizzle-orm$/},()=>({path:"orm",namespace:"fixture"}));
      b.onResolve({filter:/\/auth\/emailAuth$/},()=>({path:"emailAuth",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"js",contents:args.path==="db"
        ?"export const db={};":args.path==="orm"
        ?"export const sql=(parts,...params)=>({text:parts.join('?'),params});"
        :"export const emailAuth={ipBudget:async()=>{}};"}));
    }}],
  });
  await writeFile(path,bundle.outputFiles[0].text);
  const oldSecret=process.env.WHATSAPP_APP_SECRET;
  process.env.WHATSAPP_APP_SECRET="synthetic-signed-whatsapp-secret-qa-only";
  try{
    const module=await import(path);
    const records=()=>({
      accounts:[{id:"existing",email:"owner@example.invalid",verified_email:"owner@example.invalid",
        email_verified_at:new Date("2026-01-01"),phone:"11111111111",status:"verified",role:"buyer"}],
      challenges:[],sessions:[{user_id:"existing",revoked_at:null}],audits:[],draftDeletions:0,
    });
    const now=()=>new Date("2026-10-24T00:00:00Z");
    function create(r:any,send?:any){
      const emailOutbox:any[]=[];
      function rowOrNone(x:any){return {rows:x};}
      const db:any={execute:async(q:any)=>{
        const s=String(q.text).replace(/\s+/g," ").toLowerCase().trim(),v=q.params;
        if(s.startsWith("select pg_advisory_xact_lock"))return rowOrNone([]);
        if(s.startsWith("select id from public.users where phone="))
          return rowOrNone(r.accounts.filter((u:any)=>u.phone===v[0]).map((u:any)=>({id:u.id})));
        if(s.includes("from public.users where lower(email)="))
          return rowOrNone(r.accounts.filter((u:any)=>u.email?.toLowerCase()===v[0]));
        if(s.includes("from public.users where id="))
          return rowOrNone(r.accounts.filter((u:any)=>u.id===v[0]));
        if(s.includes("count(*)::integer as n"))
          return rowOrNone([{n:r.challenges.filter((c:any)=>c.user_id===v[0]&&c.created_at>v[1]).length,
            latest:r.challenges.filter((c:any)=>c.user_id===v[0]&&c.created_at>v[1]).at(-1)?.created_at??null}]);
        if(s.startsWith("insert into public.whatsapp_phone_link_challenges")){
          const [id,user_id,email,old_phone,new_phone,code_hash,expires_at]=v;
          r.challenges.push({id,user_id,email,old_phone,new_phone,code_hash,expires_at,
            consumed_at:null,attempts:0,created_at:now()});return rowOrNone([]);
        }
        if(s.startsWith("select id,user_id,email,old_phone,new_phone"))
          return rowOrNone(r.challenges.filter((c:any)=>c.new_phone===v[0])
            .sort((a:any,b:any)=>b.created_at-a.created_at||b.id.localeCompare(a.id)).slice(0,1));
        if(s.startsWith("update public.whatsapp_phone_link_challenges set attempts=")){
          const c=r.challenges.find((c:any)=>c.id===v[1]);
          c.attempts++;c.consumed_at=v[0];return rowOrNone([]);
        }
        if(s.startsWith("update public.whatsapp_phone_link_challenges")&&s.includes("where new_phone=")){
          r.challenges.filter((c:any)=>c.new_phone===v[1]&&!c.consumed_at).forEach((c:any)=>c.consumed_at=v[0]);return rowOrNone([]);
        }
        if(s.startsWith("update public.whatsapp_phone_link_challenges")&&s.includes("where id=")){
          r.challenges.filter((c:any)=>c.id===v[1]).forEach((c:any)=>c.consumed_at=v[0]);return rowOrNone([]);
        }
        if(s.startsWith("update public.whatsapp_phone_link_challenges")&&s.includes("where user_id=")){
          r.challenges.filter((c:any)=>c.user_id===v[1]).forEach((c:any)=>c.consumed_at??=v[0]);return rowOrNone([]);
        }
        if(s.startsWith("update public.users set phone=")){
          r.accounts.filter((u:any)=>u.id===v[2]&&u.phone===v[3]).forEach((u:any)=>u.phone=v[0]);return rowOrNone([]);
        }
        if(s.startsWith("update public.auth_sessions")){
          r.sessions.filter((x:any)=>x.user_id===v[1]).forEach((x:any)=>x.revoked_at=v[0]);return rowOrNone([]);
        }
        if(s.startsWith("delete from public.whatsapp_")){
          r.draftDeletions++;return rowOrNone([]);
        }
        if(s.startsWith("insert into public.audit_logs")){
          r.audits.push("whatsapp_number_recovered");return rowOrNone([]);
        }
        throw new Error("Unexpected fake SQL: "+s);
      }};
      db.transaction=async(fn:any)=>fn(db);
      const service=module.createPhoneRecoveryService({database:db,now,
        secret:()=>"synthetic-otp-hmac-key-32-characters-long",
        budget:async()=>{},send:send??(async(message:any)=>{emailOutbox.push(message);})});
      return {service,emailOutbox};
    }

    await t.test("commands consume malformed email and OTP before AI; casual chat is unaffected",()=>{
      assert.equal(module.phoneRecoveryCommand("hello"),null);
      assert.deepEqual(module.phoneRecoveryCommand("Sign in owner@example.invalid"),
        {kind:"request",email:"owner@example.invalid"});
      assert.deepEqual(module.phoneRecoveryCommand("sign in"),{kind:"request",email:""});
      assert.deepEqual(module.phoneRecoveryCommand("Phone code 123456"),{kind:"confirm",code:"123456"});
      assert.deepEqual(module.phoneRecoveryCommand("Phone code"),{kind:"confirm",code:""});
    });
    await t.test("unknown/unverified emails never deliver a code and return the same response",async()=>{
      const r=records();const x=create(r);
      const unknown=await x.service.request("22222222222","missing@example.invalid");
      r.accounts[0].verified_email=null;r.accounts[0].email_verified_at=null;
      const unverified=await x.service.request("22222222222","owner@example.invalid");
      assert.equal(unknown,unverified);assert.equal(x.emailOutbox.length,0);assert.equal(r.accounts[0].phone,"11111111111");
    });
    await t.test("correct bound 6-digit OTP moves number, preserves user ID and revokes old access",async()=>{
      const r=records();const x=create(r);
      await x.service.request("22222222222","OWNER@example.invalid");
      assert.equal(x.emailOutbox.length,1);assert.match(x.emailOutbox[0].code,/^\d{6}$/);
      assert.equal(r.challenges[0].code_hash.includes(x.emailOutbox[0].code),false);
      const result=await x.service.confirm("22222222222",x.emailOutbox[0].code);
      assert.match(result,/original UDC account/);
      assert.equal(r.accounts.length,1);assert.equal(r.accounts[0].id,"existing");
      assert.equal(r.accounts[0].phone,"22222222222");
      assert.equal(r.accounts.some((u:any)=>u.phone==="11111111111"),false);
      assert.ok(r.sessions[0].revoked_at);
      assert.equal(r.audits.length,1);assert.ok(r.draftDeletions>=3);
      assert.match(await x.service.confirm("22222222222",x.emailOutbox[0].code),/invalid, expired/);
    });
    await t.test("wrong code cannot rebind a victim and five guesses consume the challenge",async()=>{
      const r=records(),x=create(r);
      await x.service.request("22222222222","owner@example.invalid");
      const bad=x.emailOutbox[0].code==="000000"?"000001":"000000";
      for(let i=0;i<5;i++)assert.match(await x.service.confirm("22222222222",bad),/invalid/);
      assert.equal(r.accounts[0].phone,"11111111111");assert.equal(r.challenges[0].attempts,5);
      assert.match(await x.service.confirm("22222222222",x.emailOutbox[0].code),/invalid/);
    });
    await t.test("registered destination number cannot silently merge two identities",async()=>{
      const r=records();r.accounts.push({id:"unrelated",email:"other@example.invalid",phone:"22222222222",status:"verified",role:"buyer"});
      const x=create(r);await x.service.request("22222222222","owner@example.invalid");
      assert.equal(x.emailOutbox.length,0);assert.equal(r.accounts[0].phone,"11111111111");
      assert.equal(r.accounts[1].id,"unrelated");
    });
    await t.test("recovery fails closed if email delivery is unavailable",async()=>{
      const r=records(),x=create(r,async()=>{throw Error("synthetic email outage")});
      await x.service.request("22222222222","owner@example.invalid");
      assert.ok(r.challenges[0].consumed_at);
      assert.match(await x.service.confirm("22222222222","123456"),/invalid/);
      assert.equal(r.accounts[0].phone,"11111111111");
    });
    await t.test("changing original number before confirmation invalidates old challenge",async()=>{
      const r=records(),x=create(r);
      await x.service.request("22222222222","owner@example.invalid");
      r.accounts[0].phone="33333333333";
      assert.match(await x.service.confirm("22222222222",x.emailOutbox[0].code),/invalid/);
      assert.equal(r.accounts[0].phone,"33333333333");
    });
  }finally{
    if(oldSecret===undefined)delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET=oldSecret;
    await unlink(path);
  }
});
