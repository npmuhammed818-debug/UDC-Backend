import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

// Exercise the real route with simultaneous requests. The fake transaction
// models a per-pool row lock; removing .for('update') makes both allocations pass.
test("simultaneous buyer allocations cannot overfill a pool", async () => {
  const tables: any = {};
  for (const name of ["buyerPoolsTable","buyerPoolAllocationsTable","auditLogsTable","dealsTable","usersTable"])
    tables[name] = { id: name+".id", poolId:name+".poolId", quantity:name+".quantity", role:name+".role", status:name+".status" };
  let allocated = 0;
  const allocReads = new Map<object, number>();
  let locks = 0;
  let tail = Promise.resolve();
  const state: any = { ...tables };
  state.db = { transaction: async (fn: any) => {
    let release: (()=>void) | undefined;
    const tx: any = {
      select() {
        let table: any;
        const query: any = {
          from(t: any) { table=t; return query; }, where() {return query;}, limit() {return query;},
          async for() {
            const previous=tail;
            tail = new Promise<void>(resolve => {release=resolve;});
            await previous; locks++;
            return [{id:"pool",status:"forming",targetQuantity:"10"}];
          },
          then(resolve: any,reject:any) {
            const result=table===tables.usersTable ? [{id:"buyer"}]
              : table===tables.buyerPoolAllocationsTable ? (allocReads.set(tx, (allocReads.get(tx) ?? 0) + 1), allocReads.get(tx) === 1 ? [{exceeded:allocated+6>10}] : [])
              : [{id:"pool",status:"forming",targetQuantity:"10"}];
            return Promise.resolve(result).then(resolve,reject);
          },
        };
        return query;
      },
      insert(table: any) { return { values(value: any) {
        return {
          async returning() {await new Promise(r=>setTimeout(r,10)); allocated+=Number(value.quantity);return [{id:randomUUID(),...value}];},
          then(resolve:any) {return Promise.resolve([]).then(resolve);},
        };
      } }; },
    };
    try {return await fn(tx);} finally {release?.();}
  } };
  (globalThis as any).__udcPoolTest = state;
  const output = fileURLToPath(new URL(`./pool-${randomUUID()}.mjs`,import.meta.url));
  const bundle=await build({stdin:{contents:'import express from "express"; import router from "../src/routes/buyerPools.ts"; const app=express(); app.use(express.json()); app.use((req,res,next)=>{req.authUser={id:"admin",role:"admin"};next();});app.use(router);export default app;',resolveDir:fileURLToPath(new URL('.',import.meta.url)),loader:"ts"},bundle:true,platform:"node",format:"esm",packages:"external",write:false,plugins:[{name:"test-db",setup(b){
    b.onResolve({filter:/^@workspace\/db$/},()=>({path:"db",namespace:"fake"}));
    b.onResolve({filter:/auth\/middleware$/},()=>({path:"auth",namespace:"fake"}));
    b.onLoad({filter:/.*/,namespace:"fake"},a=>({contents:a.path==="auth" ? 'export const requireRole=()=> (req,res,next)=>next();export const requireAuth=(req,res,next)=>next();' : 'const s=globalThis.__udcPoolTest;export const db=s.db;'+Object.keys(tables).map(n=>`export const ${n}=s.${n};`).join(''),loader:"js"}));
  }}]});
  await writeFile(output,bundle.outputFiles[0].text);
  let server: any;
  try {
    const {default:app}=await import(output);
    server=app.listen(0,"127.0.0.1");
    await new Promise(r=>server.once("listening",r));
    const url=`http://127.0.0.1:${server.address().port}/admin/buyer-pools/11111111-1111-4111-8111-111111111111/allocations`;
    const send=(id:string)=>fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({buyerUserId:id,quantity:6,currency:"USD"})});
    const responses=await Promise.all([send("22222222-2222-4222-8222-222222222222"),send("33333333-3333-4333-8333-333333333333")]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
    assert.equal(allocated,6);
    assert.equal(locks,2);
    await Promise.all(responses.map(r=>r.body?.cancel()));
  } finally {if(server)await new Promise(r=>server.close(r));await unlink(output);delete (globalThis as any).__udcPoolTest;}
});
