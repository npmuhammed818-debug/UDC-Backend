// Isolated loopback QA DB only (udc_qa_pools_*), synthetic data, real routes and real SQL.
// Buyer pool Accept/Decline (owner option A): accept, decline, expiry, privacy, full-acceptance, no instrument change.
//   UDC_POOLS_QA_DATABASE_URL='postgresql://udc_dev@127.0.0.1:5432/udc_qa_pools_x?sslmode=disable' node .../p0-gates-postgres.mjs
// Schema must exist first: pnpm --filter @workspace/db run push against the same DB.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const url = new URL(process.env.UDC_POOLS_QA_DATABASE_URL ?? "http://missing.invalid");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.match(url.pathname, /^\/udc_qa_pools_[a-z0-9_]+$/);
for (const key of Object.keys(process.env))
  if (/^(SUPABASE_|WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_|SESSION_SECRET)/.test(key)) delete process.env[key];
Object.assign(process.env, { SUPABASE_DATABASE_URL: url.href, SESSION_SECRET: randomBytes(32).toString("hex"), NODE_ENV: "test" });
await mkdir(new URL("../../tmp/", import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL("../../tmp/qa-pools-", import.meta.url)));
let server, pool, origin;
const beforeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  assert.equal(new URL(String(input)).origin, origin, "never contact external services");
  return beforeFetch(input, init);
};
try {
  await build({
    stdin: {
      contents: `import express from 'express';import cookieParser from 'cookie-parser';import auth from './src/routes/auth';import buyerPools from './src/routes/buyerPools';import {loadAuth} from './src/auth/middleware';export {pool,db} from '@workspace/db';export {hashPassword} from './src/auth/passwords';const app=express();app.set('trust proxy','loopback');app.use(express.json());app.use(cookieParser());app.use(loadAuth);app.use(auth);app.use(buyerPools);export default app;`,
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


  const b1 = await mk("buyer", "verified"), b2 = await mk("buyer", "verified"), b3 = await mk("buyer", "verified");
  const mkPool = async () => {
    const d = (await pool.query("insert into deals(buyer_user_id,seller_user_id,product_id,quantity,unit,agreed_price,currency) values($1,$2,$3,'100','MT','500.00','USD') returning id", [b1.id, seller.id, product])).rows[0].id;
    const r = await call("POST", `/admin/deals/${d}/buyer-pool`, { targetQuantity: 100, unit: "MT" }, admin.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.pool.id;
  };
  const invite = async (poolId, buyer, qty) => {
    const r = await call("POST", `/admin/buyer-pools/${poolId}/allocations`, { buyerUserId: buyer.id, quantity: qty }, admin.cookie);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body.allocation.id;
  };
  const poolRow = async (id) => (await pool.query("select status, instrument_structure, bank_approval_status from buyer_pools where id=$1", [id])).rows[0];

  // 1 accept: pool only goes ahead when everyone accepted AND the target is filled
  const p1 = await mkPool();
  const a1 = await invite(p1, b1, 60), a2 = await invite(p1, b2, 40);
  assert.equal((await call("POST", `/buyer-pools/invites/${a1}/accept`, {}, b1.cookie)).body.fullyAccepted, false);
  assert.equal((await poolRow(p1)).status, "forming", "one yes is not enough");
  const mine = await call("GET", "/buyer-pools/mine", undefined, b2.cookie);
  assert.ok(mine.body.allocations[0].inviteExpiresAt, "invite expiry shown");
  const last = await call("POST", `/buyer-pools/invites/${a2}/accept`, {}, b2.cookie);
  assert.equal(last.body.fullyAccepted, true);
  const after = await poolRow(p1);
  assert.equal(after.status, "fully_accepted");
  assert.equal(after.bank_approval_status, "not_reviewed", "no bank or instrument state changed");
  assert.equal(after.instrument_structure, "bank_review_required");
  assert.equal((await pool.query("select count(*)::int n from buyer_pool_allocations where instrument_status<>'not_started'")).rows[0].n, 0);
  pass("pool goes ahead only when every invited buyer accepted and the quantity is filled; bank/instrument state untouched");

  // 2 privacy and repeat
  const p2 = await mkPool(); const c1 = await invite(p2, b1, 50);
  assert.equal((await call("POST", `/buyer-pools/invites/${c1}/accept`, {}, b2.cookie)).status, 404, "another buyer cannot answer my invite");
  assert.equal((await call("POST", `/buyer-pools/invites/${c1}/accept`, {})).status, 401);
  assert.equal((await call("POST", `/buyer-pools/invites/${c1}/accept`, {}, seller.cookie)).status, 403);
  assert.equal((await call("POST", `/buyer-pools/invites/not-a-uuid/accept`, {}, b1.cookie)).status, 400);
  assert.equal((await call("POST", `/buyer-pools/invites/${c1}/accept`, {}, b1.cookie)).status, 200);
  assert.equal((await call("POST", `/buyer-pools/invites/${c1}/decline`, {}, b1.cookie)).status, 409, "no flipping after accepting");
  pass("only the invited buyer can answer; anonymous 401, wrong role 403, bad id 400, no second answer");

  // 3 free decline frees the quantity and allows a re-invite
  const p3 = await mkPool(); const d1 = await invite(p3, b3, 100);
  assert.equal((await call("POST", `/admin/buyer-pools/${p3}/allocations`, { buyerUserId: b1.id, quantity: 10 }, admin.cookie)).status, 409, "full while invite is live");
  const dec = await call("POST", `/buyer-pools/invites/${d1}/decline`, {}, b3.cookie);
  assert.equal(dec.status, 200); assert.equal(dec.body.fullyAccepted, false);
  assert.equal((await poolRow(p3)).status, "forming");
  assert.equal((await call("POST", `/admin/buyer-pools/${p3}/allocations`, { buyerUserId: b1.id, quantity: 100 }, admin.cookie)).status, 201, "declined quantity is free again");
  assert.equal((await call("POST", `/buyer-pools/invites/${d1}/accept`, {}, b3.cookie)).status, 409, "declined invite cannot be accepted");
  assert.equal((await call("POST", `/admin/buyer-pools/${p3}/allocations`, { buyerUserId: b3.id, quantity: 0.0001 }, admin.cookie)).status, 409, "pool is full again");
  pass("decline is free, frees the quantity, and a declined invite stays declined");

  // 4 expiry: default 10 days, lazy, no accept after expiry
  const p4 = await mkPool(); const e1 = await invite(p4, b2, 100);
  await pool.query("update buyer_pool_allocations set created_at = now() - interval '9 days 23 hours' where id=$1", [e1]);
  assert.equal((await call("GET", "/buyer-pools/mine", undefined, b2.cookie)).body.allocations.find((a) => a.allocationId === e1).allocationStatus, "invited", "still open at 9d23h");
  await pool.query("update buyer_pool_allocations set created_at = now() - interval '10 days 1 minute' where id=$1", [e1]);
  assert.equal((await call("GET", "/buyer-pools/mine", undefined, b2.cookie)).body.allocations.find((a) => a.allocationId === e1).allocationStatus, "expired");
  const late = await call("POST", `/buyer-pools/invites/${e1}/accept`, {}, b2.cookie);
  assert.equal(late.status, 409); assert.equal(late.body.error, "invite_expired");
  assert.equal((await pool.query("select status from buyer_pool_allocations where id=$1", [e1])).rows[0].status, "expired");
  assert.equal((await poolRow(p4)).status, "forming");
  assert.equal((await call("POST", `/admin/buyer-pools/${p4}/allocations`, { buyerUserId: b2.id, quantity: 100 }, admin.cookie)).status, 201, "expired buyer can be re-invited");
  pass("invites expire after 10 days (open at 9d23h, expired at 10d), expired cannot be accepted, quantity is freed, re-invite works");
  console.log(`PASSED: ${checks} real PostgreSQL buyer-pool scenarios (synthetic data, no network).`);
} finally {
  globalThis.fetch = beforeFetch;
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
