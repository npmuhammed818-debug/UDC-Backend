// Isolated loopback QA DB only (udc_qa_journey_*), synthetic data, real routes and real SQL.
// Continuous fictional web/API cohort with real OTP, vault and manual verification, then requirement + offer -> admin approval -> match -> deal -> agent + referral -> shipment tracking -> commission.
//   UDC_LIFECYCLE_QA_DATABASE_URL='postgresql://udc_dev@127.0.0.1:5432/udc_qa_lifecycle_x?sslmode=disable' node .../p0-gates-postgres.mjs
// Schema must exist first: pnpm --filter @workspace/db run push against the same DB.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const url = new URL(process.env.UDC_LIFECYCLE_QA_DATABASE_URL ?? "http://missing.invalid");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.match(url.pathname, /^\/udc_qa_lifecycle_[a-z0-9_]+$/);
for (const key of Object.keys(process.env))
  if (/^(SUPABASE_|WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_|SESSION_SECRET)/.test(key)) delete process.env[key];
Object.assign(process.env, { SUPABASE_DATABASE_URL: url.href, SESSION_SECRET: randomBytes(32).toString("hex"), NODE_ENV: "test", WHATSAPP_APP_SECRET: "synthetic-lifecycle-signature-secret-32", UDC_PUBLIC_APP_URL: "https://qa.example.invalid", VAULT_PUBLIC_BASE_URL:"https://vault.example.invalid" });
const mail=[];globalThis.__lifecycleMail=mail;
await mkdir(new URL("../../tmp/", import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL("../../tmp/qa-lifecycle-", import.meta.url)));
let server, pool, origin;
const beforeFetch = globalThis.fetch;
const prompts=[];
globalThis.fetch = async (input, init) => {
  if(new URL(String(input)).origin==='https://worker.example.invalid'){
    prompts.push(JSON.parse(init.body));
    return Response.json({choices:[{message:{content:JSON.stringify({intent:'status_question',replyToSender:'Your recorded deal needs UDC review.',relay:false,relayToCounterparty:null,newTradeIntake:false})}}]});
  }
  assert.equal(new URL(String(input)).origin, origin, "never contact external services");
  return beforeFetch(input, init);
};
try {
  await build({
    stdin: {
      contents: `import express from 'express';import cookieParser from 'cookie-parser';import auth from './src/routes/auth';import marketplace from './src/routes/marketplace';import deals from './src/routes/deals';import documents from './src/routes/documents';import referrals from './src/routes/referrals';import admin from './src/routes/admin';import email from './src/routes/emailAuth';import vault,{vaultShortRouter} from './src/routes/vault';import commissions from './src/routes/commissions';import notifications from './src/routes/notifications';import {loadAuth} from './src/auth/middleware';export {pool,db} from '@workspace/db';export {hashPassword} from './src/auth/passwords';export {interpretActiveDealConversation} from './src/akif/dealConversationAgent';export {saveTradeAssistRequest} from './src/deals/tradeAssistRepository';export {prepareRestartRequest} from './src/deals/restartRequest';export {prepareTrialOrder} from './src/deals/trialOrder';export {respondToTerms} from './src/marketplace/termAgreement';export {requestRoleChange} from './src/accounts/roleChangeRequest';import roleReview from './src/routes/roleChangeReview';const app=express();app.set('trust proxy','loopback');app.use(express.json());app.use(cookieParser());app.use(loadAuth);app.use(auth);app.use(email);app.use(vault);app.use(vaultShortRouter);app.use('/api',vault);app.use(marketplace);app.use(deals);app.use(documents);app.use(referrals);app.use(admin);app.use(commissions);app.use(notifications);app.use(roleReview);export default app;`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
    },
    plugins: [{name:"fictional-mail",setup(b){b.onResolve({filter:/\/emailDelivery$/},()=>({path:"mail",namespace:"mail"}));b.onLoad({filter:/.*/,namespace:"mail"},()=>({contents:"export const sendAuthEmail=async value=>{globalThis.__lifecycleMail.push(value);};"}));}}, { name: "fake-storage", setup(b) { b.onResolve({ filter: /supabase\/storage$/ }, () => ({ path: "fs", namespace: "fake" })); b.onLoad({ filter: /.*/, namespace: "fake" }, () => ({ loader: "js", contents: "export async function removeDocumentObject(){};export async function uploadDocumentBytes(path){ return 'storage://udc-documents/'+path; } export async function createSignedDownloadUrl(path){ return 'https://signed.example.invalid/'+path; } export async function createSignedUploadUrl(path){ return 'https://signed.example.invalid/up/'+path; } export function storagePath(p){ return 'storage://udc-documents/'+p; } export function parseStoragePath(v){ const m=/^storage:\\/\\/udc-documents\\/(.+)$/.exec(v); return m?m[1]:null; } export async function downloadDocumentBytes(){ throw new Error('no network'); }" })); } }],
    outfile: directory + "/app.mjs", bundle: true, platform: "node", format: "esm", external: ["pg-native", "@resvg/resvg-js"], logLevel: "silent",
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
  });
  const app = await import(directory + "/app.mjs");
  pool = app.pool;
  for(const migration of ['20261023_email_authentication.sql','20261025_vault_upload_links.sql','20261024_user_role_change_review.sql','20261026_role_activation_status.sql'])
    await pool.query(await readFile(new URL('../../../../lib/db/migrations/'+migration,import.meta.url),'utf8'));
  server = app.default.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  let ip = 1, checks = 0;
  const call = async (method, path, body, cookie = "") => {
    const response = await fetch(origin + path, {
      method,
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `198.20.0.${ip++ % 250}`, ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json().catch(() => ({})), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  };
  const pass = (l) => { checks++; console.log("PASSED: " + l); };
  const password = "Fictional-Password9!Zz";
  const hash = await app.hashPassword(password);
  const mk = async (role, status, referralToken) => {
    const email = `${role}-${randomUUID()}@qa-business.example.invalid`;
    if(role==='admin'){
      const id=(await pool.query("insert into users(email,password_hash,role,status) values($1,$2,'admin','active') returning id",[email,hash])).rows[0].id;
      const login=await call('POST','/auth/login',{email,password});assert.equal(login.status,200);return {id,cookie:login.cookie};
    }
    const registered=await call('POST','/auth/register',{full_name:'Fictional '+role,email,password,role,
      company_name:role==='agent'?undefined:'Fictional '+role+' Trading',referral_token:referralToken,
      accepted_terms:true,adult_business_user:true});
    assert.equal(registered.status,201,JSON.stringify(registered.body));
    const user={id:registered.body.user.id,cookie:registered.cookie,email};
    assert.equal(registered.body.user.status,'pending');
    const challenge=await call('POST','/auth/email/verification/request',{},user.cookie);
    assert.equal(challenge.status,202,JSON.stringify(challenge.body));
    const letter=mail.findLast(m=>m.to===email);assert.ok(letter);
    const proof={challengeId:challenge.body.challengeId,code:letter.code};
    assert.equal((await call('POST','/auth/email/verification/confirm',proof,user.cookie)).status,200);
    assert.equal((await call('POST','/auth/email/verification/confirm',proof,user.cookie)).status,400);
    assert.equal((await pool.query('select status from users where id=$1',[user.id])).rows[0].status,'pending','email proof never approves a trader');
    if(role!=='agent'){
      const company=(await pool.query('select id from companies where owner_user_id=$1',[user.id])).rows[0].id;
      assert.equal((await call('PATCH',`/admin/companies/${company}/verification`,{verification_status:'verified'},admin.cookie)).status,409);
      assert.equal((await call('PATCH',`/admin/users/${user.id}/verification`,{status:'verified'},admin.cookie)).status,409);
      const link=await call('POST','/vault/upload-links',{documentType:'company_registration'},user.cookie);
      assert.equal(link.status,201,JSON.stringify(link.body));
      const path=new URL(link.body.url).pathname;
      const bytes=Buffer.from('%PDF-1.4\n'+'synthetic-evidence '.repeat(20));
      const upload=async()=>fetch(origin+path,{method:'POST',headers:{'content-type':'application/pdf'},body:bytes});
      assert.equal((await upload()).status,201);assert.equal((await upload()).status,410,'link is single-use');
      const doc=(await pool.query('select id from company_verification_documents where company_id=$1',[company])).rows[0].id;
      assert.equal((await call('PATCH',`/admin/company-verification-documents/${doc}/status`,{status:'approved'},user.cookie)).status,403);
      assert.equal((await call('PATCH',`/admin/company-verification-documents/${doc}/status`,{status:'approved'},admin.cookie)).status,200);
      assert.equal((await call('PATCH',`/admin/companies/${company}/verification`,{verification_status:'verified'},admin.cookie)).status,200);
    }
    assert.equal((await call('PATCH',`/admin/users/${user.id}/verification`,{status:'verified'},admin.cookie)).status,200);
    pass(role+': actual consented registration, one-time OTP, private company evidence where required, human-only verification');
    return user;
  };
  const admin=await mk('admin','active');
  const agent=await mk('agent');
  const invitation=await call('GET','/agent/referral-link',undefined,agent.cookie);assert.equal(invitation.status,200);
  const referralToken=new URL(invitation.body.referralUrl).searchParams.get('ref');assert.ok(referralToken);
  const referred=await mk('buyer',undefined,referralToken);
  assert.ok((await call('GET','/referrals',undefined,agent.cookie)).body.referrals.some(r=>r.referredUserId===referred.id));
  const buyer=await mk('buyer'),seller=await mk('seller'),stranger=await mk('buyer');
  const product = (await pool.query("insert into products(name) values('QA Sugar') returning id")).rows[0].id;

  // 1 submissions
  const rq = await call("POST", "/buyer-requests", { product_id: product, quantity: 100, unit: "MT", destination: "Dubai", target_price: 520, currency: "USD" }, buyer.cookie);
  const of = await call("POST", "/seller-listings", { product_id: product, quantity: 150, unit: "MT", price: 500, currency: "USD", origin_country: "India" }, seller.cookie);
  const secondOffer=await call('POST','/seller-listings',{product_id:product,quantity:200,unit:'kg',price:9,currency:'AED',origin_country:'AE'},seller.cookie);
  assert.equal(secondOffer.status,201);assert.notEqual(secondOffer.body.listing.id,of.body.listing.id);
  assert.equal(Number(secondOffer.body.listing.price),9);assert.equal(secondOffer.body.listing.currency,'AED');
  pass('seller has distinct offers with independent units, currencies and prices');
  assert.equal(rq.status, 201, JSON.stringify(rq.body)); assert.equal(of.status, 201, JSON.stringify(of.body));
  const reqId = rq.body.requirement.id, offId = of.body.listing.id;
  assert.equal((await call("GET", "/admin/buyer-requests", undefined, buyer.cookie)).status, 403, "admin queue is admin only");
  assert.equal((await call("GET", "/admin/buyer-requests", undefined, admin.cookie)).body.requirements.length, 1);
  pass("buyer requirement and seller offer land in the admin review queue; the queue is admin-only");

  // 2 matching: only approved records, then recommendations and match
  assert.equal((await call("POST", "/admin/matches", { buyerRequestId: reqId, sellerListingId: offId }, admin.cookie)).status, 409, "unapproved records cannot be matched");
  assert.equal((await call("PATCH", `/admin/buyer-requests/${reqId}/status`, { status: "approved" }, admin.cookie)).status, 200);
  assert.equal((await call("PATCH", `/admin/seller-offers/${offId}/status`, { status: "approved" }, admin.cookie)).status, 200);
  const cand = await call("GET", "/admin/match-candidates", undefined, admin.cookie);
  assert.equal(cand.body.buyerRequests.length, 1); assert.equal(cand.body.sellerOffers.length, 1);
  const rec = await call("GET", `/admin/buyer-requests/${reqId}/match-recommendations`, undefined, admin.cookie);
  assert.equal(rec.status, 200, JSON.stringify(rec.body).slice(0, 300));
  const company=(await pool.query('select id from companies where owner_user_id=$1',[buyer.id])).rows[0].id;
  const proof=(await pool.query('select id from company_verification_documents where company_id=$1',[company])).rows[0].id;
  assert.equal((await call('PATCH',`/admin/company-verification-documents/${proof}/status`,{status:'rejected',reviewNote:'Fictional failed verification'},admin.cookie)).status,200);
  assert.equal((await call('POST','/admin/matches',{buyerRequestId:reqId,sellerListingId:offId},admin.cookie)).status,409,'rejected company evidence cannot be matched');
  assert.equal((await call('PATCH',`/admin/company-verification-documents/${proof}/status`,{status:'approved'},admin.cookie)).status,200);
  assert.equal((await call('PATCH',`/admin/companies/${company}/verification`,{verification_status:'verified'},admin.cookie)).status,200);
  assert.equal((await call('PATCH',`/admin/users/${buyer.id}/verification`,{status:'verified'},admin.cookie)).status,200);
  const m = await call("POST", "/admin/matches", { buyerRequestId: reqId, sellerListingId: offId }, admin.cookie);
  assert.equal(m.status, 201, JSON.stringify(m.body)); const matchId = m.body.match.id;
  assert.equal((await call("POST", "/admin/matches", { buyerRequestId: reqId, sellerListingId: offId }, admin.cookie)).status, 409, "no duplicate match");
  assert.equal((await pool.query("select count(*)::int n from notifications where type='match_created'")).rows[0].n, 2, "buyer and seller are told");
  pass("approval gate, match recommendations, match created once, both parties notified");

  // 3 deal
  const dl = await call("POST", "/admin/deals", { matchId, quantity: 100, agreedPrice: 505 }, admin.cookie);
  assert.equal(dl.status, 201, JSON.stringify(dl.body)); const dealId = dl.body.deal.id;
  assert.equal((await call("POST", "/admin/deals", { matchId, quantity: 100, agreedPrice: 505 }, admin.cookie)).status, 409, "one deal per match");
  assert.equal((await call("GET", `/deals/${dealId}`, undefined, stranger.cookie)).status, 404, "unrelated buyer cannot see the deal");
  assert.equal((await call("GET", `/deals/${dealId}`, undefined, buyer.cookie)).status, 200);
  pass("deal created from the approved match once; participants only");

  // Separate reduced buyer draft -> human review -> fresh seller terms -> exact
  // buyer agreement -> distinct deal. All transport stays in the local sink.
  process.env.UDC_APP_ENV='staging';process.env.AKIF_WHATSAPP_REPLY_SINK='store';await pool.query("update deals set status='negotiation' where id=$1",[dealId]);await pool.query("update users set phone='15550001111' where id=$1",[buyer.id]);
  const reduced=await Promise.all([app.prepareTrialOrder(buyer.id,dealId,'20','MT'),app.prepareTrialOrder(buyer.id,dealId,'20','MT')]);assert.equal(reduced[0].requirementId,reduced[1].requirementId);const reducedId=reduced[0].requirementId;assert.ok(reducedId);const reducedRow=(await pool.query('select * from buyer_requests where id=$1',[reducedId])).rows[0];assert.equal(reducedRow.status,'pending_admin_review');assert.equal(reducedRow.target_price,null);assert.equal(reducedRow.quantity,'20.000000');
  const fresh=await call('POST','/seller-listings',{product_id:product,quantity:100,unit:'MT',price:499,currency:'USD',origin_country:'India',incoterm:'CIF',destination:'Dubai'},seller.cookie);assert.equal(fresh.status,201,JSON.stringify(fresh.body));const freshId=fresh.body.listing.id;
  assert.equal((await call('PATCH',`/admin/buyer-requests/${reducedId}/status`,{status:'approved'},admin.cookie)).status,200);assert.equal((await call('PATCH',`/admin/seller-offers/${freshId}/status`,{status:'approved'},admin.cookie)).status,200);
  const reducedMatch=await call('POST','/admin/matches',{buyerRequestId:reducedId,sellerListingId:freshId},admin.cookie);assert.equal(reducedMatch.status,201,JSON.stringify(reducedMatch.body));const reducedMatchId=reducedMatch.body.match.id,reducedDealTerms={matchId:reducedMatchId,quantity:20,agreedPrice:499};
  const trialReview=await call('POST',`/admin/matches/${reducedMatchId}/terms-review`,{},admin.cookie);assert.equal(trialReview.status,200,JSON.stringify(trialReview.body));assert.equal((await call('POST','/admin/deals',reducedDealTerms,admin.cookie)).body.error,'explicit_buyer_terms_agreement_required');await app.respondToTerms('15550009999',trialReview.body.proposalId,true);assert.equal((await pool.query("select count(*)::int n from audit_logs where action='match_terms_accepted' and entity_id=$1",[trialReview.body.proposalId])).rows[0].n,0);
  await pool.query('update seller_listings set price=498 where id=$1',[freshId]);await app.respondToTerms('15550001111',trialReview.body.proposalId,true);assert.equal((await pool.query("select count(*)::int n from audit_logs where action='match_terms_accepted' and entity_id=$1",[trialReview.body.proposalId])).rows[0].n,0,'changed price invalidates shown proposal');await pool.query('update seller_listings set price=499 where id=$1',[freshId]);await app.respondToTerms('15550001111',trialReview.body.proposalId,true);await app.respondToTerms('15550001111',trialReview.body.proposalId,true);assert.equal((await pool.query("select count(*)::int n from audit_logs where action='match_terms_accepted' and entity_id=$1",[trialReview.body.proposalId])).rows[0].n,1);
  assert.equal((await call('POST','/admin/deals',{...reducedDealTerms,agreedPrice:498},admin.cookie)).body.error,'deal_differs_from_buyer_accepted_terms');const reducedDeal=await call('POST','/admin/deals',reducedDealTerms,admin.cookie);assert.equal(reducedDeal.status,201,JSON.stringify(reducedDeal.body));assert.notEqual(reducedDeal.body.deal.id,dealId);assert.equal(reducedDeal.body.deal.buyerRequestId,reducedId);assert.equal(reducedDeal.body.deal.sellerListingId,freshId);assert.equal((await pool.query('select quantity::text from deals where id=$1',[dealId])).rows[0].quantity,'100.000000');assert.equal((await pool.query('select count(*)::int n from documents where deal_id=$1',[reducedDeal.body.deal.id])).rows[0].n,0,'old private files not copied');await pool.query("update deals set status='initiated' where id=$1",[dealId]);delete process.env.UDC_APP_ENV;delete process.env.AKIF_WHATSAPP_REPLY_SINK;
  pass('reduced trial draft to human review and fresh seller proposal/direct acceptance-handler/new deal: real SQL/routes, unchanged original deal, no copied documents, local sink only');
  process.env.UDC_APP_ENV='staging';process.env.AKIF_WHATSAPP_REPLY_SINK='store';await pool.query("update deals set status='completed' where id=$1",[dealId]);const repeatRequest=await app.saveTradeAssistRequest({id:buyer.id,role:'buyer'},dealId,'repeat_order');assert.ok(repeatRequest.requestId);const repeated=await Promise.all([app.prepareRestartRequest(repeatRequest.requestId,admin.id),app.prepareRestartRequest(repeatRequest.requestId,admin.id)]);assert.equal(repeated[0].requirementId,repeated[1].requirementId);const repeatId=repeated[0].requirementId;assert.equal((await pool.query('select status from buyer_requests where id=$1',[repeatId])).rows[0].status,'pending_admin_review');await pool.query("update deals set status='initiated' where id=$1",[dealId]);
  assert.equal((await call('PATCH',`/admin/buyer-requests/${repeatId}/status`,{status:'approved'},admin.cookie)).status,200);const repeatMatch=await call('POST','/admin/matches',{buyerRequestId:repeatId,sellerListingId:freshId},admin.cookie);assert.equal(repeatMatch.status,201,JSON.stringify(repeatMatch.body));const repeatTerms={matchId:repeatMatch.body.match.id,quantity:100,agreedPrice:499},repeatReview=await call('POST',`/admin/matches/${repeatTerms.matchId}/terms-review`,{},admin.cookie);assert.equal(repeatReview.status,200,JSON.stringify(repeatReview.body));assert.equal((await call('POST','/admin/deals',repeatTerms,admin.cookie)).body.error,'explicit_buyer_terms_agreement_required');await app.respondToTerms('15550001111',repeatReview.body.proposalId,true);const repeatDeal=await call('POST','/admin/deals',repeatTerms,admin.cookie);assert.equal(repeatDeal.status,201,JSON.stringify(repeatDeal.body));assert.notEqual(repeatDeal.body.deal.id,dealId);assert.notEqual(repeatDeal.body.deal.id,reducedDeal.body.deal.id);assert.equal(repeatDeal.body.deal.buyerRequestId,repeatId);assert.equal((await pool.query('select count(*)::int n from documents where deal_id=$1',[repeatDeal.body.deal.id])).rows[0].n,0);delete process.env.UDC_APP_ENV;delete process.env.AKIF_WHATSAPP_REPLY_SINK;
  pass('repeat request to deduplicated pending requirement/human review/fresh proposal/acceptance/new deal: actual isolated SQL/routes, same seller fresh listing, no original private records copied');
  const alternateSeller=await mk('seller');const alternative=await call('POST','/seller-listings',{product_id:product,quantity:200,unit:'MT',price:497,currency:'USD',origin_country:'India',incoterm:'CIF',destination:'Dubai'},alternateSeller.cookie);assert.equal(alternative.status,201,JSON.stringify(alternative.body));assert.equal((await call('PATCH',`/admin/seller-offers/${alternative.body.listing.id}/status`,{status:'approved'},admin.cookie)).status,200);
  process.env.UDC_APP_ENV='staging';process.env.AKIF_WHATSAPP_REPLY_SINK='store';await pool.query("update deals set status='on_hold' where id=$1",[dealId]);const sentinel=randomUUID();await pool.query("insert into documents(id,deal_id,uploaded_by,document_type,file_url,status) values($1,$2,$3,'invoice','storage://OLD_SELLER_PRIVATE','approved')",[sentinel,dealId,seller.id]);const switchReq=await app.saveTradeAssistRequest({id:buyer.id,role:'buyer'},dealId,'switch_seller');assert.ok(switchReq.requestId);const switched=await app.prepareRestartRequest(switchReq.requestId,admin.id);assert.ok(switched.requirementId);assert.equal((await call('PATCH',`/admin/buyer-requests/${switched.requirementId}/status`,{status:'approved'},admin.cookie)).status,200);
  const switchMatch=await call('POST','/admin/matches',{buyerRequestId:switched.requirementId,sellerListingId:alternative.body.listing.id},admin.cookie);assert.equal(switchMatch.status,201,JSON.stringify(switchMatch.body));const switchTerms={matchId:switchMatch.body.match.id,quantity:100,agreedPrice:497},switchReview=await call('POST',`/admin/matches/${switchTerms.matchId}/terms-review`,{},admin.cookie);assert.equal(switchReview.status,200,JSON.stringify(switchReview.body));assert.equal((await call('POST','/admin/deals',switchTerms,admin.cookie)).body.error,'explicit_buyer_terms_agreement_required');await app.respondToTerms('15550001111',switchReview.body.proposalId,true);const switchedDeal=await call('POST','/admin/deals',switchTerms,admin.cookie);assert.equal(switchedDeal.status,201,JSON.stringify(switchedDeal.body));assert.equal(switchedDeal.body.deal.sellerUserId,alternateSeller.id);assert.notEqual(switchedDeal.body.deal.sellerUserId,seller.id);assert.equal((await pool.query('select seller_user_id from deals where id=$1',[dealId])).rows[0].seller_user_id,seller.id);assert.equal((await pool.query('select deal_id from documents where id=$1',[sentinel])).rows[0].deal_id,dealId);assert.equal((await pool.query('select count(*)::int n from documents where deal_id=$1',[switchedDeal.body.deal.id])).rows[0].n,0);assert.equal((await call('GET',`/deals/${dealId}`,undefined,alternateSeller.cookie)).status,404);assert.equal((await call('GET',`/deals/${switchedDeal.body.deal.id}`,undefined,seller.cookie)).status,404);await pool.query('delete from documents where id=$1',[sentinel]);await pool.query("update deals set status='initiated' where id=$1",[dealId]);delete process.env.UDC_APP_ENV;delete process.env.AKIF_WHATSAPP_REPLY_SINK;
  pass('seller-switch request through human review/fresh alternate seller/exact agreement/separate deal with old-seller file retained and both sellers denied opposite-deal access; direct acceptance handler, local sink only');



  // 4 agent and referral
  assert.equal((await call("POST", `/admin/deals/${dealId}/agents`, { userId: agent.id, commissionSharePct: 50 }, admin.cookie)).status, 201);
  assert.equal((await call("GET", `/deals/${dealId}`, undefined, agent.cookie)).status, 403);
  const ad = await call("GET", "/agent/deals", undefined, agent.cookie);
  assert.equal(ad.status, 200); assert.ok(!/(?<![0-9a-f-])505(?![0-9a-f-])/i.test(JSON.stringify(ad.body)));
  const ref = await call("POST", "/admin/referrals", { agentUserId: agent.id, referredUserId: buyer.id, referralCode: "QA-REF-1" }, admin.cookie);
  assert.equal(ref.status, 201, JSON.stringify(ref.body));
  assert.equal(ref.body.referral.status, "pending");
  assert.equal((await pool.query("select count(*)::int n from commissions")).rows[0].n, 0, "a referral never creates a commission by itself");
  assert.equal((await call("PATCH", `/admin/referrals/${ref.body.referral.id}/status`, { status: "qualified" }, admin.cookie)).status, 200);
  assert.equal((await pool.query("select count(*)::int n from commissions")).rows[0].n, 0, "qualifying a referral still creates no commission");
  assert.equal((await call("POST", "/admin/referrals", { agentUserId: buyer.id, referredUserId: seller.id, referralCode: "QA-REF-2" }, admin.cookie)).status, 409, "only agents can refer");
  pass("agent assigned without price access; referral pending then qualified by admin; no automatic commission; non-agents cannot refer");

  // 5 shipment tracking
  const sh = await call("POST", "/admin/shipments", { dealId, carrier: "QA Lines", trackingNumber: "QA123456", origin: "Mundra", destination: "Jebel Ali" }, admin.cookie);
  assert.equal(sh.status, 201, JSON.stringify(sh.body)); const shId = sh.body.shipment.id;
  const key = randomUUID();
  const ev = { idempotencyKey: key, kind: "departed", occurredAt: new Date(Date.now() - 3600_000).toISOString(), location: "Mundra port", note: "Vessel left berth" };
  assert.equal((await call("POST", `/admin/shipments/${shId}/events`, ev, admin.cookie)).status, 201);
  const again = await call("POST", `/admin/shipments/${shId}/events`, ev, admin.cookie);
  assert.ok([200, 201].includes(again.status), "same key + same content replays safely: " + again.status);
  assert.equal((await call("POST", `/admin/shipments/${shId}/events`, { ...ev, note: "Different note" }, admin.cookie)).status, 409, "same key, different content is refused");
  assert.equal((await call("POST", `/admin/shipments/${shId}/events`, { ...ev, idempotencyKey: randomUUID(), occurredAt: new Date(Date.now() + 86400_000).toISOString() }, admin.cookie)).status, 400, "future milestone refused");
  assert.equal((await call("POST", `/admin/shipments/${shId}/events`, { ...ev, idempotencyKey: randomUUID(), source: "carrier_reported" }, admin.cookie)).status, 400, "carrier source needs a reference");
  assert.equal((await pool.query("select count(*)::int n from shipment_tracking_events where shipment_id=$1 and kind=$2", [shId, "departed"])).rows[0].n, 1, "replay did not duplicate");
  const tr = await call("GET", `/deals/${dealId}/tracking`, undefined, buyer.cookie);
  assert.equal(tr.status, 200, JSON.stringify(tr.body).slice(0, 200));
  assert.ok(JSON.stringify(tr.body).includes("Mundra port"));
  assert.equal((await call("GET", `/deals/${dealId}/tracking`, undefined, stranger.cookie)).status, 404);
  assert.equal((await call("GET", `/deals/${dealId}/tracking`, undefined, seller.cookie)).status, 200);
  assert.equal((await call("PATCH", `/admin/shipments/${shId}`, { status: "in_transit" }, admin.cookie)).status, 200);
  const agentTr = await call("GET", `/deals/${dealId}/tracking`, undefined, agent.cookie);
  assert.ok(!/(?<![0-9a-f-])505(?![0-9a-f-])/i.test(JSON.stringify(agentTr.body)), "tracking shows the agent no price");
  pass("shipment created, milestone replay-safe and conflict-checked, future/unsourced milestones refused, tracking visible to the deal's buyer and seller only, no price to the agent");

  // 6 commission recorded by admin for the agent; each user sees only their own
  assert.equal((await call("POST", "/admin/commissions", { dealId, beneficiaryUserId: agent.id, amount: 252.5, currency: "USD" }, buyer.cookie)).status, 403);
  const cm = await call("POST", "/admin/commissions", { dealId, beneficiaryUserId: agent.id, amount: 252.5, currency: "USD" }, admin.cookie);
  assert.equal(cm.status, 201, JSON.stringify(cm.body));
  const mineA = await call("GET", "/commissions", undefined, agent.cookie);
  assert.equal(mineA.body.commissions.length, 1); assert.equal(Number(mineA.body.commissions[0].amount), 252.5);
  assert.equal((await call("GET", "/commissions", undefined, buyer.cookie)).body.commissions.length, 0, "the buyer sees no commissions");
  assert.equal((await call("GET", "/commissions", undefined, seller.cookie)).body.commissions.length, 0, "the seller sees no commissions");
  pass("only an admin records a commission; the agent sees their own, buyer and seller see none");
  // 7 trade documents
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("synthetic".repeat(20))]);
  const up = async (cookie, type, bytes = pdf, ct = "application/pdf") => {
    const r = await fetch(`${origin}/deals/${dealId}/documents/upload?documentType=${type}`, { method: "POST", headers: { "Content-Type": ct, ...(cookie ? { cookie } : {}) }, body: bytes });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const inv = await up(buyer.cookie, "invoice");
  assert.equal(inv.status, 201, JSON.stringify(inv.body)); assert.equal(inv.body.document.status, "pending");
  assert.equal((await up(buyer.cookie, "invoice", Buffer.from("MZ not a pdf at all"), "application/pdf")).status, 400, "only real PDFs");
  assert.equal((await up(buyer.cookie, "selfie")).status, 400, "unknown document type refused");
  assert.equal((await up(stranger.cookie, "invoice")).status, 404, "unrelated buyer cannot upload to this deal");
  assert.equal((await up(agent.cookie, "invoice")).status, 403, "agents cannot upload deal documents");
  assert.equal((await call("GET", `/deals/${dealId}/documents`, undefined, seller.cookie)).body.documents.length, 0, "a pending file is private to its uploader");
  const mineDocs = await call("GET", `/deals/${dealId}/documents`, undefined, buyer.cookie);
  assert.equal(mineDocs.body.documents.length, 1); assert.ok(mineDocs.body.documents[0].fileUrl.startsWith("https://signed."));
  assert.equal((await call("PATCH", `/admin/documents/${inv.body.document.id}/status`, { status: "approved" }, buyer.cookie)).status, 403);
  assert.equal((await call("PATCH", `/admin/documents/${inv.body.document.id}/status`, { status: "rejected" }, admin.cookie)).status, 400, "a rejection needs a reason");
  assert.equal((await call("PATCH", `/admin/documents/${inv.body.document.id}/status`, { status: "approved" }, admin.cookie)).status, 200);
  assert.equal((await call("GET", `/deals/${dealId}/documents`, undefined, seller.cookie)).body.documents.length, 1, "approved file becomes visible to the counterparty");
  const bad = await up(seller.cookie, "packing_list");
  assert.equal((await call("PATCH", `/admin/documents/${bad.body.document.id}/status`, { status: "rejected", reviewNote: "Illegible scan" }, admin.cookie)).status, 200);
  const rej = (await call("GET", `/deals/${dealId}/documents`, undefined, seller.cookie)).body.documents.find((d) => d.id === bad.body.document.id);
  assert.equal(rej.fileUrl, null, "rejected files are not downloadable");
  assert.equal((await pool.query("select count(*)::int n from notifications where user_id=$1 and type='document_reviewed'", [seller.id])).rows[0].n >= 1, true, "uploader told why");
  pass("trade documents: PDF-only upload, private until approved, admin review with mandatory rejection reason, rejected files not downloadable, uploader notified");
  // 8 document generators (LOI, ICPO, FCO, SPA, NCNDA): drafts for review only
  const kinds = ["ncnda", "spa", "loi", "icpo", "fco"];
  const out = {};
  for (const k of kinds) {
    assert.equal((await call("POST", `/deals/${dealId}/${k}-draft`, {}, buyer.cookie)).status, 400, `${k}: needs explicit terms confirmation`);
    assert.equal((await call("POST", `/deals/${dealId}/${k}-draft`, { confirmTerms: true }, stranger.cookie)).status, 404, `${k}: unrelated user`);
    assert.equal((await call("POST", `/deals/${dealId}/${k}-draft`, { confirmTerms: true }, agent.cookie)).status, 403, `${k}: agent`);
    assert.equal((await call("POST", `/deals/${dealId}/${k}-draft`, { confirmTerms: true })).status, 401, `${k}: anonymous`);
    const owner = k === "fco" ? seller : buyer, other = k === "fco" ? buyer : seller;
    if (k === "loi" || k === "icpo" || k === "fco") assert.equal((await call("POST", `/deals/${dealId}/${k}-draft`, { confirmTerms: true }, other.cookie)).status, 404, `${k}: the other party cannot generate it (LOI/ICPO are buyer documents, FCO is a seller document)`);
    const r = await call("POST", `/deals/${dealId}/${k}-draft`, { confirmTerms: true }, owner.cookie);
    out[k] = [r.status, r.body.status, JSON.stringify(r.body.draft ?? "").length];
  }
  console.log("DRAFT-STATUS", JSON.stringify(out));
  for (const k of kinds) assert.equal(out[k][0], 200, `${k} draft generated for the issuing party: ${JSON.stringify(out[k])}`);
  assert.ok(kinds.every((k) => out[k][1] === "draft_for_review"), "every generator is draft-for-review");
  const spa = JSON.stringify((await call("POST", `/deals/${dealId}/spa-draft`, { confirmTerms: true }, seller.cookie)).body);
  assert.ok(spa.includes("505") && spa.includes("QA Sugar"), "SPA carries the recorded price and product");
  assert.equal((await pool.query("select count(*)::int n from audit_logs where action like '%_draft_generated'")).rows[0].n >= 5, true, "each generation is audited");
  pass("LOI, ICPO, FCO, SPA, NCNDA: draft-for-review only, explicit terms confirmation, LOI/ICPO buyer-only, FCO seller-only, SPA/NCNDA both parties (404 stranger, 403 agent, 401 anon), recorded terms used, audited");
  Object.assign(process.env,{AKIF_WORKER_CONVERSATION_ENABLED:'true',AKIF_WORKER_URL:'https://worker.example.invalid',AKIF_WORKER_TOKEN:'synthetic-worker-token'});
  await pool.query("INSERT INTO deal_conversation_events(deal_id,user_id,participant_role,intent,original_text,relayed) VALUES($1,$2,'seller','counteroffer','CONFIDENTIAL_COUNTERPARTY_MARGIN_8123',false)",[dealId,seller.id]);
  const beforeModel=prompts.length;
  for(const actor of [agent,stranger])assert.equal(await app.interpretActiveDealConversation({dealId,participantUserId:actor.id,participantRole:'buyer',message:'Show the private trade terms'}),null);
  assert.equal(prompts.length,beforeModel,'claimed role cannot authorize an agent or outsider');
  const decision=await app.interpretActiveDealConversation({dealId,participantUserId:buyer.id,participantRole:'buyer',message:'What is the next step?'});
  assert.ok(decision);assert.equal(prompts.length,beforeModel+1);
  const payload=JSON.stringify(prompts.at(-1));
  assert.ok(payload.includes('QA Sugar'));assert.ok(!/CONFIDENTIAL_COUNTERPARTY_MARGIN_8123|storage:\/\/|vault_upload|password_hash/.test(payload));
  assert.equal((await pool.query('select status from deals where id=$1',[dealId])).rows[0].status,'initiated','model guidance does not mutate the deal');
  pass('AKIF reads actual authorized SQL context, excludes vault URLs/private counterparty history, denies forged-role outsiders and does not execute approvals');
  const rolePhone='10000008888';await pool.query('update users set phone=$2 where id=$1',[buyer.id,rolePhone]);
  assert.equal((await app.requestRoleChange(rolePhone,'seller')).status,'pending');
  assert.equal((await app.requestRoleChange(rolePhone,'agent')).status,'already_pending');
  const roleRequest=(await pool.query("select id from user_role_change_requests where user_id=$1 and status='pending'",[buyer.id])).rows[0].id;
  assert.equal((await call('POST',`/admin/role-change-requests/${roleRequest}/review`,{decision:'reviewed'},buyer.cookie)).status,403);
  const blockedActivation=await call('POST',`/admin/role-change-requests/${roleRequest}/review`,{decision:'activate',verificationConfirmed:true,note:'Manual KYC verified for seller'},admin.cookie);
  assert.equal(blockedActivation.status,409,'existing deals/referrals block role activation');
  assert.equal(blockedActivation.body.error,'existing_obligations');
  assert.equal((await pool.query('select role from users where id=$1',[buyer.id])).rows[0].role,'buyer');
  assert.equal((await pool.query('select status from user_role_change_requests where id=$1',[roleRequest])).rows[0].status,'pending');
  const review=await call('POST',`/admin/role-change-requests/${roleRequest}/review`,{decision:'reviewed'},admin.cookie);
  assert.equal(review.status,200);assert.equal(review.body.roleChanged,false);
  assert.equal((await pool.query('select role from users where id=$1',[buyer.id])).rows[0].role,'buyer');
  pass('role-change request is duplicate-safe and audited; admin review never grants a second role or rewrites deal ownership');
  const switchCandidate=await mk('buyer');
  const switchPhone='10000009997';
  await pool.query('update users set phone=$2 where id=$1',[switchCandidate.id,switchPhone]);
  assert.equal((await app.requestRoleChange(switchPhone,'seller')).status,'pending');
  const freshRequest=(await pool.query("select id from user_role_change_requests where user_id=$1 and status='pending'",[switchCandidate.id])).rows[0].id;
  assert.equal((await call('POST',`/admin/role-change-requests/${freshRequest}/review`,{decision:'activate',verificationConfirmed:true,note:'Verified seller KYC and permission scope'},switchCandidate.cookie)).status,403);
  assert.equal((await call('POST',`/admin/role-change-requests/${freshRequest}/review`,{decision:'activate'},admin.cookie)).status,409);
  await pool.query("insert into whatsapp_intake_drafts(phone,role,draft) values($1,'buyer','{}'::jsonb)",[switchPhone]);
  // Settled history is not a lifetime role lock. All attribution remains byte-for-byte.
  const historicalDeal=(await pool.query(`insert into deals(buyer_user_id,seller_user_id,product_id,quantity,unit,agreed_price,currency,status)
    values($1,$2,$3,1,'MT',505,'USD','completed') returning id`,[switchCandidate.id,seller.id,product])).rows[0].id;
  const historicalRequest=(await pool.query(`insert into buyer_requests(buyer_user_id,product_id,quantity,unit,destination,status)
    values($1,$2,1,'MT','Fictional destination','converted') returning id`,[switchCandidate.id,product])).rows[0].id;
  const historicalListing=(await pool.query(`insert into seller_listings(seller_user_id,product_id,quantity,unit,price,currency,status)
    values($1,$2,1,'MT',505,'USD','sold') returning id`,[switchCandidate.id,product])).rows[0].id;
  const historicalReferral=(await pool.query(`insert into referrals(agent_user_id,referred_user_id,referral_code,status)
    values($1,$2,'QA-HISTORY','paid') returning id`,[agent.id,switchCandidate.id])).rows[0].id;
  const historicalCommission=(await pool.query(`insert into commissions(deal_id,beneficiary_user_id,amount,currency,status)
    values($1,$2,20,'USD','paid') returning id`,[historicalDeal,agent.id])).rows[0].id;
  const history=async()=>JSON.stringify((await pool.query(`select row_to_json(d) d,row_to_json(r) r,row_to_json(l) l,row_to_json(f) f,row_to_json(c) c
    from deals d,buyer_requests r,seller_listings l,referrals f,commissions c where d.id=$1 and r.id=$2 and l.id=$3 and f.id=$4 and c.id=$5`,
    [historicalDeal,historicalRequest,historicalListing,historicalReferral,historicalCommission])).rows);
  const beforeHistory=await history();
  const attemptSwitch=()=>call('POST',`/admin/role-change-requests/${freshRequest}/review`,{decision:'activate',verificationConfirmed:true,note:'Verified seller KYC and permission scope'},admin.cookie);
  for(const [table,id,column,active,settled] of [
    ['deals',historicalDeal,'status','on_hold','completed'],
    ['buyer_requests',historicalRequest,'status','open','converted'],
    ['seller_listings',historicalListing,'status','paused','sold'],
    ['referrals',historicalReferral,'status','pending','paid'],
    ['referrals',historicalReferral,'status','qualified','paid'],
    ['commissions',historicalCommission,'status','approved','paid']]){
    await pool.query(`update ${table} set ${column}=$2 where id=$1`,[id,active]);
    const blocked=await attemptSwitch();assert.equal(blocked.status,409,table+' active obligation blocks');
    assert.equal(blocked.body.error,'existing_obligations');
    assert.equal((await pool.query('select role from users where id=$1',[switchCandidate.id])).rows[0].role,'buyer');
    await pool.query(`update ${table} set ${column}=$2 where id=$1`,[id,settled]);
  }
  const activated=await call('POST',`/admin/role-change-requests/${freshRequest}/review`,{decision:'activate',verificationConfirmed:true,note:'Verified seller KYC and permission scope'},admin.cookie);
  assert.equal(activated.status,200,JSON.stringify(activated.body));assert.equal(activated.body.roleChanged,true);
  assert.equal(await history(),beforeHistory,'settled deals, requests, listings, referrals and commission attribution unchanged');
  assert.equal((await pool.query('select role from users where id=$1',[switchCandidate.id])).rows[0].role,'seller');
  assert.equal((await pool.query('select count(*)::int n from whatsapp_intake_drafts where phone=$1',[switchPhone])).rows[0].n,0,'half-finished buyer intake is dropped');
  const audited=(await pool.query("select metadata from audit_logs where action='role_change_activated' and entity_id=$1",[switchCandidate.id])).rows;
  assert.equal(audited.length,1);assert.equal(audited[0].metadata.fromRole,'buyer');assert.equal(audited[0].metadata.toRole,'seller');assert.equal(audited[0].metadata.historyPreserved,true);
  assert.equal((await pool.query("select status from user_role_change_requests where id=$1",[freshRequest])).rows[0].status,'activated');
  assert.equal((await call('GET','/auth/me',undefined,switchCandidate.cookie)).status,401,'old role session revoked');
  assert.equal((await call('POST',`/admin/role-change-requests/${freshRequest}/review`,{decision:'activate',verificationConfirmed:true,note:'Duplicate should fail closed'},admin.cookie)).status,409);
  const relogin=await call('POST','/auth/login',{email:switchCandidate.email,password});assert.equal(relogin.status,200);
  assert.equal((await call('POST','/buyer-requests',{product_id:product,quantity:1,unit:'MT'},relogin.cookie)).status,403,'former buyer cannot create buyer request');
  pass('role activation requires admin and evidence, revokes prior sessions, blocks replay and removes former role permissions');
  // More role-switch gates: concurrency, company verification, agent isolation.
  {
    const activate=(rid,cookie=admin.cookie)=>call('POST',`/admin/role-change-requests/${rid}/review`,{decision:'activate',verificationConfirmed:true,note:'Verified target role KYC and scope'},cookie);
    const reqFor=async(user,phone,role)=>{await pool.query('update users set phone=$2 where id=$1',[user.id,phone]);assert.equal((await app.requestRoleChange(phone,role)).status,'pending');return (await pool.query("select id from user_role_change_requests where user_id=$1 and status='pending'",[user.id])).rows[0].id;};
    const racer=await mk('buyer');const racerReq=await reqFor(racer,'10000007771','seller');
    const results=await Promise.all([activate(racerReq),activate(racerReq),activate(racerReq)]);
    const codes=results.map(r=>r.status).sort();
    assert.deepEqual(codes,[200,409,409],'concurrent activations: exactly one wins '+codes);
    assert.equal((await pool.query("select count(*)::int n from audit_logs where action='role_change_activated' and entity_id=$1",[racer.id])).rows[0].n,1);
    const unverified=await mk('buyer');await pool.query("update companies set verification_status='pending' where owner_user_id=$1",[unverified.id]);
    const unverifiedReq=await reqFor(unverified,'10000007772','seller');
    const blocked=await activate(unverifiedReq);assert.equal(blocked.status,409);assert.equal(blocked.body.error,'company_verification_required');
    assert.equal((await pool.query('select role from users where id=$1',[unverified.id])).rows[0].role,'buyer');
    const agentUser=await mk('agent');const agentReq=await reqFor(agentUser,'10000007773','buyer');
    const agentBlocked=await activate(agentReq);assert.equal(agentBlocked.status,409);assert.equal(agentBlocked.body.error,'company_verification_required','an agent has no company, so buyer activation needs the company review first');
    assert.equal((await pool.query('select role from users where id=$1',[agentUser.id])).rows[0].role,'agent');
    assert.equal((await call('GET','/auth/me',undefined,agentUser.cookie)).status,200,'a blocked activation revokes nothing');
    // Live assigned agent obligations were missed by the old buyer/seller-only deal query.
    const assigned=await mk('buyer');const assignedReq=await reqFor(assigned,'10000007774','agent');
    const assignmentDeal=(await pool.query(`insert into deals(buyer_user_id,seller_user_id,product_id,quantity,unit,agreed_price,status)
      values($1,$2,$3,1,'MT',505,'initiated') returning id`,[buyer.id,seller.id,product])).rows[0].id;
    await pool.query(`insert into deal_participants(deal_id,user_id,participant_role,status) values($1,$2,'agent','active')`,[assignmentDeal,assigned.id]);
    const assignedBlock=await activate(assignedReq);assert.equal(assignedBlock.status,409);assert.equal(assignedBlock.body.error,'existing_obligations');
    await pool.query("update deals set status='completed' where id=$1",[assignmentDeal]);
    const switchedAgent=await activate(assignedReq);assert.equal(switchedAgent.status,200);assert.equal(switchedAgent.body.roleChanged,true);
    const agentLogin=await call('POST','/auth/login',{email:assigned.email,password});assert.equal(agentLogin.status,200);
    assert.equal((await call('GET',`/deals/${assignmentDeal}`,undefined,agentLogin.cookie)).status,403,'switching to agent cannot expose confidential deal detail');
    assert.equal((await call('GET','/deals',undefined,agentLogin.cookie)).status,403,'new agent cannot list confidential deals');
    const ownCommission=(await call('GET','/commissions',undefined,agentLogin.cookie));assert.equal(ownCommission.status,200);
    assert.ok(!JSON.stringify(ownCommission.body).includes(historicalCommission),'new agent cannot see another person commission');
    assert.equal((await pool.query('select user_id from deal_participants where deal_id=$1 and user_id=$2',[assignmentDeal,assigned.id])).rows[0].user_id,assigned.id,'agent attribution preserved');
    pass('live assigned-agent deal blocks switching, settled assignment permits switching, new agent cannot access confidential trade routes or other commissions');
    pass('role switching gates: one winner under concurrency, buyer/seller targets need a verified company, a blocked activation changes and revokes nothing, every activation audited');
  }
  const transition=(status,extra={},cookie=admin.cookie)=>call('PATCH',`/admin/deals/${dealId}/status`,{status,...extra},cookie);
  assert.equal((await transition('payment',{confirmDestinationSgs:true},buyer.cookie)).status,403);
  assert.equal((await transition('payment',{confirmDestinationSgs:true})).status,409);
  for(const stage of ['negotiation','verification','loi','icpo','fco_sco','contract','banking'])assert.equal((await transition(stage)).status,200);
  const dlc=await call('POST','/admin/financial-instruments',{dealId,amount:50500,currency:'USD',reference:'FICTIONAL-DLC'},admin.cookie);
  assert.equal(dlc.status,201,JSON.stringify(dlc.body));assert.equal(dlc.body.instrument.instrumentType,'DLC');
  assert.equal((await call('PATCH',`/admin/financial-instruments/${dlc.body.instrument.id}`,{status:'confirmed'},admin.cookie)).status,200);
  assert.equal((await transition('payment',{confirmDestinationSgs:true})).status,409,'DLC alone cannot release payment');
  const inspection=await call('POST','/admin/inspections',{dealId,provider:'SGS',location:'Jebel Ali destination'},admin.cookie);
  assert.equal(inspection.status,201,JSON.stringify(inspection.body));
  assert.equal((await call('PATCH',`/admin/inspections/${inspection.body.inspection.id}`,{status:'passed',resultSummary:'Fictional destination SGS evidence'},admin.cookie)).status,200);
  assert.equal((await transition('payment',{confirmDestinationSgs:true})).status,409,'inspection without approved SGS document is insufficient');
  const sgs=await up(seller.cookie,'SGS');assert.equal(sgs.status,201,JSON.stringify(sgs.body));
  assert.equal((await transition('payment',{confirmDestinationSgs:true})).status,409,'pending SGS is insufficient');
  assert.equal((await call('PATCH',`/admin/documents/${sgs.body.document.id}/status`,{status:'approved'},admin.cookie)).status,200);
  assert.equal((await transition('payment')).status,409,'explicit destination review still required');
  for(const stage of ['inspection','loading','shipment','delivery'])assert.equal((await transition(stage)).status,200);
  assert.equal((await call('PATCH',`/admin/shipments/${shId}`,{status:'delivered'},admin.cookie)).status,200);
  assert.equal((await transition('payment',{confirmDestinationSgs:true})).status,200);
  assert.equal((await call('PATCH',`/admin/commissions/${cm.body.commission.id}/status`,{status:'paid'},admin.cookie)).status,409,'no commission payout record before completion');
  for(const stage of ['commission','completed'])assert.equal((await transition(stage,{confirmDestinationSgs:true})).status,200);
  assert.equal((await call('PATCH',`/admin/commissions/${cm.body.commission.id}/status`,{status:'paid'},admin.cookie)).status,200);
  const paidAudit=(await pool.query("select metadata from audit_logs where entity_id=$1 and action='deal_status_updated' and metadata->>'newStatus'='payment'",[dealId])).rows[0].metadata;
  assert.ok(paidAudit.paymentEvidence.approvedSgsDocumentId);assert.equal(paidAudit.destinationSgsConfirmedByAdmin,true);
  pass('continuous cohort reaches completion only after confirmed DLC, passed inspection, approved SGS and explicit human destination review; records no real payment');
  const cancellable=(await pool.query("insert into deals(buyer_user_id,seller_user_id,product_id,quantity,unit,agreed_price,status) values($1,$2,$3,1,'MT',1,'negotiation') returning id",[buyer.id,seller.id,product])).rows[0].id;
  assert.equal((await call('PATCH',`/admin/deals/${cancellable}/status`,{status:'cancelled'},buyer.cookie)).status,403);
  assert.equal((await call('PATCH',`/admin/deals/${cancellable}/status`,{status:'cancelled'},admin.cookie)).status,200);
  assert.equal((await pool.query('select status from deals where id=$1',[cancellable])).rows[0].status,'cancelled');
  pass('cancellation on a separate fictional active deal is admin-authorized and persisted, not a customer/model action');
  console.log(`PASSED: ${checks} continuous-cohort PostgreSQL lifecycle scenarios (synthetic data, no network).`);
} finally {
  delete globalThis.__lifecycleMail;
  globalThis.fetch = beforeFetch;
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
