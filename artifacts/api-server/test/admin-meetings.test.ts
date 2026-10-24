import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

test('admin trade workflows preserve verification, ownership, review and payment controls', async t => {
  const source=await readFile(new URL('../src/routes/admin.ts',import.meta.url),'utf8');
  const dealSource=await readFile(new URL('../src/routes/deals.ts',import.meta.url),'utf8');
  const names=[...new Set((source+dealSource).match(/\b\w+Table\b/g))];
  const tables:any=Object.fromEntries(names.map(name=>[name,new Proxy({_table:name},{get:(t,k)=>k==='_table'?name:{column:k,table:name}})]));
  const records:any=Object.fromEntries(names.map(name=>[name,[]]));
  const dealId='11111111-1111-4111-8111-111111111111';
  records.dealsTable=[{id:dealId,buyerUserId:'buyer',sellerUserId:'seller'}];
  records.usersTable=[{id:'buyer',role:'buyer',status:'verified'},{id:'seller',role:'seller',status:'verified'}];
  records.companiesTable=[{id:'buyer-company',ownerUserId:'buyer',verificationStatus:'verified'},{id:'seller-company',ownerUserId:'seller',verificationStatus:'verified'}];
  records.companyVerificationDocumentsTable=[{id:'buyer-proof',companyId:'buyer-company',status:'approved'},{id:'seller-proof',companyId:'seller-company',status:'approved'}];
  const value=(x:any,r:any):any=>x?.column?(r[x.table] ?? r)[x.column]:x;
  const predicate=(x:any,r:any):any=>x?.kind==='eq'?value(x.a,r)===value(x.b,r):x?.kind==='and'?x.args.every((c:any)=>predicate(c,r)):x?.kind==='or'?x.args.some((c:any)=>predicate(c,r)):x?.kind==='in'?x.list.includes(value(x.a,r)):true;
  let dbReads=0;
  function select(fields?:any) {
    dbReads++;
    let table:any,condition:any,limit=Infinity,groups:any[]=[],joins:any[]=[];
    const run=()=>{
      let rows=records[table].map((r:any)=>({[table]:r}));
      for(const join of joins) rows=rows.flatMap((r:any)=>records[join.table].map((v:any)=>({...r,[join.table]:v})).filter((r:any)=>predicate(join.on,r)));
      rows=rows.filter((r:any)=>predicate(condition,r));
      const project=(r:any,bucket:any[]=[])=>fields?Object.fromEntries(Object.entries(fields).map(([k,v]:any)=>[k,v?.kind==='sql'?(v.parts.join('').includes('sum(')?String(bucket.reduce((total:number,row:any)=>total+v.values.map((c:any)=>Number(value(c,row))).reduce((a:number,b:number)=>a*b,1),0)):bucket.length):value(v,r)])):{...r[table]};
      if(groups.length){
        const buckets=new Map<string,any[]>();
        for(const row of rows){const key=JSON.stringify(groups.map(g=>value(g,row)));buckets.set(key,[...(buckets.get(key)??[]),row]);}
        return [...buckets.values()].map(bucket=>project(bucket[0],bucket)).sort((a:any,b:any)=>(b.dealCount??b.count??0)-(a.dealCount??a.count??0)).slice(0,limit);
      }
      return rows.slice(0,limit).map((r:any)=>project(r));
    };
    const q:any={from:(t:any)=>{table=t._table;return q},where:(c:any)=>{condition=c;return q},limit:(n:number)=>{limit=n;return q},orderBy:()=>q,groupBy:(...g:any[])=>{groups=g;return q},innerJoin:(t:any,on:any)=>{joins.push({table:t._table,on});return q},
      then:(resolve:any,reject:any)=>Promise.resolve().then(run).then(resolve,reject)};
    return q;
  }
  function mutation(table:any,update=false) {
    let input:any,condition:any,done:any,conflict:any;
    const run=()=>{if(done)return done; if((globalThis as any).__adminMeetingFixture?.failAudit && table._table==='auditLogsTable'){(globalThis as any).__adminMeetingFixture.failAudit=false;throw new Error('synthetic_audit_failure');} if(table._table==='dealFeedbackTable' && !update && records[table._table].some((r:any)=>r.dealId===input.dealId && r.authorUserId===input.authorUserId)) throw new Error('fixture_unique_author_deal'); if(update){done=records[table._table].filter((r:any)=>predicate(condition,r));done.forEach((r:any)=>Object.assign(r,input));}
      else if(conflict && records[table._table].some((r:any)=>r.dealId===input.dealId)){done=records[table._table].filter((r:any)=>r.dealId===input.dealId);done.forEach((r:any)=>Object.assign(r,conflict.set));}
      else {done=(Array.isArray(input)?input:[input]).map((r:any)=>({id:randomUUID(),...r}));records[table._table].push(...done);}return done;};
    const q:any={onConflictDoUpdate:(v:any)=>{conflict=v;return q},values:(v:any)=>{input=v;return q},set:(v:any)=>{input=v;return q},where:(c:any)=>{condition=c;return q},returning:async()=>run(),then:(resolve:any,reject:any)=>Promise.resolve().then(run).then(resolve,reject)};
    return q;
  }
  const key='__adminMeetingFixture';
  const state:any={tables,db:{select,insert:(t:any)=>mutation(t),update:(t:any)=>mutation(t,true)},user:null};
  state.sent=[];state.db.locks=[];state.db.execute=async(query:any)=>{state.db.locks.push(query.values?.[0]);};
  state.db.transaction=async(f:any)=>{const before=structuredClone(records);try{return await f(state.db);}catch(error){for(const name of Object.keys(records))records[name]=before[name];throw error;}};
  (globalThis as any)[key]=state;
  const output=fileURLToPath(new URL(`./admin-meeting-${randomUUID()}.mjs`,import.meta.url));
  const result=await build({stdin:{contents:`import express from 'express';export { respondToTerms,presentInitialVerifiedOffer } from '../src/marketplace/termAgreement';import router from '../src/routes/admin';import deals from '../src/routes/deals';const app=express();app.use(express.json());app.use((req,res,next)=>{req.authUser=globalThis.${key}.user;next()});app.use(router);app.use(deals);export const routes=router.stack.filter(x=>x.route).flatMap(x=>Object.keys(x.route.methods).map(method=>({method,path:x.route.path})));export default app;`,resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,platform:'node',format:'esm',packages:'external',write:false,plugins:[{name:'isolated-admin',setup(b){
    const mocks:any={
      db:`const s=globalThis.${key};export const db=s.db;`+names.map(n=>`export const ${n}=s.tables.${n};`).join(''),
      orm:`export const eq=(a,b)=>({kind:'eq',a,b});export const and=(...args)=>({kind:'and',args});export const inArray=(a,list)=>({kind:'in',a,list});export const desc=x=>x;export const or=(...args)=>({kind:'or',args});export const ilike=()=>true;export const sql=(parts,...values)=>({kind:'sql',parts,values});`,
      sessions:'export const getAuthenticatedUser=async()=>null;',
      whatsapp:'export const sendWhatsAppText=async(to,body)=>{globalThis.__adminMeetingFixture.sent.push({to,body});return {delivered:true}};export const sendWhatsAppInteractive=async(to,body)=>{globalThis.__adminMeetingFixture.sent.push({to,body});return {delivered:true}};',
      storage:'export const createSignedDownloadUrl=async()=>null;export const createSignedUploadUrl=async()=>null;export const downloadDocumentBytes=async()=>null;export const uploadDocumentBytes=async()=>null;export const parseStoragePath=()=>null;export const storagePath=()=>null;',
      screening:'export const companyProfileFingerprint=company=>JSON.stringify([company.companyName,company.registrationNumber||null,company.country||null]);export const screenCompanyEvidence=async()=>{globalThis.__adminMeetingFixture.screeningCalls=(globalThis.__adminMeetingFixture.screeningCalls||0)+1;return {status:"needs_human_review",authenticityVerified:false,observations:[],comparisons:[],confidence:0};};',
      intelligence:'export const processDocumentIntelligence=async()=>null;export const refreshDealIntelligenceSnapshot=async()=>null;',
    };
    for(const [pattern,name] of [[/^@workspace\/db$/,'db'],[/^drizzle-orm$/,'orm'],[/auth\/sessions$|^\.\/sessions$/,'sessions'],[/whatsapp\/client$/,'whatsapp'],[/supabase\/storage$/,'storage'],[/akif\/companyScreening$/,'screening'],[/akif\/documentIntelligence$/,'intelligence']] as const)
      b.onResolve({filter:pattern},()=>({path:name,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path]}));
  }}]});
  await writeFile(output,result.outputFiles[0].text);
  let server:any;
  try {
    const {default:app,routes,respondToTerms,presentInitialVerifiedOffer}=await import(output);server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
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
    await t.test('every admin endpoint rejects anonymous, trader and suspended-admin access before database reads',async()=>{
      assert.ok(routes.length>40);
      const before=dbReads;
      for(const user of [null,{id:'buyer',role:'buyer',status:'verified'},{id:'seller',role:'seller',status:'verified'},{id:'agent',role:'agent',status:'verified'},{id:'admin',role:'admin',status:'suspended'}]) {
        state.user=user;
        for(const route of routes){
          const routePath=route.path.replace(/:[^/]+/g,dealId);
          const response=await fetch(base+routePath,{method:route.method.toUpperCase(),headers:{'content-type':'application/json'},...(route.method==='get'?{}:{body:'{}'})});
          assert.equal(response.status,user?403:401,`${route.method} ${route.path}`);await response.arrayBuffer();
        }
      }
      assert.equal(dbReads,before);
    });
    state.user={id:'admin',role:'admin',status:'verified'};
    await t.test('pending, rejected, suspended, missing and wrong-role counterparties are blocked',async()=>{
      const seller=records.usersTable[1];
      for(const status of ['pending','under_review','rejected','suspended']){seller.status=status;assert.equal((await request(path)).status,409);}
      seller.status='verified';seller.role='agent';assert.equal((await request(path)).status,409);
      seller.role='seller';records.usersTable.pop();assert.equal((await request(path)).status,409);records.usersTable.push(seller);
      assert.equal(records.dealMeetingsTable.length,0);assert.equal(records.notificationsTable.length,0);
    });
    await t.test('analytics keeps currencies, payout statuses and unknown countries separate',async()=>{
      const saved={deals:records.dealsTable,users:records.usersTable,commissions:records.commissionsTable,products:records.productsTable};
      records.usersTable=[{id:'b1',country:'UAE'},{id:'b2',country:null},{id:'s1',country:'Brazil'}];
      records.productsTable=[{id:'sugar',name:'Sugar'}];
      records.dealsTable=[{id:'d1',buyerUserId:'b1',sellerUserId:'s1',productId:'sugar',status:'completed',currency:'USD',quantity:'100',agreedPrice:'500'},{id:'d2',buyerUserId:'b2',sellerUserId:'s1',productId:'sugar',status:'completed',currency:'EUR',quantity:'50',agreedPrice:'400'}];
      records.commissionsTable=[{currency:'USD',status:'pending',amount:'100'},{currency:'USD',status:'paid',amount:'200'},{currency:'EUR',status:'paid',amount:'300'}];
      try {
        const response=await fetch(base+'/admin/analytics');assert.equal(response.status,200);const data=await response.json();
        assert.deepEqual(data.completedValues.map((r:any)=>[r.currency,r.value]).sort(),[['EUR','20000'],['USD','50000']]);
        assert.deepEqual(data.sellerCountries,[{country:'Brazil',dealCount:2}]);
        assert.equal(data.buyerCountries.find((r:any)=>r.country===null).dealCount,1);
        assert.equal(data.commissionPerformance.length,3);
        assert.equal(data.commissionPerformance.find((r:any)=>r.currency==='USD'&&r.status==='paid').amount,'200');
        assert.equal(data.products[0].product,'Sugar');assert.equal(data.products[0].dealCount,2);
      } finally {records.dealsTable=saved.deals;records.usersTable=saved.users;records.commissionsTable=saved.commissions;records.productsTable=saved.products;}
    });
    await t.test('all trading roles enter human verification; agents can be approved without granting admin access',async()=>{
      const saved=Object.fromEntries(['usersTable','auditLogsTable','notificationsTable'].map(name=>[name,records[name]]));
      try {
        records.usersTable=[{id:'pending-agent',role:'agent',status:'pending'},{id:'pending-buyer',role:'buyer',status:'under_review'},{id:'pending-seller',role:'seller',status:'active'},{id:'admin-account',role:'admin',status:'active'},{id:'blocked-agent',role:'agent',status:'suspended'}];
        records.auditLogsTable=[];records.notificationsTable=[];
        const response=await fetch(base+'/admin/users/pending-verification');assert.equal(response.status,200);
        assert.deepEqual((await response.json()).users.map((u:any)=>u.id).sort(),['pending-agent','pending-buyer','pending-seller']);
        const path='/admin/users/pending-agent/verification';
        for(const user of [null,{id:'pending-agent',role:'agent',status:'verified'},{id:'admin',role:'admin',status:'suspended'}]){
          state.user=user;assert.equal((await request(path,{status:'verified'},'PATCH')).status,user?403:401);
        }
        assert.equal(records.usersTable[0].status,'pending');assert.equal(records.auditLogsTable.length,0);
        state.user={id:'admin',role:'admin',status:'verified'};
        let result=await request(path,{status:'under_review'},'PATCH');assert.equal(result.status,200);assert.equal(result.data.user.role,'agent');
        result=await request(path,{status:'verified'},'PATCH');assert.equal(result.status,200);assert.equal(result.data.user.status,'verified');assert.equal(result.data.user.role,'agent');
        assert.equal(records.auditLogsTable.at(-1).metadata.previousStatus,'under_review');assert.equal(records.auditLogsTable.at(-1).metadata.newStatus,'verified');assert.equal(records.notificationsTable.at(-1).userId,'pending-agent');
        assert.ok(state.db.locks.some((v:any)=>v==='user_verification:pending-agent'));
        const notifications=records.notificationsTable.length;
        assert.equal((await request(path,{status:'verified'},'PATCH')).status,200);assert.equal(records.notificationsTable.length,notifications);
        assert.equal((await request('/admin/users/admin-account/verification',{status:'verified'},'PATCH')).status,409);
        assert.equal((await request(path,{status:'admin'},'PATCH')).status,400);assert.equal((await request('/admin/users/unknown/verification',{status:'verified'},'PATCH')).status,404);
        result=await request(path,{status:'rejected'},'PATCH');assert.equal(result.status,200);assert.equal(records.usersTable[0].status,'rejected');
        const beforeAudit=records.auditLogsTable.length,beforeNotify=records.notificationsTable.length;state.failAudit=true;result=await request(path,{status:'verified'},'PATCH');assert.equal(result.status,500);assert.equal(records.usersTable[0].status,'rejected');assert.equal(records.auditLogsTable.length,beforeAudit);assert.equal(records.notificationsTable.length,beforeNotify);
      } finally {for(const [name,rows] of Object.entries(saved))records[name]=rows;state.user={id:'admin',role:'admin',status:'verified'};}
    });
    await t.test('approved verified matching creates one private deal with both participants',async()=>{
      const saved=Object.fromEntries(['buyerRequestsTable','sellerListingsTable','matchesTable','dealsTable','dealParticipantsTable','notificationsTable','auditLogsTable'].map(name=>[name,records[name]]));
      try {
        const requirementId=randomUUID(),offerId=randomUUID(),productId=randomUUID();
        records.buyerRequestsTable=[{id:requirementId,buyerUserId:'buyer',productId,quantity:'100',unit:'MT',targetPrice:'500',currency:'USD',destination:'Mombasa',status:'pending_admin_review'}];
        records.sellerListingsTable=[{id:offerId,sellerUserId:'seller',productId,quantity:'100',unit:'MT',price:'490',currency:'USD',incoterm:'CIF',status:'approved'}];
        records.matchesTable=[];records.dealsTable=[];records.dealParticipantsTable=[];records.notificationsTable=[];records.auditLogsTable=[];
        const input={buyerRequestId:requirementId,sellerListingId:offerId};
        assert.equal((await request('/admin/matches',input)).status,409);
        records.buyerRequestsTable[0].status='approved';records.sellerListingsTable[0].productId='another-product';assert.equal((await request('/admin/matches',input)).status,409);
        records.sellerListingsTable[0].productId=productId;records.usersTable[1].status='pending';assert.equal((await request('/admin/matches',input)).status,409);
        records.usersTable[1].status='verified';records.companiesTable[1].verificationStatus='pending';assert.equal((await request('/admin/matches',input)).status,409);records.companiesTable[1].verificationStatus='verified';records.companyVerificationDocumentsTable[1].status='rejected';assert.equal((await request('/admin/matches',input)).status,409);records.companyVerificationDocumentsTable[1].status='approved';const matched=await request('/admin/matches',input);assert.equal(matched.status,201);assert.equal(matched.data.match.status,'approved');
        assert.equal((await request('/admin/matches',input)).status,409);
        const terms={matchId:matched.data.match.id,quantity:100,agreedPrice:490};
        records.sellerListingsTable[0].unit='kg';assert.equal((await request('/admin/deals',terms)).status,409);records.sellerListingsTable[0].unit='MT';
        records.usersTable[1].status='suspended';assert.equal((await request('/admin/deals',terms)).status,409);records.usersTable[1].status='verified';
        const created=await request('/admin/deals',terms);assert.equal(created.status,201);assert.equal(created.data.deal.destination,'Mombasa');assert.equal(created.data.deal.incoterm,'CIF');assert.equal(created.data.deal.status,'initiated');
        assert.deepEqual(records.dealParticipantsTable.map((r:any)=>[r.userId,r.participantRole,r.status]),[['buyer','buyer','active'],['seller','seller','active']]);
        assert.equal((await request('/admin/deals',terms)).status,409);assert.equal(records.dealsTable.length,1);
        assert.ok(records.auditLogsTable.some((r:any)=>r.action==='match_created'));assert.ok(records.auditLogsTable.some((r:any)=>r.action==='deal_created'));
      } finally {for(const [name,rows] of Object.entries(saved))records[name]=rows;records.usersTable[1].status='verified';}
    });
    await t.test('alternate seller terms require exact buyer agreement; reject retains demand and suggests verified supply',async()=>{
      const saved=structuredClone(records);state.user={id:'admin',role:'admin',status:'verified'};
      try {
        const productId=randomUUID(),requestId=randomUUID(),offerId=randomUUID(),matchId=randomUUID();
        records.usersTable=[{id:'buyer',phone:'10000000001',role:'buyer',status:'verified'},{id:'seller',role:'seller',status:'verified'},{id:'next-seller',role:'seller',status:'verified'},{id:'admin',role:'admin',status:'verified'}];
        records.buyerRequestsTable=[{id:requestId,buyerUserId:'buyer',productId,quantity:'100',unit:'MT',targetPrice:'500',currency:'USD',destination:'Mombasa',status:'approved'}];
        records.sellerListingsTable=[{id:offerId,sellerUserId:'seller',productId,quantity:'100',unit:'MT',price:'490',currency:'USD',incoterm:'EXW',destination:'Agreed warehouse',paymentTerms:'30% advance, 70% on delivery',status:'approved'},{id:randomUUID(),sellerUserId:'next-seller',productId,quantity:'200',unit:'MT',price:'480',currency:'USD',incoterm:'CIF',destination:'Mombasa',status:'approved'}];
        records.companiesTable=[{id:'bc',ownerUserId:'buyer',verificationStatus:'verified'},{id:'sc',ownerUserId:'seller',verificationStatus:'verified'},{id:'nc',ownerUserId:'next-seller',verificationStatus:'verified'}];records.companyVerificationDocumentsTable=[{companyId:'bc',status:'approved'},{companyId:'sc',status:'approved'},{companyId:'nc',status:'approved'}];
        records.matchesTable=[{id:matchId,buyerRequestId:requestId,sellerListingId:offerId,status:'approved'}];records.dealsTable=[];records.auditLogsTable=[];
        const terms={matchId,quantity:100,agreedPrice:490};
        assert.equal((await request('/admin/deals',terms)).data.error,'explicit_buyer_terms_agreement_required');
        let review=await request(`/admin/matches/${matchId}/terms-review`,{});assert.equal(review.status,200);
        const proposalId=review.data.proposalId;
        await respondToTerms('10000000002',proposalId,true);assert.equal(records.auditLogsTable.filter((r:any)=>r.action==='match_terms_accepted').length,0);
        records.sellerListingsTable[0].price='495';await respondToTerms('10000000001',proposalId,true);assert.equal(records.auditLogsTable.filter((r:any)=>r.action==='match_terms_accepted').length,0);records.sellerListingsTable[0].price='490';
        const savedExpiry=records.auditLogsTable[0].metadata.expiresAt;records.auditLogsTable[0].metadata.expiresAt=new Date(0).toISOString();await respondToTerms('10000000001',proposalId,true);assert.equal(records.auditLogsTable.filter((r:any)=>r.action==='match_terms_accepted').length,0);records.auditLogsTable[0].metadata.expiresAt=savedExpiry;
        await respondToTerms('10000000001',proposalId,true);await respondToTerms('10000000001',proposalId,true);assert.equal(records.auditLogsTable.filter((r:any)=>r.action==='match_terms_accepted').length,1);
        assert.equal((await request('/admin/deals',{...terms,agreedPrice:489})).data.error,'deal_differs_from_buyer_accepted_terms');
        state.failAudit=true;assert.equal((await request('/admin/deals',terms)).status,500);assert.equal(records.dealsTable.length,0);
        const opened=await request('/admin/deals',terms);assert.equal(opened.status,201);const dealId=opened.data.deal.id;
        assert.equal(records.auditLogsTable.find((r:any)=>r.action==='deal_created').metadata.agreedTerms.paymentTerms,'30% advance, 70% on delivery');
        assert.equal((await request(`/admin/deals/${dealId}/status`,{status:'payment',confirmDestinationSgs:true},'PATCH')).status,409);
        const evidenceId=randomUUID();records.documentsTable=[{id:evidenceId,dealId,status:'approved',documentType:'Payment evidence'}];
        assert.equal((await request(`/admin/deals/${dealId}/status`,{status:'payment',confirmAlternativePaymentReview:true,paymentEvidenceDocumentId:evidenceId},'PATCH')).status,200);
        const reviewAudit=records.auditLogsTable.find((r:any)=>r.action==='deal_status_updated');assert.equal(reviewAudit.metadata.alternativePaymentReviewedByAdmin,true);assert.equal(reviewAudit.metadata.destinationSgsConfirmedByAdmin,undefined);
        records.dealsTable=[];
        records.sellerListingsTable[0].paymentTerms='100% advance';assert.equal((await request('/admin/deals',terms)).data.error,'explicit_buyer_terms_agreement_required');
        // New revision supersedes previous consent; rejection excludes this seller and preserves the requirement.
        records.auditLogsTable=[];review=await request(`/admin/matches/${matchId}/terms-review`,{});const before=structuredClone(records.buyerRequestsTable[0]);
        state.failAudit=true;await assert.rejects(respondToTerms('10000000001',review.data.proposalId,false),/audit_failure/);assert.equal(records.matchesTable[0].status,'approved');
        await respondToTerms('10000000001',review.data.proposalId,false);
        assert.deepEqual(records.buyerRequestsTable[0],before);assert.equal(records.matchesTable[0].status,'declined');assert.equal(records.matchesTable[1].status,'approved');assert.equal(records.matchesTable[1].sellerListingId,records.sellerListingsTable[1].id);
        await respondToTerms('10000000001',review.data.proposalId,false);assert.equal(records.matchesTable.length,2);
        const nextProposal=records.auditLogsTable.find((row:any)=>row.action==='match_terms_proposed'&&row.entityId===records.matchesTable[1].id);assert.ok(nextProposal);assert.equal(nextProposal.metadata.source,'automatic_rematch');assert.equal((await request('/admin/deals',{matchId:records.matchesTable[1].id,quantity:100,agreedPrice:480})).data.error,'explicit_buyer_terms_agreement_required');assert.equal(records.auditLogsTable.filter((row:any)=>row.action==='match_terms_accepted').length,0);assert.equal(records.dealsTable.length,0);
        const proposalCount=records.auditLogsTable.filter((row:any)=>row.action==='match_terms_proposed').length;await respondToTerms('10000000001',review.data.proposalId,false);assert.equal(records.auditLogsTable.filter((row:any)=>row.action==='match_terms_proposed').length,proposalCount);
        await respondToTerms('10000000001',nextProposal.id,false);assert.equal(records.matchesTable.length,2);assert.equal(records.matchesTable[1].status,'declined');assert.deepEqual(records.buyerRequestsTable[0],before);
      } finally {for(const name of Object.keys(records))records[name]=saved[name];}
    });
    await t.test('company AI screening is admin-only, cached and cannot approve company evidence',async()=>{
      const saved=structuredClone(records);
      try{
        const documentId=randomUUID(),companyId=randomUUID();records.companyVerificationDocumentsTable=[{id:documentId,companyId,status:'pending',fileUrl:'storage://private/companies/test.pdf'}];records.companiesTable=[{id:companyId,companyName:'Synthetic Company',verificationStatus:'pending'}];records.auditLogsTable=[];
        const endpoint=`/admin/company-verification-documents/${documentId}/analyze`;const before=state.screeningCalls||0;
        state.user={id:'buyer',role:'buyer',status:'verified'};assert.equal((await request(endpoint,{})).status,403);assert.equal(state.screeningCalls||0,before);
        state.user={id:'admin',role:'admin',status:'verified'};assert.equal((await request(endpoint,{})).status,200);assert.equal((await request(endpoint,{})).status,200);assert.equal(state.screeningCalls,before+1);
        assert.equal(records.companyVerificationDocumentsTable[0].status,'pending');assert.equal(records.companiesTable[0].verificationStatus,'pending');assert.equal(records.auditLogsTable.filter((r:any)=>r.action==='company_document_screened').length,1);
      }finally{for(const name of Object.keys(records))records[name]=saved[name];state.user={id:'admin',role:'admin',status:'verified'};}
    });
    await t.test('company review is atomic and a trader cannot stay verified after losing approved evidence',async()=>{
      const saved=structuredClone(records);state.user={id:'admin',role:'admin',status:'verified'};
      try{
        const companyId=randomUUID(),documentId=randomUUID();records.usersTable=[{id:'buyer',role:'buyer',status:'pending'}];records.companiesTable=[{id:companyId,ownerUserId:'buyer',companyName:'Synthetic Company',verificationStatus:'pending'}];records.companyVerificationDocumentsTable=[{id:documentId,companyId,status:'pending',reviewNote:null}];records.auditLogsTable=[];records.notificationsTable=[];
        const companyPath=`/admin/companies/${companyId}/verification`,documentPath=`/admin/company-verification-documents/${documentId}/status`;
        let response=await request(companyPath,{verification_status:'under_review'},'PATCH');assert.equal(response.status,200);assert.equal(records.companiesTable[0].verificationStatus,'under_review');
        assert.equal((await request('/admin/users/buyer/verification',{status:'verified'},'PATCH')).status,409);assert.equal(records.usersTable[0].status,'pending');
        assert.equal((await request(companyPath,{verification_status:'verified'},'PATCH')).status,409);
        const before=records.auditLogsTable.length;state.failAudit=true;assert.equal((await request(documentPath,{status:'approved'},'PATCH')).status,500);assert.equal(records.companyVerificationDocumentsTable[0].status,'pending');assert.equal(records.auditLogsTable.length,before);
        assert.equal((await request(documentPath,{status:'approved'},'PATCH')).status,200);const audited=records.auditLogsTable.length,notified=records.notificationsTable.length;
        assert.equal((await request(documentPath,{status:'approved'},'PATCH')).status,200);assert.equal(records.auditLogsTable.length,audited);assert.equal(records.notificationsTable.length,notified);
        state.failAudit=true;assert.equal((await request(companyPath,{verification_status:'verified'},'PATCH')).status,500);assert.equal(records.companiesTable[0].verificationStatus,'under_review');
        assert.equal((await request(companyPath,{verification_status:'verified'},'PATCH')).status,200);assert.equal((await request('/admin/users/buyer/verification',{status:'verified'},'PATCH')).status,200);assert.equal(records.usersTable[0].status,'verified');
        assert.equal((await request(documentPath,{status:'rejected'},'PATCH')).status,400);
        state.failAudit=true;assert.equal((await request(documentPath,{status:'rejected',reviewNote:'Evidence inconsistent'},'PATCH')).status,500);assert.equal(records.companyVerificationDocumentsTable[0].status,'approved');assert.equal(records.usersTable[0].status,'verified');
        assert.equal((await request(documentPath,{status:'rejected',reviewNote:'Evidence inconsistent'},'PATCH')).status,200);assert.equal(records.companyVerificationDocumentsTable[0].status,'rejected');assert.equal(records.companiesTable[0].verificationStatus,'under_review');assert.equal(records.usersTable[0].status,'under_review');
        assert.equal((await request(companyPath,{verification_status:'verified'},'PATCH')).status,409);
        // Another approved company document keeps the evidence requirement satisfied.
        records.companiesTable[0].verificationStatus='verified';records.usersTable[0].status='verified';records.companyVerificationDocumentsTable[0].status='approved';records.companyVerificationDocumentsTable.push({id:randomUUID(),companyId,status:'approved'});
        assert.equal((await request(documentPath,{status:'rejected',reviewNote:'Replace this evidence'},'PATCH')).status,200);assert.equal(records.companiesTable[0].verificationStatus,'verified');assert.equal(records.usersTable[0].status,'verified');
      }finally{for(const name of Object.keys(records))records[name]=saved[name];}
    });
    await t.test('approved requirements automatically receive an eligible offer only after both counterparties and evidence are verified',async()=>{
      const saved=structuredClone(records);
      try{
        const buyerId='buyer',sellerId='seller',requirementId=randomUUID(),offerId=randomUUID(),productId=randomUUID();
        records.usersTable=[{id:buyerId,role:'buyer',status:'pending',phone:'10000000001'},{id:sellerId,role:'seller',status:'verified'}];records.companiesTable=[{id:'bc',ownerUserId:buyerId,verificationStatus:'verified'},{id:'sc',ownerUserId:sellerId,verificationStatus:'verified'}];records.companyVerificationDocumentsTable=[{companyId:'bc',status:'approved'},{companyId:'sc',status:'approved'}];
        records.buyerRequestsTable=[{id:requirementId,buyerUserId:buyerId,productId,quantity:'100',unit:'MT',currency:'USD',targetPrice:'500',destination:'Mombasa',status:'approved'}];records.sellerListingsTable=[{id:offerId,sellerUserId:sellerId,productId,quantity:'100',unit:'MT',price:'490',currency:'USD',incoterm:'CIF',destination:'Mombasa',status:'approved'}];records.matchesTable=[];records.dealsTable=[];records.auditLogsTable=[];
        assert.equal(await presentInitialVerifiedOffer(requirementId),false);assert.equal(records.matchesTable.length,0);
        records.usersTable[0].status='verified';records.companyVerificationDocumentsTable[1].status='pending';assert.equal(await presentInitialVerifiedOffer(requirementId),false);assert.equal(records.matchesTable.length,0);records.companyVerificationDocumentsTable[1].status='approved';
        assert.equal(await presentInitialVerifiedOffer(requirementId),true);assert.equal(records.matchesTable.length,1);assert.equal(records.matchesTable[0].status,'approved');assert.equal(records.dealsTable.length,0);assert.equal(records.auditLogsTable.find((row:any)=>row.action==='match_terms_proposed').metadata.source,'automatic_initial_match');
        assert.equal(await presentInitialVerifiedOffer(requirementId),false);assert.equal(records.matchesTable.length,1);assert.equal(records.auditLogsTable.filter((row:any)=>row.action==='match_terms_proposed').length,1);
      }finally{for(const name of Object.keys(records))records[name]=saved[name];}
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
    await t.test('payment milestones need matching DLC, SGS, passed inspection and explicit destination review',async()=>{
      records.dealsTable[0].status='delivery';
      const route=`/admin/deals/${dealId}/status`;
      assert.equal((await request(route,{status:'payment',confirmDestinationSgs:true},'PATCH')).status,409);
      records.dealFinancialsTable=[{id:'dlc',dealId:'another-deal',instrumentType:'DLC',status:'confirmed'}];
      records.inspectionsTable=[{id:'inspection',dealId:'another-deal',status:'passed'}];
      records.documentsTable=[{id:'sgs',dealId:'another-deal',documentType:'SGS',status:'approved'}];
      assert.equal((await request(route,{status:'payment',confirmDestinationSgs:true},'PATCH')).status,409);
      for(const name of ['dealFinancialsTable','inspectionsTable','documentsTable']) records[name][0].dealId=dealId;
      assert.equal((await request(route,{status:'payment'},'PATCH')).status,409);
      assert.equal((await request(route,{status:'payment',confirmDestinationSgs:true},'PATCH')).status,200);
      assert.equal(records.dealsTable[0].status,'payment');
      const audit=records.auditLogsTable.find((r:any)=>r.action==='deal_status_updated');
      assert.equal(audit.metadata.destinationSgsConfirmedByAdmin,true);assert.equal(audit.metadata.paymentEvidence.approvedSgsDocumentId,'sgs');
    });
    await t.test('commissions calculate agreed rules, reject mismatches and lock duplicate agent rewards',async()=>{
      Object.assign(records.dealsTable[0],{quantity:'100.000000',agreedPrice:'5900.00',unit:'MT',currency:'USD'});
      const agentId=randomUUID();records.usersTable.push({id:agentId,role:'agent',status:'verified'});
      records.dealParticipantsTable.push({id:randomUUID(),dealId,userId:agentId,participantRole:'agent',status:'active'});
      const input={dealId,beneficiaryUserId:agentId,commissionType:'percentage',commissionRate:'1.25'};
      assert.equal((await request('/admin/commissions',input)).status,400);
      assert.equal((await request('/admin/commissions',{...input,confirmAgreedTerms:true,currency:'EUR'})).status,409);
      assert.equal((await request('/admin/commissions',{...input,confirmAgreedTerms:true,amount:'1'})).status,409);
      const response=await request('/admin/commissions',{...input,confirmAgreedTerms:true});assert.equal(response.status,201);
      assert.equal(response.data.commission.amount,'7375.00');assert.equal(response.data.commission.currency,'USD');assert.equal(response.data.commission.status,'pending');
      assert.equal((await request('/admin/commissions',{...input,confirmAgreedTerms:true})).status,409);
      assert.ok(state.db.locks.includes(`commission:${dealId}:${agentId}`));
      const audit=records.auditLogsTable.find((r:any)=>r.action==='commission_created');assert.equal(audit.metadata.method,'percentage');assert.equal(audit.metadata.agreedTermsConfirmed,true);
      const perMtAgent=randomUUID();records.usersTable.push({id:perMtAgent,role:'agent',status:'verified'});records.dealParticipantsTable.push({id:randomUUID(),dealId,userId:perMtAgent,participantRole:'agent',status:'active'});
      const perMt={dealId,beneficiaryUserId:perMtAgent,commissionType:'fixed_per_mt',commissionRate:'2.50',confirmAgreedTerms:true};
      records.dealsTable[0].unit='kg';assert.equal((await request('/admin/commissions',perMt)).status,400);
      records.dealsTable[0].unit='MT';assert.equal((await request('/admin/commissions',perMt)).data.commission.amount,'250.00');
    });
    await t.test('commission payout records require a completed deal',async()=>{
      const id=randomUUID();records.commissionsTable=[{id,dealId,beneficiaryUserId:'agent',currency:'USD',amount:'100',status:'pending'}];
      assert.equal((await request(`/admin/commissions/${id}/status`,{status:'paid'},'PATCH')).status,409);
      assert.equal(records.commissionsTable[0].status,'pending');
      assert.equal((await request(`/admin/deals/${dealId}/status`,{status:'completed',confirmDestinationSgs:true},'PATCH')).status,200);
      assert.equal((await request(`/admin/commissions/${id}/status`,{status:'paid'},'PATCH')).status,200);
      assert.ok(records.commissionsTable[0].paidAt);assert.equal(records.commissionsTable[0].status,'paid');
    });
    await t.test('inspection, shipment and customs records use existing audited operations',async()=>{
      const inspection=await request('/admin/inspections',{dealId,inspectorName:'Synthetic SGS',scheduledAt:'2026-11-01T10:00:00Z'});assert.equal(inspection.status,201);
      assert.equal((await request(`/admin/inspections/${inspection.data.inspection.id}`,{status:'passed',resultSummary:'Synthetic reviewed evidence'},'PATCH')).status,200);
      const shipment=await request('/admin/shipments',{dealId,carrier:'Synthetic carrier',trackingNumber:'TEST-ONLY',origin:'Santos',destination:'Mombasa'});assert.equal(shipment.status,201);
      assert.equal((await request(`/admin/shipments/${shipment.data.shipment.id}`,{status:'in_transit',notes:'Synthetic confirmed departure'},'PATCH')).status,200);
      const timeline=records.shipmentTrackingEventsTable;
      assert.equal(timeline.length,2);assert.deepEqual(timeline.map((e:any)=>e.kind),['planned','status_update']);
      assert.equal(timeline[1].shipmentStatus,'in_transit');assert.equal(timeline[1].source,'udc_manual');
      const eventPath=`/admin/shipments/${shipment.data.shipment.id}/events`;
      const milestone={kind:'departed',occurredAt:new Date(Date.now()-60_000).toISOString(),location:'Synthetic Port',source:'carrier_reported',sourceReference:'QA-BL-001',note:'Carrier message recorded, not live GPS'};
      assert.equal((await request(eventPath,{...milestone,sourceReference:undefined})).status,400);
      assert.equal((await request(eventPath,{...milestone,occurredAt:new Date(Date.now()+86_400_000).toISOString()})).status,400);
      assert.equal(timeline.length,2);
      const added=await request(eventPath,milestone);assert.equal(added.status,201);
      assert.equal(timeline.length,3);assert.equal(timeline[2].source,'carrier_reported');
      assert.equal(timeline[2].location,'Synthetic Port');assert.equal(timeline[2].recordedByUserId,'admin');
      assert.ok(records.auditLogsTable.some((r:any)=>r.action==='shipment_milestone_recorded'));
      state.failAudit=true;
      assert.equal((await request(eventPath,{...milestone,kind:'delay'})).status,500);
      assert.equal(records.shipmentTrackingEventsTable.length,3,'failed audit cannot persist milestone');
      const priorCount=records.shipmentTrackingEventsTable.length;
      assert.equal((await request(`/admin/shipments/${shipment.data.shipment.id}`,{status:'in_transit'},'PATCH')).status,200);
      assert.equal(records.shipmentTrackingEventsTable.length,priorCount,'same status cannot append a fake milestone');

      assert.equal((await request(`/admin/deals/${dealId}/customs`,{status:'submitted',country:'Kenya',port:'Mombasa',reference:'SYNTHETIC'},'PUT')).status,200);
      assert.equal((await request(`/admin/deals/${dealId}/customs`,{status:'cleared',country:'Kenya',port:'Mombasa',reference:'SYNTHETIC'},'PUT')).status,200);
      assert.equal(records.customsClearanceTable.length,1);assert.equal(records.customsClearanceTable[0].status,'cleared');assert.ok(records.customsClearanceTable[0].clearedAt);
      for(const action of ['inspection_created','shipment_created','inspection_status_updated','shipment_status_updated','customs_status_updated'])assert.ok(records.auditLogsTable.some((r:any)=>r.action===action),action);
    });
    await t.test('completed counterparties submit one feedback record and only reviewed feedback is shared',async()=>{
      const route=`/deals/${dealId}/feedback`;
      state.user={id:'outsider',role:'buyer',status:'verified'};
      assert.equal((await request(route,{rating:5})).status,404);
      state.user={id:'buyer',role:'buyer',status:'verified'};
      records.dealsTable[0].status='shipment';assert.equal((await request(route,{rating:5})).status,409);
      records.dealsTable[0].status='completed';assert.equal((await request(route,{rating:0})).status,400);
      const response=await request(route,{rating:5,comment:'Synthetic trade review'});assert.equal(response.status,201);
      assert.equal(response.data.feedback.status,'pending_review');
      assert.equal((await request(route,{rating:4})).status,409);
      let execution=await fetch(base+`/deals/${dealId}/execution`);assert.equal(execution.status,200);assert.deepEqual((await execution.json()).feedback,[]);
      state.user={id:'admin',role:'admin',status:'verified'};
      assert.equal((await request(`/admin/feedback/${response.data.feedback.id}/status`,{status:'approved'},'PATCH')).status,200);
      state.user={id:'seller',role:'seller',status:'verified'};
      execution=await fetch(base+`/deals/${dealId}/execution`);const data=await execution.json();assert.equal(data.feedback.length,1);assert.equal(data.feedback[0].comment,'Synthetic trade review');
      assert.equal(data.feedback[0].authorUserId,undefined);
      state.user={id:'admin',role:'admin',status:'verified'};
    });
  } finally {if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await unlink(output);delete (globalThis as any)[key];}
});
