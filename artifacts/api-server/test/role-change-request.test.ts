import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

test("WhatsApp role requests are authenticated by phone, deduplicated, audited and do not switch role",async()=>{
  const state={user:{id:"11111111-1111-4111-8111-111111111111",phone:"10000000001",
    role:"buyer",status:"verified"},requests:[],audit:[],failAudit:false};
  const db={execute:async query=>{
    const sql=query.parts.join("?").toLowerCase().replace(/\s+/g," ").trim(),v=query.values;
    if(sql.startsWith("select id,role,status from public.users")){
      return {rows:state.user.phone===v[0]?[{id:state.user.id,role:state.user.role,status:state.user.status}]:[]};
    }
    if(sql.startsWith("insert into public.user_role_change_requests")){
      if(state.requests.some(r=>r.status==="pending"&&r.userId===v[0]))return {rows:[]};
      const item={id:randomUUID(),userId:v[0],fromRole:v[1],toRole:v[2],status:"pending"};
      state.requests.push(item);return {rows:[{id:item.id}]};
    }
    if(sql.startsWith("insert into public.audit_logs")){
      if(state.failAudit){state.failAudit=false;throw Error("synthetic_audit_failure");}
      state.audit.push({actorUserId:v[0],fromRole:v[4],toRole:v[5]});
      return {rows:[]};
    }
    throw Error("Unexpected SQL: "+sql.slice(0,100));
  },transaction:async fn=>{
    const before={requests:structuredClone(state.requests),audit:structuredClone(state.audit)};
    try{return await fn(db);}catch(e){state.requests=before.requests;state.audit=before.audit;throw e;}
  }};
  globalThis.__roleQaDb=db;
  const filename=fileURLToPath(new URL(`./role-request-${randomUUID()}.mjs`,import.meta.url));
  const bundle=await build({
    stdin:{contents:"export * from '../src/accounts/roleChangeRequest.ts';",
      resolveDir:fileURLToPath(new URL(".",import.meta.url))},
    write:false,bundle:true,platform:"node",format:"esm",packages:"external",
    plugins:[{name:"role-qa-db",setup(b){
      b.onResolve({filter:/^@workspace\/db$/},()=>({namespace:"fixture",path:"db"}));
      b.onResolve({filter:/^drizzle-orm$/},()=>({namespace:"fixture",path:"orm"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},arg=>({loader:"js",contents:
        arg.path==="db"?"export const db=globalThis.__roleQaDb;":
          "export const sql=(parts,...values)=>({parts,values});"}));
    }}]
  });
  await writeFile(filename,bundle.outputFiles[0].text);
  try{
    const {requestRoleChange,roleChangeReply}=await import(filename);
    const request=(role,phone=state.user.phone)=>requestRoleChange(phone,role,db);
    let r=await request("agent","10000000002");
    assert.equal(r.status,"ineligible");
    assert.equal(state.requests.length,0);
    r=await request("admin");
    assert.equal(r.status,"ineligible");
    r=await request("buyer");
    assert.equal(r.status,"already_current");
    state.user.status="pending";
    r=await request("seller");
    assert.equal(r.status,"ineligible");
    state.user.status="verified";
    r=await request("agent");
    assert.equal(r.status,"pending");
    assert.equal(state.requests.length,1);
    assert.equal(state.audit.length,1);
    assert.equal(state.user.role,"buyer");
    r=await request("agent");
    assert.equal(r.status,"already_pending");
    r=await request("seller");
    assert.equal(r.status,"already_pending","only one current review request is allowed");
    assert.equal(state.requests.length,1);
    assert.equal(state.audit.length,1,"webhook replays produce no duplicate audit");
    assert.match(roleChangeReply("pending","agent"),/current role and access remain unchanged/i);
    assert.match(roleChangeReply("already_pending","agent"),/unchanged/);
    state.requests[0].status="reviewed";
    state.failAudit=true;
    await assert.rejects(request("seller"),/synthetic_audit_failure/);
    assert.equal(state.requests.length,1,"transaction failure rolls back new review request");
    assert.equal(state.user.role,"buyer","no account role changes even after audit failure");
    r=await request("seller");
    assert.equal(r.status,"pending");
    assert.equal(state.requests.length,2);
    assert.equal(state.user.role,"buyer");
    state.user.role="agent";
    r=await request("agent");
    assert.equal(r.status,"already_current");
  }finally{await unlink(filename);delete globalThis.__roleQaDb;}
});
