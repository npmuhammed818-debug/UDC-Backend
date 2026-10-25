// Isolated loopback QA DB only (udc_qa_journey_*), synthetic data, real routes and real SQL.
// Whole trade journey on a real DB: requirement + offer -> admin approval -> match -> deal -> agent + referral -> shipment tracking -> commission.
//   UDC_JOURNEY_QA_DATABASE_URL='postgresql://udc_dev@127.0.0.1:5432/udc_qa_journey_x?sslmode=disable' node .../p0-gates-postgres.mjs
// Schema must exist first: pnpm --filter @workspace/db run push against the same DB.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const url = new URL(process.env.UDC_JOURNEY_QA_DATABASE_URL ?? "http://missing.invalid");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.match(url.pathname, /^\/udc_qa_journey_[a-z0-9_]+$/);
for (const key of Object.keys(process.env))
  if (/^(SUPABASE_|WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_|SESSION_SECRET)/.test(key)) delete process.env[key];
Object.assign(process.env, { SUPABASE_DATABASE_URL: url.href, SESSION_SECRET: randomBytes(32).toString("hex"), NODE_ENV: "test" });
await mkdir(new URL("../../tmp/", import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL("../../tmp/qa-journey-", import.meta.url)));
let server, pool, origin;
const beforeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  assert.equal(new URL(String(input)).origin, origin, "never contact external services");
  return beforeFetch(input, init);
};
try {
  await build({
    stdin: {
      contents: `import express from 'express';import cookieParser from 'cookie-parser';import auth from './src/routes/auth';import marketplace from './src/routes/marketplace';import deals from './src/routes/deals';import documents from './src/routes/documents';import referrals from './src/routes/referrals';import admin from './src/routes/admin';import commissions from './src/routes/commissions';import notifications from './src/routes/notifications';import {loadAuth} from './src/auth/middleware';export {pool,db} from '@workspace/db';export {hashPassword} from './src/auth/passwords';const app=express();app.set('trust proxy','loopback');app.use(express.json());app.use(cookieParser());app.use(loadAuth);app.use(auth);app.use(marketplace);app.use(deals);app.use(documents);app.use(referrals);app.use(admin);app.use(commissions);app.use(notifications);export default app;`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
    },
    plugins: [{ name: "fake-storage", setup(b) { b.onResolve({ filter: /supabase\/storage$/ }, () => ({ path: "fs", namespace: "fake" })); b.onLoad({ filter: /.*/, namespace: "fake" }, () => ({ loader: "js", contents: "export async function uploadDocumentBytes(path){ return 'storage://udc-documents/'+path; } export async function createSignedDownloadUrl(path){ return 'https://signed.example.invalid/'+path; } export async function createSignedUploadUrl(path){ return 'https://signed.example.invalid/up/'+path; } export function storagePath(p){ return 'storage://udc-documents/'+p; } export function parseStoragePath(v){ const m=/^storage:\\/\\/udc-documents\\/(.+)$/.exec(v); return m?m[1]:null; } export async function downloadDocumentBytes(){ throw new Error('no network'); }" })); } }],
    outfile: directory + "/app.mjs", bundle: true, platform: "node", format: "esm", external: ["pg-native"], logLevel: "silent",
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
  });
  const app = await import(directory + "/app.mjs");
  pool = app.pool;
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
  const mk = async (role, status) => {
    const email = `${role}-${status}-${randomUUID().slice(0, 6)}@example.invalid`;
    const id = (await pool.query("insert into users(email,password_hash,role,status,full_name) values($1,$2,$3,$4,$5) returning id", [email, hash, role, status, `QA ${role}`])).rows[0].id;
    const login = await call("POST", "/auth/login", { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return { id, cookie: login.cookie };
  };


  const buyer = await mk("buyer", "verified"), seller = await mk("seller", "verified"), agent = await mk("agent", "verified");
  const stranger = await mk("buyer", "verified"), admin = await mk("admin", "active");
  const coOf = {};
  for (const u of [buyer, seller]) coOf[u.id] = (await pool.query("insert into companies(owner_user_id,company_name,country,verification_status) values($1,'QA Co','AE','verified') returning id", [u.id])).rows[0].id;
  const product = (await pool.query("insert into products(name) values('QA Sugar') returning id")).rows[0].id;

  // 1 submissions
  const rq = await call("POST", "/buyer-requests", { product_id: product, quantity: 100, unit: "MT", destination: "Dubai", target_price: 520, currency: "USD" }, buyer.cookie);
  const of = await call("POST", "/seller-listings", { product_id: product, quantity: 150, unit: "MT", price: 500, currency: "USD", origin_country: "India" }, seller.cookie);
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
  assert.equal((await call("POST", "/admin/matches", { buyerRequestId: reqId, sellerListingId: offId }, admin.cookie)).status, 409, "verified companies without an approved document cannot be matched");
  for (const u of [buyer, seller]) await pool.query("insert into company_verification_documents(company_id,uploaded_by,document_type,file_url,status) values($1,$2,'company_registration','memory://x','approved')", [coOf[u.id], u.id]);
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
  assert.equal(ad.status, 200); assert.ok(!JSON.stringify(ad.body).includes("505"));
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
  assert.ok(!JSON.stringify(agentTr.body).includes("505"), "tracking shows the agent no price");
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
  console.log(`PASSED: ${checks} real PostgreSQL trade-journey scenarios (synthetic data, no network).`);
} finally {
  globalThis.fetch = beforeFetch;
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
