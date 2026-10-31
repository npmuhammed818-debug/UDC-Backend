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
      contents: `import express from 'express';import cookieParser from 'cookie-parser';import auth from './src/routes/auth';import marketplace from './src/routes/marketplace';import deals from './src/routes/deals';import documents from './src/routes/documents';import referrals from './src/routes/referrals';import admin from './src/routes/admin';import email from './src/routes/emailAuth';import vault from './src/routes/vault';import commissions from './src/routes/commissions';import notifications from './src/routes/notifications';import {loadAuth} from './src/auth/middleware';export {pool,db} from '@workspace/db';export {hashPassword} from './src/auth/passwords';export {interpretActiveDealConversation} from './src/akif/dealConversationAgent';export {requestRoleChange} from './src/accounts/roleChangeRequest';import roleReview from './src/routes/roleChangeReview';const app=express();app.set('trust proxy','loopback');app.use(express.json());app.use(cookieParser());app.use(loadAuth);app.use(auth);app.use(email);app.use(vault);app.use('/api',vault);app.use(marketplace);app.use(deals);app.use(documents);app.use(referrals);app.use(admin);app.use(commissions);app.use(notifications);app.use(roleReview);export default app;`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
    },
    plugins: [{name:"fictional-mail",setup(b){b.onResolve({filter:/\/emailDelivery$/},()=>({path:"mail",namespace:"mail"}));b.onLoad({filter:/.*/,namespace:"mail"},()=>({contents:"export const sendAuthEmail=async value=>{globalThis.__lifecycleMail.push(value);};"}));}}, { name: "fake-storage", setup(b) { b.onResolve({ filter: /supabase\/storage$/ }, () => ({ path: "fs", namespace: "fake" })); b.onLoad({ filter: /.*/, namespace: "fake" }, () => ({ loader: "js", contents: "export async function uploadDocumentBytes(path){ return 'storage://udc-documents/'+path; } export async function createSignedDownloadUrl(path){ return 'https://signed.example.invalid/'+path; } export async function createSignedUploadUrl(path){ return 'https://signed.example.invalid/up/'+path; } export function storagePath(p){ return 'storage://udc-documents/'+p; } export function parseStoragePath(v){ const m=/^storage:\\/\\/udc-documents\\/(.+)$/.exec(v); return m?m[1]:null; } export async function downloadDocumentBytes(){ throw new Error('no network'); }" })); } }],
    outfile: directory + "/app.mjs", bundle: true, platform: "node", format: "esm", external: ["pg-native"], logLevel: "silent",
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
  const activated=await call('POST',`/admin/role-change-requests/${freshRequest}/review`,{decision:'activate',verificationConfirmed:true,note:'Verified seller KYC and permission scope'},admin.cookie);
  assert.equal(activated.status,200,JSON.stringify(activated.body));assert.equal(activated.body.roleChanged,true);
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
