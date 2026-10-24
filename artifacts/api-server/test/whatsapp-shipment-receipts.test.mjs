import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

test("Meta receipt handler is monotonic, bound to outbox recipient and replay-safe",async()=>{
  const rows={outbox:[],receipts:[],users:[]};
  const db={execute:async q=>{
    const statement=q.parts.join("?").replace(/\s+/g," ").trim().toLowerCase(),v=q.values;
    if(statement.startsWith("insert into public.whatsapp_shipment_receipts")){
      const [id,status,fingerprint,timestamp]=v;
      if(rows.receipts.some(r=>r.id===id&&r.status===status&&r.time.getTime()===timestamp.getTime()))
        return {rows:[]};
      rows.receipts.push({id,status,fingerprint,time:timestamp,appliedAt:null});
      return {rows:[{id:randomUUID()}]};
    }
    if(statement.startsWith("update public.whatsapp_shipment_outbox")){
      const id=v.at(-2),phone=v.at(-1),status=v[0],date=v[5];
      const outbox=rows.outbox.find(r=>r.providerMessageId===id&&r.status==="accepted"&&
        rows.users.some(u=>u.id===r.recipientUserId&&u.phone===phone));
      if(!outbox)return {rows:[]};
      if(status==="read")outbox.deliveryStatus="read";
      else if(status==="delivered"&&outbox.deliveryStatus!=="read")outbox.deliveryStatus="delivered";
      else if(status==="sent"&&outbox.deliveryStatus==="unconfirmed")outbox.deliveryStatus="sent";
      else if(status==="failed"&&["unconfirmed","sent"].includes(outbox.deliveryStatus))outbox.deliveryStatus="failed";
      if(["read","delivered"].includes(status))outbox.deliveredAt??=date;
      if(status==="read")outbox.readAt??=date;
      return {rows:[{id:outbox.id}]};
    }
    if(statement.startsWith("update public.whatsapp_shipment_receipts")){
      const [now,id,status,date,fingerprint]=v;
      rows.receipts.filter(r=>r.id===id&&r.status===status&&r.time.getTime()===date.getTime()&&r.fingerprint===fingerprint)
        .forEach(r=>r.appliedAt??=now);
      return {rows:[]};
    }
    throw Error("Unexpected fake SQL: "+statement);
  }};
  const file=fileURLToPath(new URL("./receipt-"+randomUUID()+".mjs",import.meta.url));
  globalThis.__udcReceiptTestDb=db;
  const built=await build({
    stdin:{contents:"export * from '../src/whatsapp/shipmentDeliveryReceipts.ts';",
      resolveDir:fileURLToPath(new URL(".",import.meta.url))},
    bundle:true,packages:"external",platform:"node",format:"esm",write:false,
    plugins:[{name:"receipt-db-stubs",setup(b){
      b.onResolve({filter:/^@workspace\/db$/},()=>({path:"db",namespace:"fixture"}));
      b.onResolve({filter:/^drizzle-orm$/},()=>({path:"orm",namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},arg=>({loader:"js",contents:
        arg.path==="db"?"export const db=globalThis.__udcReceiptTestDb;":
          "export const sql=(parts,...values)=>({parts,values});"}));
    }}]
  });
  await writeFile(file,built.outputFiles[0].text);
  try{
    const mod=await import(file),now=new Date("2026-10-24T12:00:00Z");
    const phone="10000000001",messageId="wamid.synthetic.1",secret="synthetic-secret";
    const ts=Math.floor(now.getTime()/1000).toString();
    const status=(kind,id=messageId,recipient=phone)=>({id,status:kind,timestamp:ts,recipient_id:recipient});
    const run=values=>mod.recordSignedShipmentStatuses(values,{executor:db,now,secret});
    assert.equal(mod.parseMetaDeliveryStatus(status("read"),now).providerStatus,"read");
    assert.equal(mod.parseMetaDeliveryStatus(status("invalid"),now),null);
    assert.equal(mod.parseMetaDeliveryStatus({...status("read"),timestamp:"not_time"},now),null);
    assert.equal(mod.parseMetaDeliveryStatus({...status("read"),recipient_id:"1"},now),null);
    assert.equal(mod.parseMetaDeliveryStatus({...status("read"),id:"<script>"},now),null);
    rows.users.push({id:"buyer",phone});
    rows.outbox.push({id:"outbox",recipientUserId:"buyer",providerMessageId:messageId,
      status:"accepted",deliveryStatus:"unconfirmed"});
    let result=await run([status("read")]);
    assert.equal(result.applied,1);assert.equal(rows.outbox[0].deliveryStatus,"read");
    assert.ok(rows.outbox[0].deliveredAt);assert.ok(rows.outbox[0].readAt);
    result=await run([status("read"),status("sent")]);
    assert.equal(result.stored,1,"duplicate receipts have a unique event key");
    assert.equal(rows.outbox[0].deliveryStatus,"read","out-of-order sent cannot downgrade read");
    result=await run([status("failed")]);
    assert.equal(rows.outbox[0].deliveryStatus,"read","out-of-order failed cannot downgrade read");
    result=await run([status("delivered",messageId,"10000000002")]);
    assert.equal(result.unmatched,1,"recipient mismatch cannot alter another account");
    rows.outbox.push({id:"second",recipientUserId:"buyer",providerMessageId:"wamid.synthetic.2",
      status:"accepted",deliveryStatus:"unconfirmed"});
    await run([status("failed","wamid.synthetic.2")]);
    assert.equal(rows.outbox[1].deliveryStatus,"failed");
    await run([status("delivered","wamid.synthetic.2")]);
    assert.equal(rows.outbox[1].deliveryStatus,"delivered","later delivery supersedes a failed report");
    result=await run([status("read","wamid.unknown")]);
    assert.equal(result.unmatched,1);
    assert.ok(rows.receipts.some(r=>r.id==="wamid.unknown"&&r.appliedAt===null));
    rows.users[0].phone="10000000003";
    result=await run([status("read","wamid.synthetic.2")]);
    assert.equal(result.unmatched,1,"old number must not bind current account after migration");
    assert.equal(rows.receipts.length,8);
  }finally{
    await unlink(file);delete globalThis.__udcReceiptTestDb;
  }
});
