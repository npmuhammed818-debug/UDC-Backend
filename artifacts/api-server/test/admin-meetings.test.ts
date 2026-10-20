import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('admin meeting routes require verified counterparties and preserve human scheduling', async t => {
  const source=await readFile(new URL('../src/routes/admin.ts',import.meta.url),'utf8');
  const names=[...new Set(source.match(/\b\w+Table\b/g))];
  const tables:any=Object.fromEntries(names.map(name=>[name,new Proxy({_table:name},{get:(t,k)=>k==='_table'?name:{column:k,table:name}})]));
  const records:any=Object.fromEntries(names.map(name=>[name,[]]));
  const dealId='11111111-1111-4111-8111-111111111111';
  records.dealsTable=[{id:dealId,buyerUserId:'buyer',sellerUserId:'seller'}];
  records.usersTable=[{id:'buyer',role:'buyer',status:'verified'},{id:'seller',role:'seller',status:'verified'}];
  const value=(x:any,r:any):any=>x?.column?r[x.column]:x;
  const predicate=(x:any,r:any):any=>x?.kind==='eq'?value(x.a,r)===value(x.b,r):x?.kind==='and'?x.args.every((c:any)=>predicate(c,r)):x?.kind==='in'?x.list.includes(value(x.a,r)):true;
  function select(fields?:any) {
    let table:any,condition:any,limit=Infinity;
    const q:any={from:(t:any)=>{table=t._table;return q},where:(c:any)=>{condition=c;return q},limit:(n:number)=>{limit=n;return q},orderBy:()=>q,
      then:(resolve:any,reject:any)=>Promise.resolve().then(()=>records[table].filter((r:any)=>predicate(condition,r)).slice(0,limit).map((r:any)=>fields?Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,value(v,r)])):{...r})).then(resolve,reject)};
    return q;
  }
  function mutation(table:any,update=false) {
    let input:any,condition:any,done:any;
    const run=()=>{if(done)return done; if(update){done=records[table._table].filter((r:any)=>predicate(condition,r));done.forEach((r:any)=>Object.assign(r,input));}
      else {done=(Array.isArray(input)?input:[input]).map((r:any)=>({id:randomUUID(),...r}));records[table._table].push(...done);}return done;};
    const q:any={values:(v:any)=>{input=v;return q},set:(v:any)=>{input=v;return q},where:(c:any)=>{condition=c;return q},returning:async()=>run(),then:(resolve:any,reject:any)=>Promise.resolve().then(run).then(resolve,reject)};
    return q;
  }
  const key='__adminMeetingFixture';
  const state:any={tables,db:{select,insert:(t:any)=>mutation(t),update:(t:any)=>mutation(t,true)},user:null};
  (globalThis as any)[key]=state;
  const output=fileURLToPath(new URL(`./admin-meeting-${randomUUID()}.mjs`,import.meta.url));
  const result=await build({stdin:{contents:`import express from 'express';import router from '../src/routes/admin';const app=express();app.use(express.json());app.use((req,res,next)=>{req.authUser=globalThis.${key}.user;next()});app.use(router);export default app;`,resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'isolated-admin',setup(b){
    const mocks:any={
      db:`const s=globalThis.${key};export const db=s.db;`+names.map(n=>`export const ${n}=s.tables.${n};`).join(''),
      orm:`export const eq=(a,b)=>({kind:'eq',a,b});export const and=(...args)=>({kind:'and',args});export const inArray=(a,list)=>({kind:'in',a,list});export const desc=x=>x;export const or=()=>true;export const ilike=()=>true;export const sql=()=>true;`,
      sessions:'export const getAuthenticatedUser=async()=>null;',
      whatsapp:'export const sendWhatsAppText=async()=>({delivered:false});',
      storage:'export const createSignedDownloadUrl=async()=>null;export const createSignedUploadUrl=async()=>null;export const downloadDocumentBytes=async()=>null;export const parseStoragePath=()=>null;export const storagePath=()=>null;',
      intelligence:'export const processDocumentIntelligence=async()=>null;export const refreshDealIntelligenceSnapshot=async()=>null;',
    };
    for(const [pattern,name] of [[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm'],[/auth\/sessions$|^\.\/sessions$/,'sessions'],[/whatsapp\/client$/,'whatsapp'],[/supabase\/storage$/,'storage'],[/akif\/documentIntelligence$/,'intelligence']] as const)
      b.onResolve({filter:pattern},()=>({path:name,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path]}));
  }}]});
  await writeFile(output,result.outputFiles[0].text);
  let server:any;
  try {
    const {default:app}=await import(output);server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const input={scheduledAt:'2026-11-01T12:00:00Z',provider:'UDC video',meetingUrl:'https://example.invalid/synthetic-meeting'};
    const request=async(path:string,body:any=input,method='POST')=>{
      const r=await fetch(base+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};
    };
    const path=`/admin/deals/${dealId}/meetings`;
    await t.test('anonymous, non-admin and suspended admin cannot schedule',async()=>{
      for(const user of [null,{id:'buyer',role:'buyer',status:'verified'},{id:'admin',role:'admin',status:'suspended'}]){
        state.user=user;assert.equal((await request(path)).status,user?403:401);
      }
      assert.equal(records.dealMeetingsTable.length,0);assert.equal(records.auditLogsTable.length,0);
    });
    state.user={id:'admin',role:'admin',status:'verified'};
    await t.test('pending, rejected, suspended, missing and wrong-role counterparties are blocked',async()=>{
      const seller=records.usersTable[1];
      for(const status of ['pending','under_review','rejected','suspended']){seller.status=status;assert.equal((await request(path)).status,409);}
      seller.status='verified';seller.role='agent';assert.equal((await request(path)).status,409);
      seller.role='seller';records.usersTable.pop();assert.equal((await request(path)).status,409);records.usersTable.push(seller);
      assert.equal(records.dealMeetingsTable.length,0);assert.equal(records.notificationsTable.length,0);
    });
    let id:string;
    await t.test('verified buyer and seller allow one audited admin booking',async()=>{
      const r=await request(path);assert.equal(r.status,201);id=r.data.meeting.id;
      assert.equal(records.dealMeetingsTable.length,1);assert.equal(records.dealMeetingsTable[0].scheduledBy,'admin');
      assert.equal(records.auditLogsTable[0].action,'deal_meeting_scheduled');assert.equal(records.notificationsTable.length,2);
    });
    await t.test('video needs a safe joining URL and face-to-face needs a location',async()=>{
      assert.equal((await request(path,{...input,meetingUrl:undefined})).status,400);
      assert.equal((await request(path,{...input,meetingUrl:'javascript:alert(1)'})).status,400);
      assert.equal((await request(path,{...input,provider:'in_person',meetingUrl:undefined,agenda:''})).status,400);
      const r=await request(path,{...input,provider:'in_person',meetingUrl:undefined,agenda:'Confirmed location: synthetic UDC office. Product review.'});
      assert.equal(r.status,201);assert.equal(r.data.meeting.provider,'in_person');assert.equal(r.data.meeting.meetingUrl,undefined);
    });
    await t.test('rescheduling rechecks verification but cancellation remains available',async()=>{
      records.usersTable[1].status='suspended';
      assert.equal((await request(`/admin/meetings/${id}`,{scheduledAt:'2026-11-02T12:00:00Z'},'PATCH')).status,409);
      assert.equal((await request(`/admin/meetings/${id}`,{status:'scheduled'},'PATCH')).status,409);
      assert.equal((await request(`/admin/meetings/${id}`,{status:'cancelled'},'PATCH')).status,200);
      assert.equal(records.dealMeetingsTable[0].status,'cancelled');
    });
  } finally {if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await unlink(output);delete (globalThis as any)[key];}
});
