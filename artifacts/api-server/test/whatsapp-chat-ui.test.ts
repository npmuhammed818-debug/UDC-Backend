import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile,unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

test('native WhatsApp menus and forms preserve role, privacy, review and replay boundaries',async t=>{
  const names=['auditLogsTable','companiesTable','companyVerificationDocumentsTable','commissionsTable','dealParticipantsTable','dealsTable','notificationsTable','referralsTable','usersTable','whatsappUserContextsTable','buyerRequestsTable','sellerListingsTable','productsTable'];
  const tables:any=Object.fromEntries(names.map(n=>[n,new Proxy({_table:n},{get:(_,k)=>k==='_table'?n:{column:k,table:n}})]));
  const rows:any=Object.fromEntries(names.map(n=>[n,[]]));
  const value=(x:any,r:any):any=>x?.column?(r[x.table]??r)[x.column]:x;
  const match=(c:any,r:any):any=>!c?true:c.kind==='eq'?value(c.a,r)===value(c.b,r):c.kind==='and'?c.args.every((x:any)=>match(x,r)):c.kind==='or'?c.args.some((x:any)=>match(x,r)):c.kind==='sql'?c.parts.join('').includes('lower(')?String((r.usersTable??r).email??'').toLowerCase()===c.values.at(-1):c.parts.join('').includes("->>")?(r.auditLogsTable??r).metadata?.[c.parts.join('').match(/->>'([^']+)'/)?.[1]]===c.values.at(-1):true:true;
  const state:any={tables,rows,sent:[],interactive:[],uploads:[],flowId:'123456',failAudit:false,locks:[]};
  function select(fields?:any){let table:any,c:any,joins:any[]=[],limit=Infinity;const q:any={from:(v:any)=>{table=v._table;return q},where:(v:any)=>{c=v;return q},limit:(n:number)=>{limit=n;return q},orderBy:()=>q,innerJoin:(v:any,on:any)=>{joins.push({table:v._table,on});return q},then:(resolve:any,reject:any)=>Promise.resolve().then(()=>{
    let result=rows[table].map((r:any)=>({[table]:r}));for(const join of joins)result=result.flatMap((r:any)=>rows[join.table].map((v:any)=>({...r,[join.table]:v})).filter((r:any)=>match(join.on,r)));
    return result.filter((r:any)=>match(c,r)).slice(0,limit).map((r:any)=>fields?Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,value(v,r)])):{...r[table]});
  }).then(resolve,reject)};return q;}
  function mutation(table:any,update=false){let input:any,c:any,done:any,conflict:any;const run=()=>{if(done)return done;if(state.failAudit&&table._table==='auditLogsTable'){state.failAudit=false;throw new Error('synthetic_audit_failure');}
    if(update){done=rows[table._table].filter((r:any)=>match(c,r));done.forEach((r:any)=>Object.assign(r,input));}
    else if(conflict){const column=conflict.target.column;const old=rows[table._table].find((r:any)=>r[column]===input[column]);if(old){Object.assign(old,conflict.set);done=[old];} }
    if(!done){done=(Array.isArray(input)?input:[input]).map((r:any)=>({id:randomUUID(),status:'pending',...r}));rows[table._table].push(...done);}return done;};
    const q:any={values:(v:any)=>{input=v;return q},set:(v:any)=>{input=v;return q},where:(v:any)=>{c=v;return q},onConflictDoUpdate:(v:any)=>{conflict=v;return q},returning:(fields?:any)=>{const result=run();return Promise.resolve(fields?result.map((r:any)=>Object.fromEntries(Object.entries(fields).map(([k,v]:any)=>[k,r[v.column]]))):result)},then:(resolve:any,reject:any)=>Promise.resolve().then(run).then(resolve,reject)};return q;
  }
  state.db={select,insert:(table:any)=>mutation(table),update:(table:any)=>mutation(table,true),execute:async(v:any)=>{state.locks.push(v);}};
  let queue=Promise.resolve();state.db.transaction=(f:any)=>{const job=queue.then(async()=>{const before=structuredClone(rows);try{return await f(state.db);}catch(error){for(const n of names)rows[n]=before[n];throw error;}});queue=job.catch(()=>{});return job;};
  (globalThis as any).__chatUiFixture=state;
  const output=fileURLToPath(new URL(`./chat-ui-${randomUUID()}.mjs`,import.meta.url));
  const bundle=await build({stdin:{contents:"export * from '../src/whatsapp/chatUi';export * from '../src/whatsapp/flowToken';export * from '../src/whatsapp/flowDefinitions';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},platform:'node',format:'esm',bundle:true,packages:'external',write:false,plugins:[{name:'chat-ui-fixture',setup(b){
    const fixtures:any={db:'const s=globalThis.__chatUiFixture;export const db=s.db;'+names.map(n=>`export const ${n}=s.tables.${n};`).join(''),orm:"export const eq=(a,b)=>({kind:'eq',a,b});export const and=(...args)=>({kind:'and',args});export const or=(...args)=>({kind:'or',args});export const desc=x=>x;export const sql=(parts,...values)=>({kind:'sql',parts,values});",client:"const s=globalThis.__chatUiFixture;export const sendWhatsAppText=async(to,body)=>{s.sent.push({to,body});return {delivered:true,messageId:'out-'+s.sent.length}};export const sendWhatsAppInteractive=async(to,body)=>{s.interactive.push({to,body});return {delivered:true,messageId:'ui-'+s.interactive.length}};export const downloadWhatsAppMedia=async()=>({bytes:Buffer.from('%PDF-synthetic-document'),mimeType:'application/pdf'});",storage:"export const uploadDocumentBytes=async(path)=>{globalThis.__chatUiFixture.uploads.push(path);return 'storage://private/'+path;};",setup:"export const publishedFlowId=async()=>globalThis.__chatUiFixture.flowId;",password:"export const hashPassword=async()=> 'synthetic-unusable-hash';"};
    for(const [filter,path] of [[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm'],[/^\.\/client$/,'client'],[/supabase\/storage$/,'storage'],[/^\.\/setupFlows$/,'setup'],[/auth\/passwords$/,'password']] as const)b.onResolve({filter},()=>({path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path]}));
  }}]});
  await writeFile(output,bundle.outputFiles[0].text);const previous=process.env.WHATSAPP_APP_SECRET;process.env.WHATSAPP_APP_SECRET='synthetic-chat-ui-secret-at-least-32';
  try{
    const m=await import(output),phone='10000000001';
    const ui=(id:string)=>({interactive:{type:'list_reply',list_reply:{id:'udc:'+id}}});
    const last=()=>state.sent.at(-1)?.body;
    await t.test('buttons and role menus use stable IDs; all forms are terminal review submissions',async()=>{
      await m.sendChatHome(phone);assert.equal(state.interactive.at(-1).body.type,'button');assert.equal(state.interactive.at(-1).body.action.buttons.length,3);
      for(const role of ['buyer','seller','agent']){const menu=m.menuForRole(role);assert.ok(menu.length>4&&menu.length<=10);assert.ok(menu.every((r:any)=>r.title.length<=24&&r.id.startsWith('udc:')));}
      assert.equal(m.chatAction({interactive:{type:'list_reply',list_reply:{id:'unknown',title:'Submit requirement'}}}),'invalid');assert.equal(m.chatAction({text:{body:'100 MT copper'}}),null);assert.equal(m.chatAction({text:{body:'Menu'}}),'menu');
      for(const flow of Object.values(m.flowDefinitions) as any[]){assert.equal(flow.json.screens[0].terminal,true);assert.equal(flow.json.screens[0].layout.children[0].children.at(-1)['on-click-action'].name,'complete');}
      await m.handleChatUi(phone,ui('buyer'));assert.equal(state.interactive.at(-1).body.type,'flow');assert.equal(state.interactive.at(-1).body.action.parameters.flow_id,'123456');
    });
    await t.test('form proof expires, binds to its WhatsApp owner and ignores tampering',async()=>{
      const token=m.issueFlowToken(phone,'profile_buyer');assert.ok(m.readFlowToken(token,phone));assert.equal(m.readFlowToken(token,'10000000002'),null);assert.equal(m.readFlowToken(token+'x',phone),null);
      const now=Date.now;Date.now=()=>now()+31*60_000;try{assert.equal(m.readFlowToken(token,phone),null);}finally{Date.now=now;}
      assert.match(await m.submitChatFlow(phone,'not-json'),/invalid/);assert.match(await m.submitChatFlow(phone,JSON.stringify({flow_token:'forged'})),/expired/);
    });
    await t.test('registration keeps business email rules, pending review and roles; replay makes one profile',async()=>{
      const input={flow_token:m.issueFlowToken(phone,'profile_buyer'),full_name:'Synthetic Buyer',email:'sample@gmail.com',company_name:'Synthetic Trading',country:'UAE'};
      assert.match(await m.submitChatFlow(phone,JSON.stringify(input)),/company email/);assert.equal(rows.usersTable.length,0);
      input.email='buyer@example.invalid';const raw=JSON.stringify(input);const results=await Promise.all([m.submitChatFlow(phone,raw),m.submitChatFlow(phone,raw)]);assert.ok(results.some((r:string)=>r.includes('already received')));assert.equal(rows.usersTable.length,1);assert.equal(rows.usersTable[0].status,'pending');assert.equal(rows.usersTable[0].role,'buyer');assert.equal(rows.companiesTable.length,1);
      assert.match(await m.submitChatFlow(phone,JSON.stringify({...input,flow_token:m.issueFlowToken(phone,'profile_agent')})),/role changes/);assert.equal(rows.usersTable[0].role,'buyer');
      const agentPhone='10000000003';assert.match(await m.submitChatFlow(agentPhone,JSON.stringify({flow_token:m.issueFlowToken(agentPhone,'profile_agent'),full_name:'Synthetic Agent',email:'agent@gmail.com'})),/saved/);assert.equal(rows.usersTable.find((u:any)=>u.phone===agentPhone).status,'pending');
      const conflictPhone='10000000004';assert.match(await m.submitChatFlow(conflictPhone,JSON.stringify({...input,flow_token:m.issueFlowToken(conflictPhone,'profile_buyer')})),/already belongs/);assert.equal(rows.usersTable.length,2);
    });
    await t.test('trade forms reuse real writers with exact terms; nonce and audit failures cannot duplicate writes',async()=>{
      const form={flow_token:m.issueFlowToken(phone,'buyer'),product:'Copper cathode',quantity:'100',destination:'Jebel Ali',incoterm:'CIF',target_price:'5900',specification:'Grade A',delivery_time:'30 days'};
      assert.match(await m.submitChatFlow(phone,JSON.stringify(form)),/saved/);assert.equal(rows.buyerRequestsTable.length,1);assert.equal(rows.buyerRequestsTable[0].destination,'Jebel Ali');assert.equal(rows.buyerRequestsTable[0].targetPrice,'5900');assert.equal(rows.buyerRequestsTable[0].status,'pending_admin_review');
      assert.match(await m.submitChatFlow(phone,JSON.stringify(form)),/already received/);assert.equal(rows.buyerRequestsTable.length,1);
      assert.match(await m.submitChatFlow(phone,JSON.stringify({...form,flow_token:m.issueFlowToken(phone,'seller')})),/account role/);
      state.failAudit=true;await assert.rejects(m.submitChatFlow(phone,JSON.stringify({...form,flow_token:m.issueFlowToken(phone,'buyer')})),/audit_failure/);assert.equal(rows.buyerRequestsTable.length,1);
      const b=rows.usersTable.find((u:any)=>u.phone===phone);b.status='suspended';assert.match(await m.submitChatFlow(phone,JSON.stringify({...form,flow_token:m.issueFlowToken(phone,'buyer')})),/UDC review/);b.status='verified';
    });
    await t.test('private data only comes from own deals, assignments, referrals and commissions',async()=>{
      const buyer=rows.usersTable.find((u:any)=>u.phone===phone),own=randomUUID(),other=randomUUID();
      rows.dealsTable=[{id:own,dealNumber:'UDC-OWN',buyerUserId:buyer.id,sellerUserId:'seller',status:'negotiation'},{id:other,dealNumber:'UDC-PRIVATE',buyerUserId:'other',sellerUserId:'other-seller',status:'banking'}];
      await m.handleChatUi(phone,ui('deals'));const list=state.interactive.at(-1).body.action.sections[0].rows;assert.equal(list.length,1);assert.equal(list[0].title,'UDC-OWN');
      await m.handleChatUi(phone,ui('deal:'+other));assert.match(last(),/unavailable/);assert.equal(rows.whatsappUserContextsTable.length,0);
      await m.handleChatUi(phone,ui('deal:'+own));assert.equal(rows.whatsappUserContextsTable[0].activeDealId,own);
      const agent=rows.usersTable.find((u:any)=>u.role==='agent');await m.handleChatUi(agent.phone,ui('commissions'));assert.match(last(),/Verified agent approval/);agent.status='verified';
      rows.commissionsTable=[{beneficiaryUserId:agent.id,currency:'USD',amount:'50',status:'pending'},{beneficiaryUserId:'other',currency:'USD',amount:'999999',status:'paid'}];await m.handleChatUi(agent.phone,ui('commissions'));assert.match(last(),/50/);assert.doesNotMatch(last(),/999999/);
      rows.dealParticipantsTable=[{dealId:own,userId:agent.id,participantRole:'agent'}];await m.handleChatUi(agent.phone,ui('deals'));assert.equal(state.interactive.at(-1).body.action.sections[0].rows.length,1);
    });
    await t.test('company PDFs need an owned quoted request and remain private, reviewed and idempotent',async()=>{
      const buyer=rows.usersTable.find((u:any)=>u.phone===phone);await m.handleChatUi(phone,ui('documents'));const request=state.sent.length;
      const doc={id:'synthetic-doc-message',context:{id:'out-'+request},document:{id:'media-1'}};
      assert.equal(await m.handleChatUi('10000000003',doc),false);assert.equal(state.uploads.length,0);
      assert.equal(await m.handleChatUi(phone,doc),true);assert.equal(rows.companyVerificationDocumentsTable.length,1);assert.equal(rows.companyVerificationDocumentsTable[0].uploadedBy,buyer.id);assert.equal(rows.companyVerificationDocumentsTable[0].status,'pending');assert.match(rows.companyVerificationDocumentsTable[0].fileUrl,/storage:\/\/private/);
      await m.handleChatUi(phone,doc);assert.equal(state.uploads.length,1);assert.equal(rows.companyVerificationDocumentsTable.length,1);
      state.flowId=null;await m.handleChatUi(phone,ui('requirement'));assert.match(last(),/being activated/);
      assert.ok(state.sent.every((s:any)=>!s.body.includes('https://udc-backend.onrender.com/login')));
    });
  }finally{await unlink(output);delete (globalThis as any).__chatUiFixture;if(previous===undefined)delete process.env.WHATSAPP_APP_SECRET;else process.env.WHATSAPP_APP_SECRET=previous;}
});
