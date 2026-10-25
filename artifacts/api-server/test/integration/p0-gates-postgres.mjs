// Isolated loopback QA DB only (udc_qa_p0gates_*), synthetic data, real routes and real SQL.
// Behavioural proof for P0 #154 (verified-account gate on marketplace writes) and
// P0 #155 (agents blocked from raw deal prices, payments, documents), plus unchanged access for buyer/seller/admin.
//   UDC_P0_QA_DATABASE_URL='postgresql://udc_dev@127.0.0.1:5432/udc_qa_p0gates_x?sslmode=disable' node .../p0-gates-postgres.mjs
// Schema must exist first: pnpm --filter @workspace/db run push against the same DB.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const url = new URL(process.env.UDC_P0_QA_DATABASE_URL ?? "http://missing.invalid");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.match(url.pathname, /^\/udc_qa_p0gates_[a-z0-9_]+$/);
for (const key of Object.keys(process.env))
  if (/^(SUPABASE_|WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_|SESSION_SECRET)/.test(key)) delete process.env[key];
Object.assign(process.env, { SUPABASE_DATABASE_URL: url.href, SESSION_SECRET: randomBytes(32).toString("hex"), NODE_ENV: "test" });
await mkdir(new URL("../../tmp/", import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL("../../tmp/qa-p0-", import.meta.url)));
let server, pool, origin;
const beforeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  assert.equal(new URL(String(input)).origin, origin, "never contact external services");
  return beforeFetch(input, init);
};
try {
  await build({
    stdin: {
      contents: `import express from 'express';import cookieParser from 'cookie-parser';import auth from './src/routes/auth';import marketplace from './src/routes/marketplace';import deals from './src/routes/deals';import documents from './src/routes/documents';import referrals from './src/routes/referrals';import {loadAuth} from './src/auth/middleware';export {pool,db} from '@workspace/db';export {hashPassword} from './src/auth/passwords';const app=express();app.set('trust proxy','loopback');app.use(express.json());app.use(cookieParser());app.use(loadAuth);app.use(auth);app.use(marketplace);app.use(deals);app.use(documents);app.use(referrals);export default app;`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
    },
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
  const buyerPending = await mk("buyer", "pending"), buyerReview = await mk("buyer", "under_review"), buyer = await mk("buyer", "verified");
  const sellerPending = await mk("seller", "pending"), seller = await mk("seller", "verified");
  const agent = await mk("agent", "verified");
  const admin = await mk("admin", "active");
  const product = (await pool.query("insert into products(name) values('QA Sugar') returning id")).rows[0].id;
  const req = { product_id: product, quantity: 100, unit: "MT", destination: "Dubai" };
  const listing = { product_id: product, quantity: 100, unit: "MT", origin: "Mumbai" };

  // #154
  assert.equal((await call("POST", "/buyer-requests", req)).status, 401);
  for (const u of [buyerPending, buyerReview]) assert.equal((await call("POST", "/buyer-requests", req, u.cookie)).status, 403);
  assert.equal((await call("POST", "/seller-listings", listing, sellerPending.cookie)).status, 403);
  assert.equal((await call("POST", "/buyer-requests", req, seller.cookie)).status, 403, "wrong role still denied");
  assert.equal((await pool.query("select count(*)::int n from buyer_requests")).rows[0].n, 0, "nothing was written by denied calls");
  const ok = await call("POST", "/buyer-requests", req, buyer.cookie);
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.requirement.status, "pending_admin_review");
  pass("#154: anonymous 401, pending/under_review buyer and pending seller 403, wrong role 403, no rows written; verified buyer reaches pending_admin_review");

  // #155
  const deal = (await pool.query("insert into deals(buyer_user_id,seller_user_id,product_id,quantity,unit,agreed_price,currency) values($1,$2,$3,'100','MT','777.00','USD') returning id", [buyer.id, seller.id, product])).rows[0].id;
  await pool.query("insert into deal_participants(deal_id,user_id,participant_role,status) values($1,$2,'agent','active')", [deal, agent.id]);
  const denied = [["GET", "/deals"], ["GET", `/deals/${deal}`], ["GET", `/deals/${deal}/payment-status`], ["GET", `/deals/${deal}/timeline`], ["GET", `/deals/${deal}/documents`], ["GET", `/deals/${deal}/messages`], ["GET", `/deals/${deal}/execution`], ["POST", `/deals/${deal}/spa-draft`], ["GET", "/documents"]];
  for (const [m, p] of denied) {
    const r = await call(m, p, m === "POST" ? {} : undefined, agent.cookie);
    assert.equal(r.status, 403, `${m} ${p} -> ${r.status}`);
    assert.ok(!JSON.stringify(r.body).includes("777"), `${m} ${p} leaked price`);
  }
  pass("#155: an assigned verified agent gets 403 with no price on every sensitive generic deal route tested");
  const own = await call("GET", `/deals/${deal}`, undefined, buyer.cookie);
  assert.equal(own.status, 200);
  assert.ok(JSON.stringify(own.body).includes("777"));
  assert.equal((await call("GET", `/deals/${deal}`, undefined, seller.cookie)).status, 200);
  const list = await call("GET", "/deals", undefined, admin.cookie);
  assert.equal(list.status, 200);
  pass("#155: buyer, seller and admin keep their existing access to the deal");
  const agentDeals = await call("GET", "/agent/deals", undefined, agent.cookie);
  assert.equal(agentDeals.status, 200);
  assert.ok(!JSON.stringify(agentDeals.body).includes("777"), "agent milestone view must not expose the agreed price");
  pass("#155: the agent's own /agent/deals milestone view works and carries no agreed price");
  console.log(`PASSED: ${checks} real PostgreSQL P0 gate scenarios (synthetic data, no network).`);
} finally {
  globalThis.fetch = beforeFetch;
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
