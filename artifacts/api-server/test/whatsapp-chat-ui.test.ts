process.env.WHATSAPP_INBOUND_PER_MINUTE = "100000"; // these fixtures reuse one phone; the cap has its own test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile,unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

test('native WhatsApp menus and forms preserve role, privacy, review and replay boundaries',async t=>{
  const names=['buyerPoolsTable','buyerPoolAllocationsTable','auditLogsTable','companiesTable','companyVerificationDocumentsTable','commissionsTable','dealFinancialsTable','dealParticipantsTable','dealsTable','notificationsTable','referralsTable','usersTable','whatsappUserContextsTable','buyerRequestsTable','sellerListingsTable','productsTable','whatsappChatSessionsTable','matchesTable','shipmentsTable','shipmentTrackingEventsTable','shipmentCargoUnitsTable','shipmentWatchesTable'];
  const tables:any=Object.fromEntries(names.map(n=>[n,new Proxy({_table:n},{get:(_,k)=>k==='_table'?n:{column:k,table:n}})]));
  const rows:any=Object.fromEntries(names.map(n=>[n,[]]));
  const value=(x:any,r:any):any=>x?.column?(r[x.table]??r)[x.column]:x;
  const match=(c:any,r:any):any=>!c?true:c.kind==='eq'?value(c.a,r)===value(c.b,r):c.kind==='lt'?value(c.a,r)<value(c.b,r):c.kind==='and'?c.args.every((x:any)=>match(x,r)):c.kind==='or'?c.args.some((x:any)=>match(x,r)):c.kind==='sql'?c.parts.join('').includes('lower(')?String((r.usersTable??r).email??'').toLowerCase()===c.values.at(-1):c.parts.join('').includes("->>")?(r.auditLogsTable??r).metadata?.[c.parts.join('').match(/->>'([^']+)'/)?.[1]]===c.values.at(-1):true:true;
  const state:any={tables,rows,sent:[],interactive:[],uploads:[],roleChangeCalls:[],flowId:'123456',failAudit:false,locks:[],modelCalls:0,modelOutput:'{}'};
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
  const bundle=await build({stdin:{contents:"export * from '../src/whatsapp/chatUi';export * from '../src/vault/issuer';export * from '../src/whatsapp/guidanceSession';export * from '../src/whatsapp/flowToken';export * from '../src/whatsapp/flowDefinitions';export * from '../src/tracking/etaAdvisory';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},platform:'node',format:'esm',bundle:true,packages:'external',write:false,plugins:[{name:'chat-ui-fixture',setup(b){
    const fixtures:any={hermes:"export const runConversationChat=async()=>{const s=globalThis.__chatUiFixture;s.modelCalls++;if(s.modelError)throw new DOMException('Synthetic provider deadline','TimeoutError');return {content:s.modelOutput};};",db:'const s=globalThis.__chatUiFixture;export const db=s.db;'+names.map(n=>`export const ${n}=s.tables.${n};`).join(''),orm:"export const inArray=(a,list)=>({kind:'in',a,list});export const lt=(a,b)=>({kind:'lt',a,b});export const eq=(a,b)=>({kind:'eq',a,b});export const and=(...args)=>({kind:'and',args});export const or=(...args)=>({kind:'or',args});export const desc=x=>x;export const asc=x=>x;export const gt=(a,b)=>({kind:'gt',a,b});export const isNull=(a)=>({kind:'isnull',a});export const sql=(parts,...values)=>({kind:'sql',parts,values});",client:"export const isWindowClosedError=()=>false;const s=globalThis.__chatUiFixture;export const sendWhatsAppText=async(to,body)=>{s.sent.push({to,body});return {delivered:true,messageId:'out-'+s.sent.length}};export const sendWhatsAppTextWithMenu=async(to,body)=>{s.sent.push({to,body,withMenu:true});return {delivered:true,messageId:'out-'+s.sent.length}};export const sendWhatsAppInteractive=async(to,body)=>{s.interactive.push({to,body});return {delivered:true,messageId:'ui-'+s.interactive.length}};export const downloadWhatsAppMedia=async()=>({bytes:Buffer.from('%PDF-synthetic-document'),mimeType:'application/pdf'});export const markReadAndTyping=()=>{};export const trackReplyFailures=(fn)=>fn(new Set());",storage:"export const uploadDocumentBytes=async(path)=>{globalThis.__chatUiFixture.uploads.push(path);return 'storage://private/'+path;};",setup:"export const publishedFlowId=async()=>globalThis.__chatUiFixture.flowId;",password:"export const hashPassword=async()=> 'synthetic-unusable-hash';",sellerNotify:"export const asksForOpenRequirements=()=>false;export const openRequirementsReplyForSeller=async()=>null;export const respondToRequirementInterest=async()=>{};",roleChange:"export const requestRoleChange=async(phone,toRole)=>{globalThis.__chatUiFixture.roleChangeCalls.push({phone,toRole});return {status:'pending'};};export const roleChangeReply=(status,role)=>'Request saved for '+role+'. Your current role and access remain unchanged.';"};
    for(const [filter,path] of [[/marketplace\/sellerRequirementNotify$/,'sellerNotify'],[/intelligence\/hermesClient(\.ts)?$/,'hermes'],[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm'],[/whatsapp\/client$|^\.\/client$/,'client'],[/supabase\/storage$/,'storage'],[/^\.\/setupFlows$/,'setup'],[/auth\/passwords$/,'password'],[/accounts\/roleChangeRequest$/,'roleChange']] as const)b.onResolve({filter},()=>({path,namespace:'fixture'}));
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
      assert.equal(m.chatAction({interactive:{type:'list_reply',list_reply:{id:'unknown',title:'Submit requirement'}}}),'invalid');assert.equal(m.chatAction({text:{body:'100 MT copper'}}),null);assert.equal(m.chatAction({text:{body:'Menu'}}),'menu');assert.equal(m.chatAction({text:{body:'My code'}}),'invite');assert.equal(m.chatAction({text:{body:'Buyer'}}),'buyer');assert.equal(m.chatAction({text:{body:'seller'}}),'seller');assert.equal(m.chatAction({text:{body:'AGENT'}}),'agent');assert.equal(m.chatAction({text:{body:'More options'}}),'more');assert.equal(m.chatAction({text:{body:'Hi'}}),null);assert.equal(m.chatAction({text:{body:'hello'}}),null);assert.equal(m.chatAction({text:{body:'help'}}),null);assert.equal(m.chatAction({text:{body:'start'}}),null);assert.equal(m.chatAction({text:{body:'Show me the menu'}}),'menu');assert.equal(m.chatAction({text:{body:'Switch me to Agent'}}),'agent');assert.equal(m.chatAction({interactive:{type:'list_reply',list_reply:{id:'udc:change_role'}}}),'change_role');
      for(const flow of Object.values(m.flowDefinitions) as any[]){assert.equal(flow.json.screens[0].terminal,true);assert.equal(flow.json.screens[0].layout.children[0].children.at(-1)['on-click-action'].name,'complete');}
      const beforeUnprompted=state.interactive.length;
      assert.equal(await m.handleChatUi(phone,{text:{body:'Hello'}}),false);
      assert.equal(await m.handleChatUi(phone,{text:{body:'I would like to learn about UDC'}}),false);
      assert.equal(state.interactive.length,beforeUnprompted,'regular chat must not open menu');
      await m.handleChatUi(phone,{text:{body:'Menu'}});
      assert.equal(state.interactive.at(-1).body.type,'button');
      assert.equal(state.interactive.length,beforeUnprompted+1,'explicit menu request should open home');
      await m.handleChatUi(phone,ui('buyer'));assert.equal(state.interactive.at(-1).body.type,'flow');assert.equal(state.interactive.at(-1).body.action.parameters.flow_id,'123456');
      await m.handleChatUi('new-onboarding-number',{text:{body:'Seller'}});assert.equal(state.interactive.at(-1).body.type,'flow');assert.equal(m.readFlowToken(state.interactive.at(-1).body.action.parameters.flow_token,'new-onboarding-number').purpose,'profile_seller');
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
    await t.test('verified users can submit a role-change review request without access change',async()=>{
      const buyer=rows.usersTable.find((u:any)=>u.phone===phone);
      buyer.status='verified';
      const beforeRole=buyer.role;
      await m.handleChatUi(phone,ui('change_role'));
      assert.equal(state.interactive.at(-1).body.type,'button');
      assert.equal(state.interactive.at(-1).body.action.buttons.length,3);
      await m.handleChatUi(phone,ui('agent'));
      assert.equal(state.roleChangeCalls.length,1);
      assert.deepEqual(state.roleChangeCalls[0],{phone,toRole:'agent'});
      assert.match(last(),/unchanged/);
      assert.equal(buyer.role,beforeRole);
      await m.handleChatUi(phone,{text:{body:'Switch me to seller'}});
      assert.equal(state.roleChangeCalls.length,2);
      assert.equal(buyer.role,beforeRole);
    });
    await t.test('trade forms reuse real writers with exact terms; nonce and audit failures cannot duplicate writes',async()=>{
      const form={flow_token:m.issueFlowToken(phone,'buyer'),product:'Copper cathode',quantity:'100',destination:'Jebel Ali',incoterm:'CIF',target_price:'5900',specification:'Grade A',delivery_time:'30 days'};
      assert.match(await m.submitChatFlow(phone,JSON.stringify(form)),/saved/);assert.equal(rows.buyerRequestsTable.length,1);assert.equal(rows.buyerRequestsTable[0].destination,'Jebel Ali');assert.equal(rows.buyerRequestsTable[0].targetPrice,'5900');assert.equal(rows.buyerRequestsTable[0].status,'pending_admin_review');
      assert.match(await m.submitChatFlow(phone,JSON.stringify(form)),/already received/);assert.equal(rows.buyerRequestsTable.length,1);
      assert.match(await m.submitChatFlow(phone,JSON.stringify({...form,flow_token:m.issueFlowToken(phone,'seller')})),/account role/);
      state.failAudit=true;await assert.rejects(m.submitChatFlow(phone,JSON.stringify({...form,flow_token:m.issueFlowToken(phone,'buyer')})),/audit_failure/);assert.equal(rows.buyerRequestsTable.length,1);
      const b=rows.usersTable.find((u:any)=>u.phone===phone);b.status='suspended';assert.match(await m.submitChatFlow(phone,JSON.stringify({...form,flow_token:m.issueFlowToken(phone,'buyer')})),/UDC review/);b.status='verified';
    });
    await t.test('a rejected email conflict keeps the registration draft editable without merging accounts',async()=>{
      const applicant='10000000081',oldFlow=state.flowId;
      const existing=rows.usersTable.find((u:any)=>u.phone===phone);
      const original=structuredClone(existing),before=rows.usersTable.length;
      try{
        state.flowId=null;
        await m.handleChatUi(applicant,ui('buyer'));
        await m.handleChatUi(applicant,{id:randomUUID(),text:{body:`full_name: QA Conflict Buyer; email: ${existing.email}; company_name: QA Conflict Imports Ltd; country: India`}});
        const draft=rows.whatsappChatSessionsTable.find((r:any)=>r.purpose==='profile_buyer');
        const draftId=draft.id;
        assert.ok(state.sent.slice(-3).some((x:any)=>/already belongs/.test(String(x?.body))),'the conflict is explained as soon as the email is sent');
        assert.ok(rows.whatsappChatSessionsTable.some((r:any)=>r.id===draftId),'a rejected submission must retain all entered details');
        assert.equal(rows.usersTable.length,before);
        assert.deepEqual(existing,original,'email conflicts must never update another identity');
        await m.handleChatUi(applicant,ui('restart'));
        await m.handleChatUi(applicant,{id:randomUUID(),text:{body:'email: qa-conflict-corrected@example.invalid'}});
        await m.handleChatUi(applicant,ui('submit'));
        const created=rows.usersTable.find((u:any)=>u.phone===applicant);
        assert.ok(created);assert.equal(created.email,'qa-conflict-corrected@example.invalid');
        assert.equal(created.fullName,'QA Conflict Buyer');assert.equal(created.status,'pending');
        assert.equal(rows.whatsappChatSessionsTable.some((r:any)=>r.id===draftId),false);
      }finally{state.flowId=oldFlow;await m.handleChatUi(applicant,ui('cancel'));}
    });
    await t.test('private data only comes from own deals, assignments, referrals and commissions',async()=>{
      const buyer=rows.usersTable.find((u:any)=>u.phone===phone),own=randomUUID(),other=randomUUID();
      rows.dealsTable=[{id:own,dealNumber:'UDC-OWN',buyerUserId:buyer.id,sellerUserId:'seller',status:'negotiation'},{id:other,dealNumber:'UDC-PRIVATE',buyerUserId:'other',sellerUserId:'other-seller',status:'banking'}];
      await m.handleChatUi(phone,ui('deals'));const list=state.interactive.at(-1).body.action.sections[0].rows;assert.equal(list.length,1);assert.equal(list[0].title,'UDC-OWN');
      await m.handleChatUi(phone,ui('deal:'+other));assert.match(last(),/unavailable/);assert.equal(rows.whatsappUserContextsTable.length,0);
      await m.handleChatUi(phone,ui('track'));assert.match(last(),/select your deal first/);
      await m.handleChatUi(phone,ui('deal:'+own));assert.equal(rows.whatsappUserContextsTable[0].activeDealId,own);
      assert.equal(state.interactive.at(-1).body.action.buttons[0].reply.id,'udc:track');
      rows.shipmentsTable=[
        {id:'own-shipment',dealId:own,status:'in_transit',carrier:'Synthetic Carrier',trackingNumber:'QA-100',origin:'Kochi',destination:'Jebel Ali',estimatedArrival:new Date('2026-11-05T12:00:00Z'),updatedAt:new Date('2026-11-01T10:00:00Z')},
        {id:'other-shipment',dealId:other,status:'disputed',carrier:'PRIVATE CARRIER',trackingNumber:'SECRET-999',origin:'PRIVATE ORIGIN',destination:'PRIVATE DESTINATION',updatedAt:new Date('2026-11-02T10:00:00Z')},
      ];
      rows.shipmentTrackingEventsTable=[
        {shipmentId:'own-shipment',dealId:own,kind:'departed',location:'Mundra Port',note:'QA carrier document checked',source:'document_checked',occurredAt:new Date('2026-11-01T06:00:00Z')},
        {shipmentId:'other-shipment',dealId:other,kind:'exception',location:'PRIVATE PORT',note:'SECRET DOCUMENT',source:'carrier_reported',occurredAt:new Date('2026-11-02T06:00:00Z')},
      ];
      rows.shipmentCargoUnitsTable=[
        {id:'unit-sea',shipmentId:'own-shipment',dealId:own,transportMode:'sea',unitReference:'QA-CONTAINER-123',status:'in_transit',
          vesselName:'Synthetic Vessel',voyageNumber:'SV-42',billOfLading:'QA-BL-101',currentLocation:'Synthetic Harbour',
          lastReportedAt:new Date('2026-10-20T00:00:00Z'),estimatedArrival:new Date('2026-10-21T00:00:00Z')},
        {id:'unit-air',shipmentId:'other-shipment',dealId:other,transportMode:'air',unitReference:'SECRET-AWB',
          status:'in_transit',flightNumber:'SECRET FLIGHT',estimatedArrival:new Date('2026-10-22T00:00:00Z')},
      ];
      await m.handleChatUi(phone,ui('track'));
      assert.match(last(),/Cargo units/);
      assert.match(last(),/QA-CONTAINER-123/);
      assert.match(last(),/Recorded ETA has passed; arrival is not confirmed/);
      assert.doesNotMatch(last(),/SECRET-AWB|SECRET FLIGHT/);
      assert.match(last(),/Recent shipment milestones/);assert.match(last(),/Shipment 1: departed/);
      assert.match(last(),/Mundra Port/);assert.match(last(),/document-checked/);
      assert.doesNotMatch(last(),/PRIVATE PORT|SECRET DOCUMENT/);
      assert.match(last(),/UDC-OWN/);assert.match(last(),/Synthetic Carrier/);assert.match(last(),/QA-100/);
      assert.match(last(),/Last UDC update: 2026-11-01 10:00 UTC/);
      assert.doesNotMatch(last(),/SECRET|PRIVATE CARRIER|PRIVATE DESTINATION/);
      const beforeRevoked=buyer.status;buyer.status='under_review';
      await m.handleChatUi(phone,ui('track'));assert.match(last(),/pending UDC approval/);
      buyer.status=beforeRevoked;
      const agent=rows.usersTable.find((u:any)=>u.role==='agent');await m.handleChatUi(agent.phone,ui('commissions'));assert.match(last(),/Confirm your email first/);agent.status='verified';
      await m.handleChatUi(agent.phone,ui('menu'));
      const shortcuts=state.interactive.at(-1).body.action.buttons.map((b:any)=>b.reply.id);
      assert.deepEqual(shortcuts,['udc:invite','udc:referrals','udc:more']);
      await m.handleChatUi(agent.phone,ui('more'));
      const allOptions=state.interactive.at(-1).body.action.sections[0].rows;
      assert.ok(allOptions.some((r:any)=>r.id==='udc:commissions'));
      assert.ok(allOptions.some((r:any)=>r.id==='udc:profile'));
      const priorPublicNumber=process.env.UDC_WHATSAPP_PUBLIC_NUMBER;
      delete process.env.UDC_WHATSAPP_PUBLIC_NUMBER;
      await m.handleChatUi(agent.phone,ui('invite'));
      assert.match(last(),/^Referral UDC-[0-9A-F]{12}$/);
      assert.match(state.sent.at(-2).body,/after registering with UDC/i);
      assert.ok(!state.sent.at(-1).body.includes('Share this'));
      assert.equal(state.sent.filter((v:any)=>v.body.includes('https://wa.me/')).length,0,
        'never invent a phone number or share link');
      process.env.UDC_WHATSAPP_PUBLIC_NUMBER='+15551234567';
      await m.handleChatUi(agent.phone,ui('invite'));
      assert.match(state.sent.at(-2).body,/^https:\/\/wa\.me\/15551234567\?text=JOIN%20UDC-[0-9A-F]{12}$/);
      assert.match(last(),/Send "My invites" to see who joined/);
      if(priorPublicNumber===undefined)delete process.env.UDC_WHATSAPP_PUBLIC_NUMBER;
      else process.env.UDC_WHATSAPP_PUBLIC_NUMBER=priorPublicNumber;

      rows.commissionsTable=[{beneficiaryUserId:agent.id,currency:'USD',amount:'50',status:'pending'},{beneficiaryUserId:'other',currency:'USD',amount:'999999',status:'paid'}];await m.handleChatUi(agent.phone,ui('commissions'));assert.match(last(),/50/);assert.doesNotMatch(last(),/999999/);
      rows.dealParticipantsTable=[{dealId:own,userId:agent.id,participantRole:'agent',status:'active'}];await m.handleChatUi(agent.phone,ui('deals'));assert.equal(state.interactive.at(-1).body.action.sections[0].rows.length,1);
      await m.handleChatUi(agent.phone,ui('deal:'+own));
      await m.handleChatUi(agent.phone,ui('track'));
      assert.match(last(),/Shipment 1: in_transit/);
      assert.doesNotMatch(last(),/QA-100|Synthetic Carrier|Kochi|Jebel Ali|SECRET-999/);
      assert.match(last(),/sea cargo/);assert.doesNotMatch(last(),/QA-CONTAINER-123|Synthetic Vessel|QA-BL-101|Synthetic Harbour/);
      assert.match(last(),/departed/);assert.doesNotMatch(last(),/Mundra Port|QA carrier document checked|document-checked|PRIVATE PORT/);
      rows.dealParticipantsTable[0].status='revoked';await m.handleChatUi(agent.phone,ui('deals'));assert.match(last(),/No approved deals/);await m.handleChatUi(agent.phone,ui('deal:'+own));assert.match(last(),/unavailable/);
      await m.handleChatUi(agent.phone,ui('track'));assert.match(last(),/no longer available/);assert.doesNotMatch(last(),/QA-100|Synthetic Carrier/);
    });
    await t.test('a typed tracking number goes to the live carrier lookup, gated and honest',async()=>{
      const buyer=rows.usersTable.find((u:any)=>u.phone===phone);
      const originalFetch=globalThis.fetch;const priorKey=process.env.SEVENTEEN_TRACK_API_KEY;
      try{
        delete process.env.SEVENTEEN_TRACK_API_KEY;
        let calls=0;globalThis.fetch=(async()=>{calls++;throw new Error('must not be called');}) as any;
        await m.handleChatUi(phone,{id:randomUUID(),text:{body:'track QA-100'}});
        assert.match(last(),/not switched on yet/);assert.equal(calls,0,'no provider call while live tracking is off');
        process.env.SEVENTEEN_TRACK_API_KEY='synthetic-key';
        const bodies:any[]=[];
        globalThis.fetch=(async(_url:any,init:any)=>{bodies.push(JSON.parse(String(init.body)));return new Response(JSON.stringify({data:{accepted:[{track_info:{latest_event:{time_iso:'2026-10-28T09:30:00Z',description:'Arrived at port',location:'Jebel Ali'}}}]}}),{status:200});}) as any;
        await m.handleChatUi(phone,{id:randomUUID(),text:{body:'track QA-100'}});
        assert.match(last(),/Latest carrier update for QA-100/);assert.match(last(),/Arrived at port in Jebel Ali/);assert.match(last(),/UDC has not verified/);
        assert.deepEqual(bodies[0],[{number:'QA-100'}]);
        const prior=buyer.status;buyer.status='under_review';
        await m.handleChatUi(phone,{id:randomUUID(),text:{body:'track QA-100'}});assert.match(last(),/pending UDC approval/);
        buyer.status=prior;
      }finally{
        globalThis.fetch=originalFetch;
        if(priorKey===undefined)delete process.env.SEVENTEEN_TRACK_API_KEY;else process.env.SEVENTEEN_TRACK_API_KEY=priorKey;
      }
    });
    await t.test('counterparty contact details stay locked until the SPA stage, then come only from records',async()=>{
      const buyer=rows.usersTable.find((u:any)=>u.phone===phone);
      rows.usersTable.push({id:'seller-user',phone:'10000000099',role:'seller',status:'verified',email:'seller@synthetic.test',fullName:'Synthetic Seller',emailVerifiedAt:new Date()});
      rows.companiesTable=[...rows.companiesTable.filter((r:any)=>r.ownerUserId!=='seller-user'),{id:'seller-company',ownerUserId:'seller-user',companyName:'Synthetic Exports'}];
      rows.dealsTable=[{id:'contact-deal',dealNumber:'UDC-CONTACT',buyerUserId:buyer.id,sellerUserId:'seller-user',status:'negotiation'}];
      rows.whatsappUserContextsTable=[{userId:buyer.id,activeDealId:'contact-deal',updatedAt:new Date()}];
      await m.handleChatUi(phone,{id:randomUUID(),text:{body:'share seller contact'}});
      assert.match(last(),/after the SPA is signed and UDC approves/);assert.doesNotMatch(last(),/seller@synthetic\.test|10000000099/);
      rows.dealsTable[0].status='contract';
      await m.handleChatUi(phone,{id:randomUUID(),text:{body:'share seller contact'}});
      assert.match(last(),/Synthetic Seller/);assert.match(last(),/Synthetic Exports/);assert.match(last(),/seller@synthetic\.test/);assert.match(last(),/10000000099/);
      assert.match(last(),/after SPA signing/);
      rows.usersTable=rows.usersTable.filter((u:any)=>u.id!=='seller-user');
      rows.companiesTable=rows.companiesTable.filter((r:any)=>r.ownerUserId!=='seller-user');
    });
    await t.test('ETA advisory distinguishes unconfirmed lateness from a verified delay',()=>{
      const now=new Date('2026-10-24T12:00:00Z');
      assert.equal(m.etaAdvisory('delivered','2026-10-20T00:00:00Z',null,now),'complete');
      assert.equal(m.etaAdvisory('in_transit','2026-10-20T00:00:00Z',null,now),'overdue_unconfirmed');
      assert.equal(m.etaAdvisory('in_transit','2026-10-27T00:00:00Z','2026-10-20T00:00:00Z',now),'last_report_stale');
      assert.equal(m.etaAdvisory('planned',null,null,now),'not_recorded');
      assert.equal(m.etaAdvisory('in_transit','2026-10-27T00:00:00Z','2026-10-24T11:00:00Z',now),'on_schedule_unconfirmed');
      assert.match(m.etaAdvisoryLabel('overdue_unconfirmed'),/arrival is not confirmed/);
      assert.ok(!m.etaAdvisoryLabel('complete'));
    });
    await t.test('company PDFs are never accepted on WhatsApp: the vault link is offered instead',async()=>{
      const before=state.uploads.length,rowsBefore=rows.companyVerificationDocumentsTable.length;
      await m.handleChatUi(phone,ui('documents'));assert.match(last(),/don't send/i);
      assert.match(state.interactive.at(-1).body.body.text,/private upload link/);assert.ok(state.interactive.at(-1).body.action.sections[0].rows.length>0);
      const doc={id:'synthetic-doc-message',context:{id:'out-'+state.sent.length},document:{id:'media-1'}};
      assert.equal(await m.handleChatUi('10000000003',doc),false);
      await m.handleChatUi(phone,doc);
      assert.equal(state.uploads.length,before);assert.equal(rows.companyVerificationDocumentsTable.length,rowsBefore);
      state.flowId=null;await m.handleChatUi(phone,ui('requirement'));assert.match(last(),/product/);delete rows.whatsappChatSessionsTable[0].data.__paragraph;assert.equal(rows.whatsappChatSessionsTable.length,1);
      assert.ok(state.sent.every((s:any)=>!s.body.includes('https://udc-backend.onrender.com/login')));
    });
    await t.test('Upload documents lists each required document with its status; tester numbers are not blocked by missing company details',async()=>{
      const sellerPhone='10000000040';rows.usersTable.push({id:'doc-seller',phone:sellerPhone,role:'seller',status:'verified',fullName:'Doc Seller'});
      rows.companiesTable.push({id:'doc-company',ownerUserId:'doc-seller',companyName:'Doc Co'});
      rows.companyVerificationDocumentsTable.push({id:'d1',companyId:'doc-company',documentType:'company_registration',status:'pending'},{id:'d2',companyId:'doc-company',documentType:'tax_id',status:'approved'});
      await m.handleChatUi(sellerPhone,ui('documents'));
      assert.match(last(),/1 of 5 verified/);assert.match(last(),/1\. Company registration or trade licence - uploaded, waiting for UDC review/);assert.match(last(),/2\. Tax ID.*- verified/);assert.match(last(),/5\. Past export invoices or factory photos - not uploaded yet/);
      const sellerRows=state.interactive.at(-1).body.action.sections[0].rows;
      assert.deepEqual(sellerRows.map((r:any)=>r.id),['udc:doc:upload:company_registration','udc:doc:upload:export_licence','udc:doc:upload:product_licence','udc:doc:upload:past_exports','udc:doc:upload:all']);
      assert.deepEqual(sellerRows.map((r:any)=>r.title),['Upload 1','Upload 3','Upload 4','Upload 5','Upload all']);
      const buyerPhone='10000000041';rows.usersTable.push({id:'doc-buyer',phone:buyerPhone,role:'buyer',status:'verified',fullName:'Doc Buyer'});
      await m.handleChatUi(buyerPhone,ui('documents'));
      assert.match(last(),/Your documents: 0 of 3 verified/);assert.match(last(),/Add your company details first/);assert.doesNotMatch(last(),/private upload link/);
      process.env.UDC_APP_ENV='staging';process.env.UDC_TESTER_MODE='on';process.env.UDC_TESTER_PHONES='917022032531';
      try{
        const testerPhone='917022032531';rows.usersTable.push({id:'doc-tester',phone:testerPhone,role:'seller',status:'verified',fullName:'Tester User'});
        const companiesBefore=rows.companiesTable.length;
        await m.handleChatUi(testerPhone,ui('documents'));
        assert.equal(rows.companiesTable.length,companiesBefore+1,'tester gets a placeholder company instead of a dead end');
        assert.match(state.interactive.at(-1).body.body.text,/private upload link/);
      }finally{delete process.env.UDC_APP_ENV;delete process.env.UDC_TESTER_MODE;delete process.env.UDC_TESTER_PHONES;}
      const agentPhone='10000000042';rows.usersTable.push({id:'doc-agent',phone:agentPhone,role:'agent',status:'verified',fullName:'Doc Agent'});
      await m.handleChatUi(agentPhone,ui('documents'));
      assert.match(last(),/Agents do not upload company documents/);
      await m.handleChatUi(agentPhone,{id:'ag1',text:{body:'I wanna upload docs'}});
      assert.match(last(),/Agents do not upload company documents/,'plain-words upload from an agent gets the same answer, never a link');
    });
    await t.test('document picks issue a private link per tap, per number reply, or one link for all - never a menu loop',async()=>{
      const issued:string[]=[];
      m.setVaultLinkIssuer(async (_user:any,docType:string)=>{issued.push(docType);return {ok:true,url:'https://vault.example/upload/TESTTOKEN',expiresAt:new Date(Date.now()+9e5)};});
      try{
        const p='10000000050';rows.usersTable.push({id:'link-buyer',phone:p,role:'buyer',status:'verified',fullName:'Link Buyer'});
        rows.companiesTable.push({id:'link-company',ownerUserId:'link-buyer',companyName:'Link Co'});
        await m.handleChatUi(p,ui('doc:upload:tax_id'));
        assert.deepEqual(issued,['tax_id']);assert.match(last(),/Tax ID/);assert.match(last(),/https:\/\/vault\.example\/upload\/TESTTOKEN/);assert.match(last(),/single use/);
        issued.length=0;await m.handleChatUi(p,{id:'m1',context:{id:'wamid-list'},text:{body:'1.2.3'}});
        assert.deepEqual(issued,['multi:company_registration,tax_id,import_licence']);assert.match(last(),/one tap uploads them all/);assert.doesNotMatch(last(),/clarify what you mean/);
        issued.length=0;await m.handleChatUi(p,{id:'m2',text:{body:'1. I wanna upload 1'}});
        assert.deepEqual(issued,['company_registration']);
        issued.length=0;await m.handleChatUi(p,{id:'m3',text:{body:'1 , 2 and 3 I wanna upload all of it'}});
        assert.deepEqual(issued,['multi:company_registration,tax_id,import_licence']);
        const plain='10000000051';rows.usersTable.push({id:'plain-buyer',phone:plain,role:'buyer',status:'verified',fullName:'Plain Buyer'});
        issued.length=0;assert.equal(await m.handleChatUi(plain,{id:'m4',text:{body:'2'}}),false);assert.equal(issued.length,0,'a bare number without list context is not a document pick');
        rows.whatsappChatSessionsTable.push({id:'sess-p',phoneHash:m.guidanceKey(p),purpose:'buyer',step:0,data:{history:'[]'},lastMessageId:null,expiresAt:new Date(Date.now()+9e5)});
        await m.handleChatUi(p,ui('documents'));
        issued.length=0;await m.handleChatUi(p,{id:'m5',text:{body:'2'}});
        assert.deepEqual(issued,['tax_id'],'right after the list, a bare number picks that document');
        assert.equal(rows.whatsappChatSessionsTable.filter((r:any)=>r.phoneHash===m.guidanceKey(p)).length,1,'the flag never creates a session row');
        rows.whatsappChatSessionsTable=rows.whatsappChatSessionsTable.filter((r:any)=>r.id!=='sess-p');
        issued.length=0;await m.handleChatUi('10000000052',{id:'m6',text:{body:'upload 1'}});
        assert.equal(issued.length,0,'unknown numbers never get a link');
        issued.length=0;await m.handleChatUi(p,{id:'m7',text:{body:'upload my tax id'}});
        assert.deepEqual(issued,['tax_id'],'a named document in plain words sends that one link');
        issued.length=0;await m.handleChatUi(p,{id:'m8',text:{body:'I wanna upload docs'}});
        assert.deepEqual(issued,['multi:company_registration,tax_id,import_licence'],'a general upload ask sends one link for all missing');
        assert.match(last(),/one tap uploads them all/);
      }finally{m.setVaultLinkIssuer(null);}
    });
    await t.test('every menu item runs from plain words, no tapping',async()=>{
      const bp='10000000060';rows.usersTable.push({id:'pw-buyer',phone:bp,role:'buyer',status:'verified',fullName:'Pw Buyer',email:'pw@example.com'});
      rows.companiesTable.push({id:'pw-company',ownerUserId:'pw-buyer',companyName:'Pw Co'});
      await m.handleChatUi(bp,{id:'p1',text:{body:'my deals'}});assert.match(last(),/No approved deals/);
      await m.handleChatUi(bp,{id:'p2',text:{body:'track my order'}});assert.match(last(),/Open My deals and select your deal first/);
      await m.handleChatUi(bp,{id:'p3',text:{body:'verification status'}});assert.match(last(),/Your account: verified/);
      await m.handleChatUi(bp,{id:'p4',text:{body:'my profile'}});assert.match(state.sent.at(-1)?.body,/Pw Buyer/);
      try{
        assert.equal(await m.handleChatUi(bp,{id:'p5',text:{body:'I want to buy copper'}}),true,'a buy ask starts the requirement intake');
        assert.match(last(),/What product do you need/);
      }finally{await m.handleChatUi(bp,{id:'p5c',text:{body:'cancel'}});}
      const sp='10000000061';rows.usersTable.push({id:'pw-seller',phone:sp,role:'seller',status:'verified',fullName:'Pw Seller',email:'ps@example.com'});
      try{
        assert.equal(await m.handleChatUi(sp,{id:'p6',text:{body:'I wanna sell my rice'}}),true,'a sell ask starts the offer intake');
        assert.match(last(),/product|offer/i);
      }finally{await m.handleChatUi(sp,{id:'p6c',text:{body:'cancel'}});}
      await m.handleChatUi(sp,{id:'p7',text:{body:'I want to buy copper'}});assert.match(last(),/registered as seller/,'role guard still applies from plain words');
      const ap='10000000062';rows.usersTable.push({id:'a1b2c3d4-0000-4000-8000-000000000062',phone:ap,role:'agent',status:'verified',fullName:'Pw Agent',email:'pa@example.com',emailVerifiedAt:new Date()});
      const sentBefore=state.sent.length;await m.handleChatUi(ap,{id:'p8',text:{body:'my commissions'}});assert.match(last(),/No agreed commissions/);
      await m.handleChatUi(ap,{id:'p9',text:{body:'my invite link'}});assert.ok(state.sent.length>sentBefore,'agent invite answer sent');
      assert.equal(await m.handleChatUi(bp,{id:'p10',text:{body:'tell me about my deals options'}}),false,'chat about deals still goes to Akif, not the menu');
      assert.equal(await m.handleChatUi(bp,{id:'p11',text:{body:'what documents do I need for importing rice?'}}),false,'document questions still go to Akif');
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
    await t.test('a question, pause or resume mid-form is never stored as the pending answer',async()=>{
      const answer=(body:string)=>m.handleChatUi(phone,{id:randomUUID(),text:{body}});
      await m.handleChatUi(phone,ui('requirement'));delete rows.whatsappChatSessionsTable[0].data.__paragraph;
      const before=JSON.stringify(rows.whatsappChatSessionsTable[0]);
      assert.equal(await answer('What is CIF?'),false);assert.equal(JSON.stringify(rows.whatsappChatSessionsTable[0]),before);
      assert.equal(await answer('wait'),true);assert.match(last(),/saved for about 30 minutes/);assert.equal(JSON.stringify(rows.whatsappChatSessionsTable[0]),before);
      assert.equal(await answer('continue'),true);assert.match(last(),/product/i);assert.equal(JSON.stringify(rows.whatsappChatSessionsTable[0]),before);
      await answer('Sugar');assert.equal(rows.whatsappChatSessionsTable[0].step,1);
      await m.handleChatUi(phone,ui('cancel'));assert.equal(rows.whatsappChatSessionsTable.length,0);
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
    await t.test('plain buyer answers survive unavailable AI and still require explicit review submission',async()=>{
      const buyerPhone='10000000078',oldFlow=state.flowId,oldOutput=state.modelOutput;
      const beforeUsers=rows.usersTable.length,beforeRequests=rows.buyerRequestsTable.length;
      try{
        state.flowId=null;state.modelOutput='not json';state.modelError=true;
        const calls=state.modelCalls;
        await m.handleChatUi(buyerPhone,{text:{body:'Buyer'}});
        assert.equal(await m.handleChatUi(buyerPhone,{text:{body:'Tell me about UDC'}},true),false,'a learning request must not become a name');
        assert.equal(await m.handleChatUi(buyerPhone,{text:{body:'What is UDC?'}},true),false);
        assert.equal(await m.handleChatUi(buyerPhone,{text:{body:'മലയാളം'}},true),false);
        assert.equal(await m.handleChatUi(buyerPhone,{text:{body:'CIF Jebel Ali'}},true),false,'multiple fields need paragraph extraction');
        for(const body of ['QA Test Buyer','qa-outage@example.invalid','UDC QA Test Imports Ltd','India']){
          await m.handleChatUi(buyerPhone,{id:randomUUID(),text:{body}});
        }
        const draft=rows.whatsappChatSessionsTable.find((r:any)=>r.purpose==='profile_buyer');
        assert.equal(draft.data.full_name,'QA Test Buyer','a plain name must not depend on AI availability');
        assert.equal(draft.data.email,'qa-outage@example.invalid');
        assert.equal(draft.data.company_name,'UDC QA Test Imports Ltd');
        assert.equal(draft.data.country,'India');
        assert.equal(rows.usersTable.length,beforeUsers,'draft must not register without confirmation');
        await m.handleChatUi(buyerPhone,{...ui('submit'),id:randomUUID()});
        const buyer=rows.usersTable.find((u:any)=>u.phone===buyerPhone);
        assert.ok(buyer);assert.equal(buyer.status,'pending');
        await m.handleChatUi(buyerPhone,ui('requirement'));
        for(const body of ['Copper cathode','100','Jebel Ali','CIF','Skip']){
          await m.handleChatUi(buyerPhone,{id:randomUUID(),text:{body}});
        }
        assert.equal(rows.buyerRequestsTable.length,beforeRequests);
        await m.handleChatUi(buyerPhone,{...ui('submit'),id:randomUUID()});
        const request=rows.buyerRequestsTable.at(-1);
        assert.equal(rows.buyerRequestsTable.length,beforeRequests+1);
        assert.equal(request.buyerUserId,buyer.id);assert.equal(request.quantity,'100');
        assert.equal(request.destination,'Jebel Ali');assert.equal(request.preferredIncoterm,'CIF');
        assert.equal(request.status,'pending_admin_review');
        assert.equal(state.modelCalls,calls,'plain answers must bypass all unavailable providers');
      }finally{state.flowId=oldFlow;state.modelOutput=oldOutput;state.modelError=false;await m.handleChatUi(buyerPhone,ui('cancel'));}
    });
    await t.test('seller registration and multiple exact-currency offers work without AI',async()=>{
      const sellerPhone='10000000079',oldFlow=state.flowId,calls=state.modelCalls;
      const before=rows.sellerListingsTable.length;
      try{
        state.flowId=null;state.modelError=true;
        await m.handleChatUi(sellerPhone,ui('seller'));
        for(const body of ['QA Test Seller','qa-seller-outage@example.invalid','QA Test Exports Ltd','Oman'])await m.handleChatUi(sellerPhone,{id:randomUUID(),text:{body}});
        await m.handleChatUi(sellerPhone,ui('submit'));
        const seller=rows.usersTable.find((u:any)=>u.phone===sellerPhone);
        assert.ok(seller);assert.equal(seller.status,'pending');
        for(const product of ['Copper cathode','Sugar']){
          await m.handleChatUi(sellerPhone,ui('offer'));
          for(const body of [product,'100','MT','5900','AED','Oman','CIF'])await m.handleChatUi(sellerPhone,{id:randomUUID(),text:{body}});
          const count=rows.sellerListingsTable.length;
          await m.handleChatUi(sellerPhone,ui('submit'));
          assert.equal(rows.sellerListingsTable.length,count+1);
          assert.equal(rows.sellerListingsTable.at(-1).currency,'AED');
          assert.equal(rows.sellerListingsTable.at(-1).unit,'MT');
          assert.equal(rows.sellerListingsTable.at(-1).status,'pending_admin_review');
        }
        assert.equal(rows.sellerListingsTable.length,before+2);
        assert.equal(state.modelCalls,calls);
      }finally{state.flowId=oldFlow;state.modelError=false;await m.handleChatUi(sellerPhone,ui('cancel'));}
    });
    await t.test('agent plain-name registration keeps personal-email support during an AI outage',async()=>{
      const agentPhone='10000000080',oldFlow=state.flowId,calls=state.modelCalls;
      try{
        state.flowId=null;state.modelError=true;
        await m.handleChatUi(agentPhone,ui('agent'));
        for(const body of ['QA Test Agent','qa-outage-agent@gmail.com'])await m.handleChatUi(agentPhone,{id:randomUUID(),text:{body}});
        await m.handleChatUi(agentPhone,ui('submit'));
        const agent=rows.usersTable.find((u:any)=>u.phone===agentPhone);
        assert.ok(agent);assert.equal(agent.role,'agent');assert.equal(agent.status,'pending');
        assert.equal(agent.email,'qa-outage-agent@gmail.com');assert.equal(state.modelCalls,calls);
      }finally{state.flowId=oldFlow;state.modelError=false;await m.handleChatUi(agentPhone,ui('cancel'));}
    });
    await t.test('fresh WhatsApp buyer completes registration then one private requirement without live customer writes',async()=>{
      const buyerPhone='10000000077';
      const originalFlowId=state.flowId;
      const beforeUsers=rows.usersTable.length;
      const beforeCompanies=rows.companiesTable.length;
      const beforeRequests=rows.buyerRequestsTable.length;
      const beforeDeals=rows.dealsTable.length;
      const beforeSellerOffers=rows.sellerListingsTable.length;
      try{
        // A missing published Meta Flow should still give a fully working WhatsApp
        // fallback; no credentials or actual Meta messages are used.
        state.flowId=null;
        assert.equal(await m.handleChatUi(buyerPhone,{text:{body:'Buyer'}}),true);
        assert.equal(rows.usersTable.length,beforeUsers);
        assert.equal(rows.whatsappChatSessionsTable.length,1);
        assert.match(last(),/full name/i);
        const profile={id:'new-buyer-profile',text:{body:'full_name: Fresh Synthetic Buyer; email: freshbuyer@example.invalid; company_name: Synthetic Import Test Ltd; country: India'}};
        await m.handleChatUi(buyerPhone,profile);
        assert.equal(rows.usersTable.length,beforeUsers,'registration must wait for explicit confirmation');
        assert.equal(rows.whatsappChatSessionsTable.length,1);
        assert.equal(state.interactive.at(-1).body.action.buttons[0].reply.id,'udc:submit');
        await m.handleChatUi(buyerPhone,{...ui('submit'),id:'new-buyer-profile-submit'});
        const buyer=rows.usersTable.find((u:any)=>u.phone===buyerPhone);
        assert.ok(buyer,'fresh buyer must be persisted');
        assert.equal(buyer.role,'buyer');
        assert.equal(buyer.status,'pending','registration must not approve a buyer');
        assert.equal(buyer.email,'freshbuyer@example.invalid');
        assert.equal(rows.usersTable.length,beforeUsers+1);
        const company=rows.companiesTable.find((c:any)=>c.ownerUserId===buyer.id);
        assert.ok(company);
        assert.equal(company.verificationStatus,'pending');
        assert.equal(rows.companiesTable.length,beforeCompanies+1);
        assert.equal(rows.whatsappChatSessionsTable.length,0);
        assert.equal(rows.buyerRequestsTable.length,beforeRequests);

        // A pending buyer may privately submit requirements without being
        // falsely marked verified or immediately matched to other traders.
        await m.handleChatUi(buyerPhone,ui('requirement'));
        assert.equal(rows.whatsappChatSessionsTable.length,1);
        assert.match(last(),/product/i);
        await m.handleChatUi(buyerPhone,{id:'new-buyer-trade',text:{body:'product: Copper cathode; quantity: 100; destination: Jebel Ali; incoterm: CIF; target_price: 5900; specification: Grade A'}});
        assert.equal(rows.buyerRequestsTable.length,beforeRequests,'incomplete/unconfirmed drafts are never submitted');
        assert.equal(state.interactive.at(-1).body.action.buttons[0].reply.id,'udc:submit');
        await m.handleChatUi(buyerPhone,{...ui('submit'),id:'new-buyer-trade-submit'});
        assert.equal(rows.buyerRequestsTable.length,beforeRequests+1);
        const requirement=rows.buyerRequestsTable.at(-1);
        assert.equal(requirement.buyerUserId,buyer.id);
        assert.equal(requirement.quantity,'100');
        assert.equal(requirement.unit,'MT');
        assert.equal(requirement.destination,'Jebel Ali');
        assert.equal(requirement.preferredIncoterm,'CIF');
        assert.equal(requirement.targetPrice,'5900');
        assert.equal(requirement.currency,'USD');
        assert.equal(requirement.status,'pending_admin_review');
        assert.equal(rows.usersTable.find((u:any)=>u.phone===buyerPhone)?.status,'pending');
        assert.equal(rows.dealsTable.length,beforeDeals,'a pending requirement must not create a live deal');
        assert.equal(rows.sellerListingsTable.length,beforeSellerOffers);
        assert.equal(rows.whatsappChatSessionsTable.length,0);
        await m.handleChatUi(buyerPhone,{...ui('submit'),id:'new-buyer-trade-submit'});
        assert.equal(rows.buyerRequestsTable.length,beforeRequests+1,'duplicate confirmation must not create another requirement');
      }finally{state.flowId=originalFlowId;}
    });
    await t.test('guided agent registration accepts normal email without a customer website',async()=>{
      const agentPhone='10000000009';await m.handleChatUi(agentPhone,ui('agent'));await m.handleChatUi(agentPhone,{id:'a-name',text:{body:'full name: Synthetic New Agent'}});await m.handleChatUi(agentPhone,{id:'a-email',text:{body:'email: newagent@gmail.com'}});
      assert.equal(rows.usersTable.some((u:any)=>u.phone===agentPhone),false);
      await m.handleChatUi(agentPhone,ui('submit'));const agent=rows.usersTable.find((u:any)=>u.phone===agentPhone);assert.equal(agent.role,'agent');assert.equal(agent.status,'pending');assert.equal(agent.email,'newagent@gmail.com');
    });
  }finally{await unlink(output);delete (globalThis as any).__chatUiFixture;if(previous===undefined)delete process.env.WHATSAPP_APP_SECRET;else process.env.WHATSAPP_APP_SECRET=previous;}
});
