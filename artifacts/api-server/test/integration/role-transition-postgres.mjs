// Isolated loopback QA DB only (udc_qa_roletransition_*), synthetic data, real routes and real SQL.
// Regression proof for the role-transition authorization review: a historical agent
// assignment must not become buyer/seller permission after the account changes back.
// Scenario (from the external fix review, verified against the real routes):
//   buyer -> agent -> assigned to a deal -> deal completed -> agent -> buyer,
//   then every generic deal, document, payment, timeline, draft and tracking route
//   must deny the old deal while principals keep full access and current agents
//   keep their redacted milestone view.
//   UDC_ROLETRANSITION_QA_DATABASE_URL='postgresql://udc_dev@127.0.0.1:5432/udc_qa_roletransition_x?sslmode=disable' node .../role-transition-postgres.mjs
// Schema must exist first: pnpm --filter @workspace/db run push against the same DB.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const url = new URL(process.env.UDC_ROLETRANSITION_QA_DATABASE_URL ?? "http://missing.invalid");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.match(url.pathname, /^\/udc_qa_roletransition_[a-z0-9_]+$/);
for (const key of Object.keys(process.env))
  if (/^(SUPABASE_|WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_|SESSION_SECRET)/.test(key)) delete process.env[key];
Object.assign(process.env, { SUPABASE_DATABASE_URL: url.href, SESSION_SECRET: randomBytes(32).toString("hex"), NODE_ENV: "test", WHATSAPP_APP_SECRET: "synthetic-roletransition-secret-32" });
await mkdir(new URL("../../tmp/", import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL("../../tmp/qa-roletransition-", import.meta.url)));
let server, pool, origin;
const beforeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  assert.equal(new URL(String(input)).origin, origin, "never contact external services");
  return beforeFetch(input, init);
};
try {
  await build({
    stdin: {
      contents: `import express from 'express';import cookieParser from 'cookie-parser';import auth from './src/routes/auth';import deals from './src/routes/deals';import documents from './src/routes/documents';import referrals from './src/routes/referrals';import dashboard from './src/routes/dashboard';import roleReview from './src/routes/roleChangeReview';import {loadAuth} from './src/auth/middleware';export {pool,db} from '@workspace/db';export {hashPassword} from './src/auth/passwords';export {requestRoleChange} from './src/accounts/roleChangeRequest';const app=express();app.set('trust proxy','loopback');app.use(express.json());app.use(cookieParser());app.use(loadAuth);app.use(auth);app.use(deals);app.use(documents);app.use(referrals);app.use(dashboard);app.use(roleReview);export default app;`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
    },
    outfile: directory + "/app.mjs", bundle: true, platform: "node", format: "esm", external: ["pg-native", "@resvg/resvg-js"], logLevel: "silent",
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
  });
  const app = await import(directory + "/app.mjs");
  pool = app.pool;
  for (const migration of ['20261024_user_role_change_review.sql', '20261026_role_activation_status.sql'])
    await pool.query(await readFile(new URL('../../../../lib/db/migrations/' + migration, import.meta.url), 'utf8'));
  server = app.default.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  let ip = 1, checks = 0;
  const call = async (method, path, body, cookie = "") => {
    const response = await fetch(origin + path, {
      method,
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `198.21.0.${ip++ % 250}`, ...(cookie ? { cookie } : {}) },
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
    return { id, cookie: login.cookie, email };
  };
  const buyer = await mk("buyer", "verified");
  const seller = await mk("seller", "verified");
  const person = await mk("buyer", "verified"); // starts as a verified buyer, exactly the reviewed scenario
  const admin = await mk("admin", "active");
  await pool.query("update users set phone=$2 where id=$1", [person.id, "15550009999"]);
  await pool.query("insert into companies(owner_user_id,company_name,verification_status) values($1,'QA Person Trading','verified')", [person.id]);
  const product = (await pool.query("insert into products(name) values('QA Role Transition Sugar') returning id")).rows[0].id;
  const PRICE = "777.00";
  const deal = (await pool.query("insert into deals(buyer_user_id,seller_user_id,product_id,quantity,unit,agreed_price,currency) values($1,$2,$3,'100','MT',$4,'USD') returning id", [buyer.id, seller.id, product, PRICE])).rows[0].id;
  const shipment = (await pool.query("insert into shipments(deal_id,carrier,tracking_number,status,origin,destination) values($1,'CONFIDENTIAL_CARRIER_X','CONFIDENTIAL_TRACK_123','in_transit','Mumbai','Dubai') returning id", [deal])).rows[0].id;
  await pool.query("insert into shipment_cargo_units(shipment_id,deal_id,transport_mode,unit_reference,status,vessel_name,bill_of_lading) values($1,$2,'sea','QA-UNIT-1','loaded','CONFIDENTIAL_VESSEL','CONFIDENTIAL_BL_1')", [shipment, deal]);
  await pool.query("insert into shipment_tracking_events(shipment_id,deal_id,kind,idempotency_key,shipment_status,location,note,occurred_at) values($1,$2,'milestone',$3,'in_transit','CONFIDENTIAL_PORT','CONFIDENTIAL_NOTE',now())", [shipment, deal, randomUUID()]);
  const doc = (await pool.query("insert into documents(deal_id,uploaded_by,document_type,file_url,status) values($1,$2,'SPA','storage://udc-documents/deals/qa-role-transition.pdf','approved') returning id", [deal, buyer.id])).rows[0].id;
  // A document grant left over from the person's agent period must not reopen the deal later.
  await pool.query("insert into document_access(document_id,user_id,access_role) values($1,$2,'viewer')", [doc, person.id]);
  const CONFIDENTIAL = ["CONFIDENTIAL_CARRIER_X", "CONFIDENTIAL_TRACK_123", "CONFIDENTIAL_VESSEL", "CONFIDENTIAL_BL_1", "CONFIDENTIAL_PORT", "CONFIDENTIAL_NOTE"];
  const leaked = (body) => {
    const text = JSON.stringify(body);
    return text.includes(`"${PRICE}"`) || CONFIDENTIAL.some((marker) => text.includes(marker));
  };
  const activate = async (targetRole) => {
    assert.equal((await app.requestRoleChange("15550009999", targetRole)).status, "pending");
    const requestId = (await pool.query("select id from user_role_change_requests where user_id=$1 and status='pending'", [person.id])).rows[0].id;
    const review = await call("POST", `/admin/role-change-requests/${requestId}/review`, { decision: "activate", verificationConfirmed: true, note: "Verified target role KYC and scope" }, admin.cookie);
    assert.equal(review.status, 200, JSON.stringify(review.body));
    assert.equal(review.body.roleChanged, true);
  };
  const relogin = async () => {
    const login = await call("POST", "/auth/login", { email: person.email, password });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return login.cookie;
  };

  // Baseline: as an unrelated verified buyer the deal is already invisible.
  assert.equal((await call("GET", `/deals/${deal}`, undefined, person.cookie)).status, 404);
  assert.equal((await call("GET", `/deals/${deal}/tracking`, undefined, person.cookie)).status, 404);
  pass("baseline: unrelated verified buyer cannot see the deal or its tracking");

  // Step 1 of the reviewed scenario: buyer becomes an agent.
  await activate("agent");
  assert.equal((await call("GET", "/auth/me", undefined, person.cookie)).status, 401, "activation revokes the old session");
  const agentCookie = await relogin();
  assert.equal((await call("GET", "/auth/me", undefined, agentCookie)).body.user.role, "agent");

  // Step 2: the agent receives an assigned deal.
  await pool.query("insert into deal_participants(deal_id,user_id,participant_role,status) values($1,$2,'agent','active')", [deal, person.id]);
  for (const [m, p] of [["GET", `/deals/${deal}`], ["GET", "/deals"], ["GET", `/deals/${deal}/documents`], ["GET", `/deals/${deal}/payment-status`]]) {
    const r = await call(m, p, undefined, agentCookie);
    assert.equal(r.status, 403, `${m} ${p} -> ${r.status}`);
    assert.ok(!leaked(r.body), `${m} ${p} leaked confidential data`);
  }
  const agentDeals = await call("GET", "/agent/deals", undefined, agentCookie);
  assert.equal(agentDeals.status, 200);
  assert.ok(JSON.stringify(agentDeals.body).includes(deal), "assigned deal appears in the agent milestone view");
  assert.ok(!leaked(agentDeals.body), "agent milestone view leaks confidential data");
  const agentTracking = await call("GET", `/deals/${deal}/tracking`, undefined, agentCookie);
  assert.equal(agentTracking.status, 200);
  assert.ok(JSON.stringify(agentTracking.body).includes('"in_transit"'), "agent keeps milestone status");
  assert.ok(!leaked(agentTracking.body), "agent tracking view leaks confidential data");
  pass("while an agent: generic deal routes 403, /agent/deals and tracking stay redacted (no price, carrier, vessel, port or notes)");

  // Step 3: the deal is completed. Step 4: the agent changes back to buyer.
  await pool.query("update deals set status='completed' where id=$1", [deal]);
  await activate("buyer"); // settled deal + verified company: activation is legitimate
  const buyerCookie = await relogin();
  assert.equal((await call("GET", "/auth/me", undefined, buyerCookie)).body.user.role, "buyer");

  // Step 5/6: the old deal must be inaccessible, with no confidential field anywhere.
  const denied = [
    ["GET", `/deals/${deal}`], ["GET", `/deals/${deal}/documents`], ["GET", `/deals/${deal}/messages`],
    ["GET", `/deals/${deal}/execution`], ["GET", `/deals/${deal}/payment-status`], ["GET", `/deals/${deal}/timeline`],
    ["GET", `/deals/${deal}/tracking`],
    ["POST", `/deals/${deal}/ncnda-draft`], ["POST", `/deals/${deal}/spa-draft`], ["POST", `/deals/${deal}/loi-draft`],
    ["POST", `/deals/${deal}/icpo-draft`], ["POST", `/deals/${deal}/fco-draft`],
  ];
  for (const [m, p] of denied) {
    const r = await call(m, p, m === "POST" ? { confirmTerms: true } : undefined, buyerCookie);
    assert.equal(r.status, 404, `${m} ${p} -> ${r.status} (historical agent assignment became buyer permission)`);
    assert.ok(!leaked(r.body), `${m} ${p} leaked confidential data`);
  }
  pass("after agent->buyer: every generic deal, document, message, payment, timeline, draft and tracking route denies the old deal (404, nothing leaked)");

  const list = await call("GET", "/deals", undefined, buyerCookie);
  assert.equal(list.status, 200);
  assert.ok(!JSON.stringify(list.body).includes(deal), "old assigned deal reappeared in the buyer deal list");
  const docs = await call("GET", "/documents", undefined, buyerCookie);
  assert.equal(docs.status, 200);
  assert.ok(!JSON.stringify(docs.body).includes(doc), "stale agent-period document grant resurfaced for the reverted buyer");
  assert.equal((await call("GET", "/agent/deals", undefined, buyerCookie)).status, 403, "buyer cannot open the agent milestone view");
  const dash = await call("GET", "/dashboard", undefined, buyerCookie);
  assert.equal(dash.status, 200);
  assert.equal(dash.body.dashboard.activeDeals, 0, "historical assignment still counted on the dashboard");
  pass("after agent->buyer: deal list, document grants, agent view and dashboard carry nothing from the old assignment");

  // Defense in depth: even a stale ACTIVE agent row on a LIVE deal (legacy data) grants nothing to a buyer.
  const liveDeal = (await pool.query("insert into deals(buyer_user_id,seller_user_id,product_id,quantity,unit,agreed_price,currency,status) values($1,$2,$3,'50','MT','888.00','USD','negotiation') returning id", [buyer.id, seller.id, product])).rows[0].id;
  await pool.query("insert into deal_participants(deal_id,user_id,participant_role,status) values($1,$2,'agent','active')", [liveDeal, person.id]);
  for (const p of [`/deals/${liveDeal}`, `/deals/${liveDeal}/tracking`, `/deals/${liveDeal}/documents`, `/deals/${liveDeal}/payment-status`])
    assert.equal((await call("GET", p, undefined, buyerCookie)).status, 404, `${p} reachable through a stale live agent row`);
  assert.equal((await call("GET", "/dashboard", undefined, buyerCookie)).body.dashboard.activeDeals, 0, "stale live assignment counted on the dashboard");
  pass("defense in depth: a stale active agent row on a live deal grants a buyer nothing");

  // A current agent keeps exactly the permitted redacted access on that live deal.
  const agent = await mk("agent", "verified");
  await pool.query("insert into deal_participants(deal_id,user_id,participant_role,status) values($1,$2,'agent','active')", [liveDeal, agent.id]);
  assert.equal((await call("GET", `/deals/${liveDeal}`, undefined, agent.cookie)).status, 403);
  const currentAgentTracking = await call("GET", `/deals/${liveDeal}/tracking`, undefined, agent.cookie);
  assert.equal(currentAgentTracking.status, 200);
  assert.ok(!JSON.stringify(currentAgentTracking.body).includes('"888.00"'));
  assert.equal((await call("GET", "/dashboard", undefined, agent.cookie)).body.dashboard.activeDeals, 1, "current agent assignment missing from the dashboard");
  pass("current agent keeps the redacted milestone view and dashboard count on assigned deals");

  // Principals and admin are untouched by the change.
  const ownDeal = await call("GET", `/deals/${deal}`, undefined, buyer.cookie);
  assert.equal(ownDeal.status, 200);
  assert.ok(JSON.stringify(ownDeal.body).includes(`"${PRICE}"`), "buyer lost their own deal price");
  const ownTracking = await call("GET", `/deals/${deal}/tracking`, undefined, buyer.cookie);
  assert.equal(ownTracking.status, 200);
  assert.ok(JSON.stringify(ownTracking.body).includes("CONFIDENTIAL_CARRIER_X"), "buyer lost full shipment visibility");
  assert.equal((await call("GET", `/deals/${deal}`, undefined, seller.cookie)).status, 200);
  assert.ok(JSON.stringify((await call("GET", "/deals", undefined, admin.cookie)).body).includes(deal), "admin lost the deal");
  pass("buyer, seller and admin keep full access to the completed deal including price and carrier detail");

  console.log(`PASSED: ${checks} real PostgreSQL role-transition scenarios (synthetic data, no network).`);
} finally {
  globalThis.fetch = beforeFetch;
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
