import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile,unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

test('native WhatsApp menus and forms preserve role, privacy, review and replay boundaries',async t=>{
  const names=['auditLogsTable','companiesTable','companyVerificationDocumentsTable','commissionsTable','dealParticipantsTable','dealsTable','notificationsTable','referralsTable','usersTable','whatsappUserContextsTable','buyerRequestsTable','sellerListingsTable','productsTable','whatsappChatSessionsTable','matchesTable'];
  const tables:any=Object.fromEntries(names.map(n=>[n,new Proxy({_table:n},{get:(_,k)=>k==='_table'?n:{column:k,table:n}})]));
  const rows:any=Object.fromEntries(names.map(n=>[n,[]]));
  const value=(x:any,r:any):any=>x?.column?(r[x.table]??r)[x.column]:x;
  const match=(c:any,r:any):any=>!c?true:c.kind==='eq'?value(c.a,r)===value(c.b,r):c.kind==='lt'?value(c.a,r)<value(c.b,r):c.kind==='and'?c.args.every((x:any)=>match(x,r)):c.kind==='or'?c.args.some((x:any)=>match(x,r)):c.kind==='sql'?c.parts.join('').includes('lower(')?String((r.usersTable??r).email??'').toLowerCase()===c.values.at(-1):c.parts.join('').includes("->>")?(r.auditLogsTable??r).metadata?.[c.parts.join('').match(/->>'([^']+)'/)?.[1]]===c.values.at(-1):true:true;
  const state:any={tables,rows,sent:[],interactive:[],uploads:[],flowId:'123456',failAudit:false,locks:[],modelCalls:0,modelOutput:'{}'};
  function select(fields?:any){let table:any,c:any,joins:any[]=[],limit=Infinity;const q:any={from:(v:any)=>{table=v._table;return q},where:(v:any)=>{c=v;return q},limit:(n:number)=>{limit=n;return q},orderBy:()=>q,innerJoin:(v:any,on:any)=>{joins.push({table:v._table,on});return q},then:(resolve:any,reject:any)=>Promise.resolve().then(()=>{
    let result=rows[table].map((r:any)=>({[table]:r}));for(const join of joins)result=result.flatMap((r:any)=>rows[join.table].map((v:any)=>({...r,[join.table]:v})).filter((r:any)=>match(join.on,r)));
    return result.filter((r:any)=>match(c,r)).slice(0,limit).map((r:any)=>fields?Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,value(v,r)])):{...r[table]});
  }).then(resolve,reject)};return q;}
  function mutation(table:any,update=false,remove=false){let input:any,c:any,done:any,conflict:any;const run=()=>{if(done)return done;if(state.failAudit&&table._table==='auditLogsTable'){state.failAudit=false;throw new Error('synthetic_audit_failure');}
    if(remove){done=rows[table._table].filter((r:any)=>match(c,r));rows[table._table]=rows[table._table].filter((r:any)=>!match(c,r));}
    else if(update){done=rows[table._table].filter((r:any)=>match(c,r));done.forEach((r:any)=>Object.assign(r,input));}
    else if(conflict){const column=conflict.target.column;const old=rows[table._table].find((r:any)=>r[column]===input[column]);if(old){Object.assign(old,conflict.set);done=[old];} }
    if(!done){done=(Array.isArray(input)?input:[input]).map((r:any)=>({id:randomUUID(),status:'pending',...r}));rows[table._table].push(...done);}return done;};
    const q:any={values:(v:any)=>{input=v;return q},set:(v:any)=>{input=v;return q},where:(v:any)=>{c=v;return q},onConflictDoUpdate:(v:any)=>{conflict=v;return q},returning:(fields?:any)=>{const result=run();return Promise.resolve(fields?result.map((r:any)=>Object.fromEntries(Object.entries(fields).map(([k,v]:any)=>[k,r[v.column]]))):result)},then:(resolve:any,reject:any)=>Promise.resolve().then(run).then(resolve,reject)};return q;
  }
  state.db={select,insert:(table:any)=>mutation(table),update:(table:any)=>mutation(table,true),delete:(table:any)=>mutation(table,false,true),execute:async(v:any)=>{state.locks.push(v);}};
  let queue=Promise.resolve();state.db.transaction=(f:any)=>{const job=queue.then(async()=>{const before=structuredClone(rows);try{return await f(state.db);}catch(error){for(const n of names)rows[n]=before[n];throw error;}});queue=job.catch(()=>{});return job;};
  (globalThis as any).__chatUiFixture=state;
  const output=fileURLToPath(new URL(`./chat-ui-${randomUUID()}.mjs`,import.meta.url));
  const bundle=await build({stdin:{contents:"export * from '../src/whatsapp/chatUi';export * from '../src/whatsapp/flowToken';export * from '../src/whatsapp/flowDefinitions';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},platform:'node',format:'esm',bundle:true,packages:'external',write:false,plugins:[{name:'chat-ui-fixture',setup(b){
    const fixtures:any={hermes:"export const runConversationChat=async()=>{const s=globalThis.__chatUiFixture;s.modelCalls++;return {content:s.modelOutput};};",db:'const s=globalThis.__chatUiFixture;export const db=s.db;'+names.map(n=>`export const ${n}=s.tables.${n};`).join(''),orm:"export const inArray=(a,list)=>({kind:'in',a,list});export const lt=(a,b)=>({kind:'lt',a,b});export const eq=(a,b)=>({kind:'eq',a,b});export const and=(...args)=>({kind:'and',args});export const or=(...args)=>({kind:'or',args});export const desc=x=>x;export const sql=(parts,...values)=>({kind:'sql',parts,values});",client:"const s=globalThis.__chatUiFixture;export const sendWhatsAppText=async(to,body)=>{s.sent.push({to,body});return {delivered:true,messageId:'out-'+s.sent.length}};export const sendWhatsAppTextWithMenu=async(to,body)=>{s.sent.push({to,body,withMenu:true});return {delivered:true,messageId:'out-'+s.sent.length}};export const sendWhatsAppInteractive=async(to,body)=>{s.interactive.push({to,body});return {delivered:true,messageId:'ui-'+s.interactive.length}};export const downloadWhatsAppMedia=async()=>({bytes:Buffer.from('%PDF-synthetic-document'),mimeType:'application/pdf'});",storage:"export const uploadDocumentBytes=async(path)=>{globalThis.__chatUiFixture.uploads.push(path);return 'storage://private/'+path;};",setup:"export const publishedFlowId=async()=>globalThis.__chatUiFixture.flowId;",password:"export const hashPassword=async()=> 'synthetic-unusable-hash';"};
    for(const [filter,path] of [[/intelligence\/hermesClient$/,'hermes'],[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm'],[/whatsapp\/client$|^\.\/client$/,'client'],[/supabase\/storage$/,'storage'],[/^\.\/setupFlows$/,'setup'],[/auth\/passwords$/,'password']] as const)b.onResolve({filter},()=>({path,namespace:'fixture'}));
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
      assert.equal(m.chatAction({interactive:{type:'list_reply',list_reply:{id:'unknown',title:'Submit requirement'}}}),'invalid');assert.equal(m.chatAction({text:{body:'100 MT copper'}}),null);assert.equal(m.chatAction({text:{body:'Menu'}}),'menu');assert.equal(m.chatAction({text:{body:'My code'}}),'invite');assert.equal(m.chatAction({text:{body:'More options'}}),'more');assert.equal(m.chatAction({text:{body:'Hi'}}),null);assert.equal(m.chatAction({text:{body:'hello'}}),null);assert.equal(m.chatAction({text:{body:'help'}}),null);assert.equal(m.chatAction({text:{body:'start'}}),null);assert.equal(m.chatAction({text:{body:'Show me the menu'}}),'menu');
      for(const flow of Object.values(m.flowDefinitions) as any[]){assert.equal(flow.json.screens[0].terminal,true);assert.equal(flow.json.screens[0].layout.children[0].children.at(-1)['on-click-action'].name,'complete');}
      const beforeUnprompted=state.interactive.length;
      assert.equal(await m.handleChatUi(phone,{text:{body:'Hello'}}),false);
      assert.equal(await m.handleChatUi(phone,{text:{body:'I would like to learn about UDC'}}),false);
      assert.equal(state.interactive.length,beforeUnprompted,'regular chat must not open menu');
      await m.handleChatUi(phone,{text:{body:'Menu'}});
      assert.equal(state.interactive.at(-1).body.type,'button');
      assert.equal(state.interactive.length,beforeUnprompted+1,'explicit menu request should open home');
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
      await m.handleChatUi(agent.phone,ui('menu'));
      const shortcuts=state.interactive.at(-1).body.action.buttons.map((b:any)=>b.reply.id);
      assert.deepEqual(shortcuts,['udc:invite','udc:referrals','udc:more']);
      await m.handleChatUi(agent.phone,ui('more'));
      const allOptions=state.interactive.at(-1).body.action.sections[0].rows;
      assert.ok(allOptions.some((r:any)=>r.id==='udc:commissions'));
      assert.ok(allOptions.some((r:any)=>r.id==='udc:profile'));
      await m.handleChatUi(agent.phone,ui('invite'));
      assert.match(last(),/^UDC-[0-9A-F]{12}$/);
      assert.match(state.sent.at(-2).body,/after joining UDC/);
      assert.ok(!state.sent.at(-1).body.includes('Share this'));

      rows.commissionsTable=[{beneficiaryUserId:agent.id,currency:'USD',amount:'50',status:'pending'},{beneficiaryUserId:'other',currency:'USD',amount:'999999',status:'paid'}];await m.handleChatUi(agent.phone,ui('commissions'));assert.match(last(),/50/);assert.doesNotMatch(last(),/999999/);
      rows.dealParticipantsTable=[{dealId:own,userId:agent.id,participantRole:'agent',status:'active'}];await m.handleChatUi(agent.phone,ui('deals'));assert.equal(state.interactive.at(-1).body.action.sections[0].rows.length,1);
      rows.dealParticipantsTable[0].status='revoked';await m.handleChatUi(agent.phone,ui('deals'));assert.match(last(),/No approved deals/);await m.handleChatUi(agent.phone,ui('deal:'+own));assert.match(last(),/unavailable/);
    });
    await t.test('company PDFs need an owned quoted request and remain private, reviewed and idempotent',async()=>{
      const buyer=rows.usersTable.find((u:any)=>u.phone===phone);await m.handleChatUi(phone,ui('documents'));const request=state.sent.length;
      const doc={id:'synthetic-doc-message',context:{id:'out-'+request},document:{id:'media-1'}};
      assert.equal(await m.handleChatUi('10000000003',doc),false);assert.equal(state.uploads.length,0);
      assert.equal(await m.handleChatUi(phone,doc),true);assert.equal(rows.companyVerificationDocumentsTable.length,1);assert.equal(rows.companyVerificationDocumentsTable[0].uploadedBy,buyer.id);assert.equal(rows.companyVerificationDocumentsTable[0].status,'pending');assert.match(rows.companyVerificationDocumentsTable[0].fileUrl,/storage:\/\/private/);
      await m.handleChatUi(phone,doc);assert.equal(state.uploads.length,1);assert.equal(rows.companyVerificationDocumentsTable.length,1);
      state.flowId=null;await m.handleChatUi(phone,ui('requirement'));assert.match(last(),/product/);delete rows.whatsappChatSessionsTable[0].data.__paragraph;assert.equal(rows.whatsappChatSessionsTable.length,1);
      assert.ok(state.sent.every((s:any)=>!s.body.includes('https://udc-backend.onrender.com/login')));
    });
    await t.test('guided WhatsApp intake validates each answer and waits for an explicit submit button',async()=>{
      const before=rows.buyerRequestsTable.length;
      const answer=(id:string,body:string)=>m.handleChatUi(phone,{id,text:{body}});
      await answer('guided-1','Copper cathode');assert.equal(rows.whatsappChatSessionsTable[0].step,1);
      await answer('guided-1','Copper cathode');assert.equal(rows.whatsappChatSessionsTable[0].step,1);
      await answer('guided-bad','100 MT');assert.equal(rows.whatsappChatSessionsTable[0].step,1);assert.match(last(),/metric tonnes/);
      for(const [index,text] of ['100','Grade A','Jebel Ali','CIF','5900','30 days','Skip'].entries())await answer('guided-'+(index+2),text);
      assert.equal(rows.buyerRequestsTable.length,before);assert.equal(state.interactive.at(-1).body.type,'button');assert.equal(state.interactive.at(-1).body.action.buttons[0].reply.id,'udc:submit');
      await answer('guided-review','Are these details saved?');assert.equal(rows.buyerRequestsTable.length,before);
      await m.handleChatUi(phone,{...ui('submit'),id:'guided-confirm'});assert.equal(rows.buyerRequestsTable.length,before+1);assert.equal(rows.whatsappChatSessionsTable.length,0);
      await m.handleChatUi(phone,{...ui('submit'),id:'guided-confirm'});assert.equal(rows.buyerRequestsTable.length,before+1);
      assert.equal(rows.buyerRequestsTable.at(-1).targetPrice,'5900');assert.equal(rows.buyerRequestsTable.at(-1).status,'pending_admin_review');
    });
    await t.test('guided drafts support editing, cancellation, expiry and safe retry after audit failure',async()=>{
      const answer=(body:string)=>m.handleChatUi(phone,{id:randomUUID(),text:{body}});
      await m.handleChatUi(phone,ui('requirement'));delete rows.whatsappChatSessionsTable[0].data.__paragraph;await answer('Sugar');await m.handleChatUi(phone,ui('restart'));assert.equal(rows.whatsappChatSessionsTable[0].step,0);assert.deepEqual(rows.whatsappChatSessionsTable[0].data,{__paragraph:'1'});
      await m.handleChatUi(phone,ui('cancel'));assert.equal(rows.whatsappChatSessionsTable.length,0);assert.match(last(),/Nothing was submitted/);
      await m.handleChatUi(phone,ui('requirement'));rows.whatsappChatSessionsTable[0].expiresAt=new Date(0);await answer('Sugar');assert.match(last(),/expired/);assert.equal(rows.whatsappChatSessionsTable.length,0);
      await m.handleChatUi(phone,ui('requirement'));delete rows.whatsappChatSessionsTable[0].data.__paragraph;for(const text of ['Sugar','200','Skip','Mombasa','CIF','Skip','Skip','Skip'])await answer(text);
      const before=rows.buyerRequestsTable.length;state.failAudit=true;await assert.rejects(m.handleChatUi(phone,ui('submit')),/audit_failure/);assert.equal(rows.buyerRequestsTable.length,before);assert.equal(rows.whatsappChatSessionsTable.length,1);
      await m.handleChatUi(phone,ui('submit'));assert.equal(rows.buyerRequestsTable.length,before+1);assert.equal(rows.whatsappChatSessionsTable.length,0);
      await m.handleChatUi(phone,ui('requirement'));await m.handleChatUi(phone,ui('menu'));assert.equal(rows.whatsappChatSessionsTable.length,1);
    });
    await t.test('paragraph intake asks only missing fields and profile viewing never starts registration',async()=>{
      await m.handleChatUi(phone,ui('profile'));assert.equal(rows.whatsappChatSessionsTable.length,0);assert.match(last(),/Verification:/);assert.equal(state.interactive.at(-1).body.action.buttons[0].reply.id,'udc:edit_profile');
      await m.handleChatUi(phone,ui('edit_profile'));assert.match(last(),/details you want to change/);assert.ok(rows.whatsappChatSessionsTable[0].data.email);await m.handleChatUi(phone,ui('cancel'));
      await m.handleChatUi(phone,ui('requirement'));const before=rows.buyerRequestsTable.length;
      const first={id:'paragraph-first',text:{body:'product: Copper cathode; quantity: 100; destination: Jebel Ali; target price: 5900'}};
      await m.handleChatUi(phone,first);assert.match(last(),/incoterm/);assert.doesNotMatch(last(),/quantity/);assert.equal(rows.whatsappChatSessionsTable[0].data.quantity,'100');
      await m.handleChatUi(phone,first);assert.equal(rows.whatsappChatSessionsTable[0].data.quantity,'100');
      await m.handleChatUi(phone,{id:'paragraph-final',text:{body:'incoterm: DPU; specification: Grade A'}});assert.equal(state.interactive.at(-1).body.action.buttons[0].reply.id,'udc:submit');assert.equal(rows.buyerRequestsTable.length,before);
      await m.handleChatUi(phone,ui('submit'));assert.equal(rows.buyerRequestsTable.length,before+1);assert.equal(rows.buyerRequestsTable.at(-1).preferredIncoterm,'DPU');
      await m.handleChatUi(phone,ui('requirement'));await m.handleChatUi(phone,{id:'paragraph-invalid',text:{body:'product: Sugar; quantity: -4; destination: Mombasa; incoterm: CIF'}});assert.match(last(),/metric tonnes/);assert.doesNotMatch(last(),/product/);await m.handleChatUi(phone,ui('cancel'));
    });
    await t.test('natural paragraph extraction validates fields and skips duplicate model calls',async()=>{
      await m.handleChatUi(phone,ui('requirement'));const before=rows.buyerRequestsTable.length,calls=state.modelCalls;
      state.modelOutput=JSON.stringify({product:'Copper cathode',quantity:'100',destination:'Jebel Ali',incoterm:'CIF',target_price:'5900',verification:'verified'});
      const message={id:'natural-paragraph',text:{body:'I need 100 MT copper cathode, CIF Jebel Ali at 5900 USD per MT'}};
      await m.handleChatUi(phone,message);assert.equal(state.modelCalls,calls+1);assert.equal(rows.buyerRequestsTable.length,before);assert.equal(rows.whatsappChatSessionsTable[0].data.verification,undefined);
      await m.handleChatUi(phone,message);assert.equal(state.modelCalls,calls+1);await m.handleChatUi(phone,ui('cancel'));
      await m.handleChatUi(phone,ui('requirement'));state.modelOutput='not json';await m.handleChatUi(phone,{id:'invalid-model-output',text:{body:'some trade details'}});assert.equal(rows.whatsappChatSessionsTable[0].step,0);assert.match(last(),/product/);await m.handleChatUi(phone,ui('cancel'));
    });
    await t.test('seller can describe an offer naturally and the draft keeps the stated unit and currency',async()=>{
      const sellerPhone='10000000028';rows.usersTable.push({id:'seller-natural',phone:sellerPhone,role:'seller',status:'verified',fullName:'Natural Seller'});
      await m.handleChatUi(sellerPhone,ui('offer'));assert.match(last(),/in your own words/i);assert.match(last(),/one question at a time/i);
      state.modelOutput=JSON.stringify({product:'Copper cathode',quantity:'100'});
      await m.handleChatUi(sellerPhone,{id:'seller-natural-partial',text:{body:'I can supply 100 MT copper cathode.'}});assert.match(last(),/what unit/i);assert.doesNotMatch(last(),/price.*origin.*incoterm/i);
      state.modelOutput=JSON.stringify({product:'Copper cathode',quantity:'100',unit:'MT',price:'5900',currency:'AED',origin:'Oman',incoterm:'CIF'});
      await m.handleChatUi(sellerPhone,{id:'seller-natural-offer',text:{body:'AED 5,900 per MT from Oman, CIF.'}});
      assert.equal(rows.whatsappChatSessionsTable[0].data.currency,'AED');assert.equal(rows.whatsappChatSessionsTable[0].data.unit,'MT');
      assert.equal(state.interactive.at(-1).body.action.buttons[0].reply.id,'udc:submit');
      await m.handleChatUi(sellerPhone,ui('submit'));
      assert.equal(rows.sellerListingsTable.at(-1).currency,'AED');assert.equal(rows.sellerListingsTable.at(-1).unit,'MT');assert.equal(rows.sellerListingsTable.at(-1).price,'5900');assert.equal(rows.sellerListingsTable.at(-1).destination,undefined);
    });
    await t.test('editing a paragraph keeps the details already supplied',async()=>{
      await m.handleChatUi(phone,ui('requirement'));await m.handleChatUi(phone,{id:randomUUID(),text:{body:'product: Test goods; quantity: 100; destination: Mombasa; incoterm: CIF; target_price: 490'}});
      await m.handleChatUi(phone,ui('restart'));assert.equal(rows.whatsappChatSessionsTable[0].data.quantity,'100');assert.match(last(),/details you want to change/);
      await m.handleChatUi(phone,{id:randomUUID(),text:{body:'target_price: 480'}});assert.equal(rows.whatsappChatSessionsTable[0].data.product,'Test goods');assert.equal(rows.whatsappChatSessionsTable[0].data.quantity,'100');assert.equal(rows.whatsappChatSessionsTable[0].data.target_price,'480');await m.handleChatUi(phone,ui('cancel'));
    });
    await t.test('WhatsApp introductions require registrant consent, verified agents and never replace attribution',async()=>{
      const id=randomUUID(),phone='10000000023';rows.usersTable.push({id,phone:'10000000024',role:'agent',status:'verified',fullName:'Synthetic Agent'},{id:'referred-buyer',phone,role:'buyer',status:'pending'});
      await m.handleChatUi(phone,{text:{body:'Referral UDC-'+id}});assert.equal(rows.referralsTable.some((r:any)=>r.referredUserId==='referred-buyer'),false);
      const button=state.interactive.at(-1).body.action.buttons[0].reply.id;
      await m.handleChatUi('10000000009',{interactive:{type:'button_reply',button_reply:{id:button}}});assert.equal(rows.referralsTable.some((r:any)=>r.referredUserId==='referred-buyer'),false);
      await m.handleChatUi(phone,{interactive:{type:'button_reply',button_reply:{id:button}}});await m.handleChatUi(phone,{interactive:{type:'button_reply',button_reply:{id:button}}});
      const refs=rows.referralsTable.filter((r:any)=>r.referredUserId==='referred-buyer');assert.equal(refs.length,1,last());assert.equal(refs[0].status,'pending');assert.equal(refs[0].agentUserId,id);assert.equal(refs[0].commissionRate,undefined);
      await m.handleChatUi(phone,{text:{body:'Referral UDC-'+id}});assert.match(last(),/already recorded/);
    });
    await t.test('seller payment proposal is preserved without changing a buyer requirement',async()=>{
      const sellerPhone='10000000022';rows.usersTable.push({id:'proposing-seller',phone:sellerPhone,role:'seller',status:'pending',fullName:'Synthetic Seller'});
      const before=rows.buyerRequestsTable.length;
      const result=await m.submitChatFlow(sellerPhone,JSON.stringify({flow_token:m.issueFlowToken(sellerPhone,'seller'),product:'Test goods',quantity:'100',price:'490',incoterm:'EXW',destination:'Agreed warehouse',payment_terms:'30% advance, 70% on delivery'}));
      assert.match(result,/saved/);assert.equal(rows.sellerListingsTable.at(-1).paymentTerms,'30% advance, 70% on delivery');assert.equal(rows.sellerListingsTable.at(-1).status,'pending_admin_review');assert.equal(rows.buyerRequestsTable.length,before);
    });
    await t.test('guided agent registration accepts normal email without a customer website',async()=>{
      const agentPhone='10000000009';await m.handleChatUi(agentPhone,ui('agent'));await m.handleChatUi(agentPhone,{id:'a-name',text:{body:'full name: Synthetic New Agent'}});await m.handleChatUi(agentPhone,{id:'a-email',text:{body:'email: newagent@gmail.com'}});
      assert.equal(rows.usersTable.some((u:any)=>u.phone===agentPhone),false);
      await m.handleChatUi(agentPhone,ui('submit'));const agent=rows.usersTable.find((u:any)=>u.phone===agentPhone);assert.equal(agent.role,'agent');assert.equal(agent.status,'pending');assert.equal(agent.email,'newagent@gmail.com');
    });
  }finally{await unlink(output);delete (globalThis as any).__chatUiFixture;if(previous===undefined)delete process.env.WHATSAPP_APP_SECRET;else process.env.WHATSAPP_APP_SECRET=previous;}
});
