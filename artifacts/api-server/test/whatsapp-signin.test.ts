import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

test('WhatsApp web sign-in requires phone ownership, private browser proof and single use',async t=>{
  const names=['usersTable','whatsappSigninChallengesTable','auditLogsTable','authSessionsTable'];
  const records:any=Object.fromEntries(names.map(n=>[n,[]]));
  const tables:any=Object.fromEntries(names.map(n=>[n,new Proxy({_table:n},{get:(_,k)=>k==='_table'?n:{column:k}})]));
  const value=(x:any,row:any)=>x?.column?row[x.column]:x;
  const matches=(c:any,row:any)=>!c?true:c.kind==='eq'?value(c.a,row)===value(c.b,row):c.kind==='lt'?value(c.a,row)<value(c.b,row):true;
  const state:any={tables,user:null,locks:[]};
  const select=(fields?:any)=>{
    let table:any,condition:any;const q:any={from:(v:any)=>{table=v._table;return q},where:(v:any)=>{condition=v;return q},limit:()=>q,for:()=>q,
      then:(resolve:any,reject:any)=>Promise.resolve().then(()=>records[table].filter((r:any)=>matches(condition,r)).map((r:any)=>fields?Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,value(v,r)])):{...r})).then(resolve,reject)};return q;
  };
  const mutation=(table:any,mode:string)=>{
    let input:any,condition:any,done:any;const run=()=>{
      if(done)return done;
      if(mode==='insert'){done=[{id:randomUUID(),status:'pending',...input}];records[table._table].push(...done);}
      else{done=records[table._table].filter((r:any)=>matches(condition,r));if(mode==='update')done.forEach((r:any)=>Object.assign(r,input));else records[table._table]=records[table._table].filter((r:any)=>!matches(condition,r));}
      return done;
    };
    const q:any={values:(v:any)=>{input=v;return q},set:(v:any)=>{input=v;return q},where:(v:any)=>{condition=v;return q},returning:()=>q,then:(resolve:any,reject:any)=>Promise.resolve().then(run).then(resolve,reject)};return q;
  };
  state.db={select,insert:(v:any)=>mutation(v,'insert'),update:(v:any)=>mutation(v,'update'),delete:(v:any)=>mutation(v,'delete'),execute:async(v:any)=>{state.locks.push(v);}};
  let queue=Promise.resolve();state.db.transaction=(f:any)=>{const job=queue.then(()=>f(state.db));queue=job.catch(()=>{});return job;};
  (globalThis as any).__whatsappSigninFixture=state;
  const output=fileURLToPath(new URL(`./whatsapp-signin-${randomUUID()}.mjs`,import.meta.url));
  const bundle=await build({stdin:{contents:"import express from 'express';import router from '../src/routes/whatsappSignin';import profile from '../src/routes/profile';export * from '../src/auth/whatsappSignin';const app=express();app.use(express.json());app.use((req,res,next)=>{req.authUser=globalThis.__whatsappSigninFixture.user;next()});app.use(router);app.use(profile);export default app;",resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'isolated-signin',setup(b){
    const fixtures:any={db:'const s=globalThis.__whatsappSigninFixture;export const db=s.db;'+names.map(n=>`export const ${n}=s.tables.${n};`).join(''),orm:"export const eq=(a,b)=>({kind:'eq',a,b});export const lt=(a,b)=>({kind:'lt',a,b});export const gt=()=>true;export const isNull=()=>true;export const and=()=>true;export const ne=()=>true;export const sql=(parts,...values)=>({parts,values});",profile:"export const getSafeUserProfile=async()=>({});"};
    for(const [filter,path] of [[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm'],[/auth\/userProfile$/,'profile']] as const)b.onResolve({filter},()=>({path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path]}));
  }}]});
  await writeFile(output,bundle.outputFiles[0].text);let server:any;
  const previousSecret=process.env.SESSION_SECRET;process.env.SESSION_SECRET='synthetic-signin-session-secret';
  try{
    const m=await import(output);server=m.default.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const request=async(path:string,body:any,method='POST')=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const poll=(browserToken:string)=>request('/auth/whatsapp-signin/poll',{browserToken});
    const start=async(role='buyer',linkAccount=false)=>{const r=await request('/auth/whatsapp-signin/request',{role,linkAccount});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');return r.json();};
    const approve=async(c:any,phone='10000000001')=>{await m.handleWhatsAppSignin(phone,'LOGIN '+c.code,'Synthetic user');return m.handleWhatsAppSignin(phone,'CONFIRM LOGIN '+c.code,'Synthetic user');};
    await t.test('new phone accounts need both confirmations; secrets are hashed and the cookie is private',async()=>{
      const c=await start('seller');assert.match(c.code,/^[A-F0-9]{16}$/);assert.match(c.browserToken,/^[A-Za-z0-9_-]{43}$/);
      const row=records.whatsappSigninChallengesTable.at(-1);assert.equal(row.code,undefined);assert.equal(row.browserToken,undefined);assert.notEqual(row.codeHash,c.code);assert.notEqual(row.browserTokenHash,c.browserToken);
      assert.match(await m.handleWhatsAppSignin('10000000001','CONFIRM LOGIN '+c.code),/first/);assert.equal(records.usersTable.length,0);
      assert.deepEqual(await (await poll(c.browserToken)).json(),{status:'pending'});
      assert.match(await m.handleWhatsAppSignin('10000000001','LOGIN '+c.code),/Never approve/);
      assert.match(await m.handleWhatsAppSignin('10000000002','CONFIRM LOGIN '+c.code),/unavailable/);assert.equal(records.usersTable.length,0);
      assert.match(await m.handleWhatsAppSignin('10000000001','CONFIRM LOGIN '+c.code),/Approved/);
      assert.equal(records.usersTable[0].role,'seller');assert.equal(records.usersTable[0].status,'pending');
      assert.equal((await poll(c.code)).status,400);
      const response=await poll(c.browserToken);assert.deepEqual(await response.json(),{status:'approved'});assert.match(response.headers.get('set-cookie')!,/HttpOnly/);assert.match(response.headers.get('set-cookie')!,/SameSite=Lax/);assert.equal(records.authSessionsTable.length,1);assert.equal(records.authSessionsTable[0].token,undefined);
      assert.deepEqual(await (await poll(c.browserToken)).json(),{status:'expired'});assert.equal(records.authSessionsTable.length,1);assert.equal(row.phone,null);
    });
    await t.test('existing role and status survive; concurrent polls issue one session',async()=>{
      records.usersTable[0].status='verified';const c=await start('agent');await approve(c);
      const before=records.authSessionsTable.length;const responses=await Promise.all([poll(c.browserToken),poll(c.browserToken)]);const statuses=await Promise.all(responses.map(r=>r.json()));assert.deepEqual(statuses.map(x=>x.status).sort(),['approved','expired']);assert.equal(records.authSessionsTable.length,before+1);assert.equal(records.usersTable.length,1);assert.equal(records.usersTable[0].role,'seller');assert.equal(records.usersTable[0].status,'verified');
    });
    await t.test('expired, suspended, administrator and email-backed identities cannot use anonymous phone login',async()=>{
      const c=await start();records.whatsappSigninChallengesTable.at(-1).expiresAt=new Date(0);assert.match(await approve(c),/expired/);assert.deepEqual(await (await poll(c.browserToken)).json(),{status:'expired'});
      for(const patch of [{status:'suspended'},{role:'admin',status:'verified'},{role:'buyer',status:'verified',email:'synthetic@example.invalid'}]){
        Object.assign(records.usersTable[0],{email:null},patch);const next=await m.requestWhatsAppSignin('buyer');assert.match(await approve(next),/email and password/);assert.deepEqual(await (await poll(next.browserToken)).json(),{status:'pending'});
      }
    });
    await t.test('linking requires the initiating web session, never merges profiles and rejects caller-supplied identities',async()=>{
      state.user=null;assert.equal((await request('/auth/whatsapp-signin/request',{role:'buyer',linkAccount:true})).status,403);
      state.user={id:'web',role:'buyer',status:'pending'};records.usersTable.push({...state.user,email:'web@example.invalid',phone:null});
      assert.equal((await request('/auth/whatsapp-signin/request',{role:'buyer',linkAccount:true,linkUserId:'victim'})).status,400);
      const conflict=await start('buyer',true);assert.match(await approve(conflict),/already has a UDC profile/);assert.equal(records.usersTable.find((u:any)=>u.id==='web').phone,null);
      const c=await start('buyer',true);assert.match(await approve(c,'10000000003'),/Approved/);assert.equal(records.usersTable.find((u:any)=>u.id==='web').phone,'10000000003');
      state.user=null;assert.deepEqual(await (await poll(c.browserToken)).json(),{status:'expired'});state.user={id:'other',role:'buyer',status:'verified'};assert.deepEqual(await (await poll(c.browserToken)).json(),{status:'expired'});
      state.user={id:'web',role:'buyer',status:'pending'};assert.deepEqual(await (await poll(c.browserToken)).json(),{status:'approved'});assert.equal(records.usersTable.find((u:any)=>u.id==='web').status,'pending');
      const claim=await request('/profile',{phone:'10000000099'},'PUT');assert.equal(claim.status,400);assert.equal(records.usersTable.find((u:any)=>u.id==='web').phone,'10000000003');
    });
    await t.test('approval cannot bypass a later suspension and challenge creation is bounded',async()=>{
      state.user=null;const c=await m.requestWhatsAppSignin('agent');await approve(c,'10000000004');records.usersTable.find((u:any)=>u.phone==='10000000004').status='suspended';assert.deepEqual(await (await poll(c.browserToken)).json(),{status:'expired'});
      let r:any;for(let i=0;i<15;i++)r=await request('/auth/whatsapp-signin/request',{role:'buyer'});assert.equal(r.status,429);
      assert.ok(state.locks.some((x:any)=>x.parts.join('').includes('pg_advisory_xact_lock')));
      assert.ok(records.auditLogsTable.every((x:any)=>!JSON.stringify(x.metadata).includes('browserToken')&&!JSON.stringify(x.metadata).includes('code')));
    });
  }finally{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await unlink(output);delete (globalThis as any).__whatsappSigninFixture;if(previousSecret===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=previousSecret;}
});
