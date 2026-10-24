import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {build} from "esbuild";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";

test("signed customer-message window expires, never extends via replay, and revokes old phones",async()=>{
  const now=new Date("2026-10-24T12:00:00Z");
  const userId="11111111-2222-4333-8444-555555555555",oldPhone="10000000001",newPhone="10000000002";
  const dbState:{user:{id:string;phone:string;status:string};row:any|null}={
    user:{id:userId,phone:oldPhone,status:"verified"},row:null,
  };
  const db={execute:async query=>{
    const sql=query.parts.join(" ").replace(/\s+/g," ").trim().toLowerCase(),values=query.values;
    if(sql.startsWith("insert into public.whatsapp_customer_windows")){
      const [phoneHash,messageHash,instant,recordedAt,phone]=values;
      if(dbState.user.phone!==phone||dbState.user.status!=="verified")return {rows:[]};
      if(dbState.row && new Date(dbState.row.last_inbound_at)>=new Date(instant))return {rows:[]};
      dbState.row={phone_fingerprint:phoneHash,provider_message_fingerprint:messageHash,
        last_inbound_at:instant,recorded_at:recordedAt};
      return {rows:[{user_id:dbState.user.id}]};
    }
    if(sql.startsWith("select w.phone_fingerprint")){
      const [id,phone]=values;
      if(id!==dbState.user.id||phone!==dbState.user.phone||dbState.user.status!=="verified"||!dbState.row)
        return {rows:[]};
      return {rows:[dbState.row]};
    }
    throw Error("unexpected query: "+sql.slice(0,160));
  }};
  (globalThis as any).__customerWindowDb=db;
  const file=fileURLToPath(new URL(`./customer-window-${randomUUID()}.mjs`,import.meta.url));
  const bundled=await build({
    stdin:{contents:"export * from '../src/whatsapp/customerServiceWindow.ts';",
      resolveDir:fileURLToPath(new URL(".",import.meta.url))},
    format:"esm",platform:"node",bundle:true,packages:"external",write:false,
    plugins:[{name:"window-db-stubs",setup(b){
      b.onResolve({filter:/^@workspace\/db$/},()=>({namespace:"mock",path:"db"}));
      b.onResolve({filter:/^drizzle-orm$/},()=>({namespace:"mock",path:"orm"}));
      b.onLoad({filter:/.*/,namespace:"mock"},x=>({loader:"js",
        contents:x.path==="db"?"export const db=globalThis.__customerWindowDb;":
          "export const sql=(parts,...values)=>({parts,values});"}));
    }}],
  });
  await writeFile(file,bundled.outputFiles[0].text);
  try{
    const mod=await import(file);
    const secret="testing-secret-only",executor=db;
    const args={executor,now,secret},stamp=Math.floor(now.getTime()/1000).toString();
    const event=(timestamp=stamp,phone=oldPhone,providerMessageId="wamid.synthetic.inbound.1")=>
      ({phone,timestamp,providerMessageId});
    assert.equal(mod.validInboundInstant("nonsense",now),null);
    assert.equal(mod.validInboundInstant(String(Math.floor((now.getTime()+5*60_000)/1000)),now),null);
    assert.equal(mod.validInboundInstant(String(Math.floor((now.getTime()-25*60*60_000)/1000)),now),null);
    assert.equal((await mod.recordSignedCustomerInbound(event("bad"),args)).recorded,false);
    assert.equal((await mod.recordSignedCustomerInbound(event(stamp,oldPhone,"<script>"),args)).recorded,false);
    assert.equal(dbState.row,null);
    assert.equal((await mod.recordSignedCustomerInbound(event(),args)).recorded,true);
    assert.match(dbState.row.phone_fingerprint,/^[0-9a-f]{64}$/);
    assert.notEqual(dbState.row.phone_fingerprint,oldPhone);
    assert.ok(!JSON.stringify(dbState.row).includes(oldPhone));
    assert.ok(!JSON.stringify(dbState.row).includes("wamid.synthetic.inbound.1"));
    assert.equal(await mod.authorizeCustomerWindow(oldPhone,userId,"deal-a",args),true);
    assert.equal((await mod.recordSignedCustomerInbound(event(),args)).recorded,false,
      "duplicate signed webhook must not refresh window");
    const older=String(Math.floor((now.getTime()-60_000)/1000));
    assert.equal((await mod.recordSignedCustomerInbound(event(older,oldPhone,"wamid.older"),args)).recorded,false);
    const closeTime=new Date(now.getTime()+24*60*60_000-4*60_000);
    assert.equal(await mod.authorizeCustomerWindow(oldPhone,userId,"deal-a",
      {...args,now:closeTime}),false,"five-minute buffer prevents borderline sends");
    assert.equal(await mod.authorizeCustomerWindow(oldPhone,userId,"deal-a",
      {...args,now:new Date(now.getTime()+24*60*60_000)}),false);
    assert.equal(await mod.authorizeCustomerWindow(oldPhone,userId,"deal-a",
      {...args,secret:"wrong-key"}),false);
    assert.equal(await mod.authorizeCustomerWindow(oldPhone,"not-a-uuid","deal-a",args),false);
    dbState.user.phone=newPhone;
    assert.equal(await mod.authorizeCustomerWindow(newPhone,userId,"deal-a",args),false,
      "old phone evidence cannot authorize recovered new number");
    assert.equal(await mod.authorizeCustomerWindow(oldPhone,userId,"deal-a",args),false);
    dbState.user.status="suspended";
    assert.equal((await mod.recordSignedCustomerInbound(event(stamp,newPhone,"wamid.new"),args)).recorded,false);
    dbState.user.status="verified";
    const newTimestamp=String(Math.floor((now.getTime()+1000)/1000));
    const futureArgs={...args,now:new Date(now.getTime()+2000)};
    assert.equal((await mod.recordSignedCustomerInbound(event(newTimestamp,newPhone,"wamid.new"),futureArgs)).recorded,true);
    assert.equal(await mod.authorizeCustomerWindow(newPhone,userId,"deal-a",futureArgs),true);
    assert.equal(await mod.authorizeCustomerWindow(oldPhone,userId,"deal-a",futureArgs),false);
    dbState.row.phone_fingerprint="bad";
    assert.equal(await mod.authorizeCustomerWindow(newPhone,userId,"deal-a",futureArgs),false,
      "malformed stored fingerprint must fail closed");
  }finally{
    await unlink(file);
    delete (globalThis as any).__customerWindowDb;
  }
});
