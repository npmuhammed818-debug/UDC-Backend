import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

test("admin role review cannot grant a different role or bypass authentication",async()=>{
 const userId="11111111-1111-4111-8111-111111111111";
 const id="22222222-2222-4222-8222-222222222222";
 const state:any={role:"admin",reviewerId:"33333333-3333-4333-8333-333333333333",
   account:{id:userId,role:"buyer",status:"verified",phone:"10000000001"},
   requests:[{id,userId,fromRole:"buyer",toRole:"agent",status:"pending",createdAt:new Date()}],
   audits:[],notifications:[],reads:0,failAudit:false};
 const names=["userRoleChangeRequestsTable","usersTable","auditLogsTable","notificationsTable"];
 const tables=Object.fromEntries(names.map(name=>[name,new Proxy({_table:name},{
   get:(_,key)=>key==="_table"?name:{column:key},
 })]));
 const db:any={execute:async (q:any)=>{
   const statement=q.parts.join("?").toLowerCase().replace(/\s+/g," ").trim();
   if(statement.startsWith("select r.id,r.user_id")) {
     state.reads++;
     const row=state.requests.find(x=>x.id===q.values[0]);
     return {rows:row?[{id:row.id,user_id:row.userId,from_role:row.fromRole,
       to_role:row.toRole,status:row.status,role:state.account.role,
       user_status:state.account.status}]:[]};
   }
   if(statement.startsWith("update public.user_role_change_requests")) {
     const [decision,reviewer,note,recordId]=q.values;
     const row=state.requests.find(x=>x.id===recordId&&x.status==="pending");
     if(!row)return {rows:[]};
     Object.assign(row,{status:decision,reviewerUserId:reviewer,
       reviewNote:note,reviewedAt:new Date()});
     return {rows:[]};
   }
   throw Error("unexpected SQL "+statement.slice(0,80));
 },select:(fields:any)=>{
   const q:any={from:()=>q,orderBy:()=>q,limit:async (limit:number)=>{
     state.reads++;
     return state.requests.slice(0,limit).map(row=>Object.fromEntries(Object.entries(fields)
       .map(([k,col])=>[k,row[col.column]])));
   }};
   return q;
 },insert:(table:any)=>({values:async (entry:any)=>{
   if(table._table==="auditLogsTable"){
     if(state.failAudit){state.failAudit=false;throw Error("synthetic_audit_failure");}
     state.audits.push(entry);
   }else if(table._table==="notificationsTable")state.notifications.push(entry);
   else throw Error("unknown table");
   return [];
 }}),transaction:async (fn:any)=>{
   const snapshot={requests:structuredClone(state.requests),audits:structuredClone(state.audits),
     notifications:structuredClone(state.notifications)};
   try{return await fn(db);}catch(e){
     state.requests=snapshot.requests;state.audits=snapshot.audits;
     state.notifications=snapshot.notifications;throw e;
   }
 }};
 (globalThis as any).__roleReviewQa={state,db,tables};
 const file=fileURLToPath(new URL(`./role-review-${randomUUID()}.mjs`,import.meta.url));
 const result=await build({stdin:{
     contents:"import express from 'express';import router from '../src/routes/roleChangeReview.ts';const app=express();app.use(express.json());app.use((req,res,next)=>{const s=globalThis.__roleReviewQa.state;req.authUser={id:s.reviewerId,role:s.role,status:'verified'};next()});app.use(router);export default app;",
     resolveDir:fileURLToPath(new URL(".",import.meta.url)),
   },platform:"node",format:"esm",bundle:true,packages:"external",write:false,
   plugins:[{name:"role-review-fixtures",setup(b){
     b.onResolve({filter:/^@workspace\/db$/},()=>({namespace:"fixture",path:"db"}));
     b.onResolve({filter:/^drizzle-orm$/},()=>({namespace:"fixture",path:"orm"}));
     b.onResolve({filter:/auth\/middleware$/},()=>({namespace:"fixture",path:"auth"}));
     b.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"js",contents:
       args.path==="db"?"const s=globalThis.__roleReviewQa;export const db=s.db;"+
         names.map(name=>`export const ${name}=s.tables.${name};`).join(""):
       args.path==="orm"?"export const sql=(parts,...values)=>({parts,values});export const desc=x=>x;export const eq=(a,b)=>({a,b});export const and=(...args)=>args;":
         "export const requireRole=role=>(req,res,next)=>{if(req.authUser?.role!==role){res.status(403).json({error:'forbidden'});return;}next();};",
     }));
   }}]});
 await writeFile(file,result.outputFiles[0].text);
 let server;
 try{
   const {default:app}=await import(file);
   server=app.listen(0,"127.0.0.1");
   await new Promise(resolve=>server.once("listening",resolve));
   const base=`http://127.0.0.1:${server.address().port}`;
   const get=()=>fetch(base+"/admin/role-change-requests");
   const review=(id:string,decision:string,note?:string)=>fetch(base+"/admin/role-change-requests/"+id+"/review",{
     method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({decision,note}),
   });
   state.role="buyer";
   let response=await get();
   assert.equal(response.status,403);assert.equal(state.reads,0);
   response=await review(id,"reviewed");
   assert.equal(response.status,403);assert.equal(state.reads,0);
   state.role="admin";
   response=await get();
   assert.equal(response.status,200);
   const payload=await response.json();
   assert.equal(payload.autoSwitchEnabled,false);
   assert.equal(payload.requests.length,1);
   assert.ok(!JSON.stringify(payload).includes("10000000001"));
   response=await review("not-uuid","reviewed");
   assert.equal(response.status,400);
   response=await review(id,"approved");
   assert.equal(response.status,400,"there is no implicit role-granting decision");
   response=await review(id,"reviewed","Needs another verified profile");
   assert.equal(response.status,200);
   const accepted=await response.json();
   assert.equal(accepted.roleChanged,false);assert.equal(accepted.requiresManualTransition,true);
   assert.equal(state.account.role,"buyer");
   assert.equal(state.account.status,"verified");
   assert.equal(state.audits.length,1);assert.equal(state.notifications.length,1);
   assert.match(state.notifications[0].body,/role remains active/);
   response=await review(id,"reviewed");
   assert.equal(response.status,409,"replay cannot generate duplicate review actions");
   assert.equal(state.audits.length,1);
   state.requests.push({id:"44444444-4444-4444-8444-444444444444",userId,
     fromRole:"buyer",toRole:"seller",status:"pending",createdAt:new Date()});
   state.account.role="agent";
   response=await review(state.requests.at(-1).id,"reviewed");
   assert.equal(response.status,409,"stale fromRole cannot be reviewed");
   state.account.role="buyer";
   state.failAudit=true;
   response=await review(state.requests.at(-1).id,"reviewed");
   assert.equal(response.status,503);
   assert.equal(state.requests.at(-1).status,"pending","failed audit must roll back review");
   assert.equal(state.audits.length,1);
 }finally{
   if(server)await new Promise(resolve=>server.close(resolve));
   await unlink(file);delete (globalThis as any).__roleReviewQa;
 }
});
