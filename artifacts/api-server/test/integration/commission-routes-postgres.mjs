// Isolated loopback QA DB only (udc_qa_commroutes_*), synthetic data, real routes and real SQL.
// Behavioural proof for commission recording by currency, manual-amount preservation, existing rows, the default-rule preview,
// Use a FRESH database each run (the script applies the draft widening migration to it).
// and the 3-decimal storage path (flag + the DRAFT forward migration applied to THIS synthetic DB only).
//   UDC_COMMROUTES_QA_DATABASE_URL='postgresql://udc_dev@127.0.0.1:5432/udc_qa_commroutes_x?sslmode=disable' node .../p0-gates-postgres.mjs
// Schema must exist first: pnpm --filter @workspace/db run push against the same DB.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const url = new URL(process.env.UDC_COMMROUTES_QA_DATABASE_URL ?? "http://missing.invalid");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.match(url.pathname, /^\/udc_qa_commroutes_[a-z0-9_]+$/);
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
      contents: `import express from 'express';import cookieParser from 'cookie-parser';import auth from './src/routes/auth';import admin from './src/routes/admin';import {loadAuth} from './src/auth/middleware';export {pool,db} from '@workspace/db';export {hashPassword} from './src/auth/passwords';const app=express();app.set('trust proxy','loopback');app.use(express.json());app.use(cookieParser());app.use(loadAuth);app.use(auth);app.use(admin);export default app;`,
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
  const seller = await mk("seller", "verified"), buyer = await mk("buyer", "verified"), admin = await mk("admin", "active");
  const product = (await pool.query("insert into products(name) values('QA Sugar') returning id")).rows[0].id;
  const mkDeal = async (currency, price = "300.00") => (await pool.query("insert into deals(buyer_user_id,seller_user_id,product_id,quantity,unit,agreed_price,currency,status) values($1,$2,$3,'100','MT',$4,$5,'completed') returning id", [buyer.id, seller.id, product, price, currency])).rows[0].id;
  const record = (dealId, body) => call("POST", "/admin/commissions", { dealId, beneficiaryUserId: seller.id, ...body }, admin.cookie);
  const stored = async (id) => (await pool.query("select amount::text a, currency from commissions where id=$1", [id])).rows[0];

  // manual amounts per currency, preserved exactly
  for (const [cur, amount, expect] of [["USD", "1500.50", "1500.50"], ["EUR", "20", "20.00"], ["INR", "7375.00", "7375.00"], ["AED", "100.25", "100.25"], ["SAR", "9.99", "9.99"], ["QAR", "1", "1.00"], ["JPY", "250000", "250000.00"]]) {
    const r = await record(await mkDeal(cur), { amount, currency: cur });
    assert.equal(r.status, 201, `${cur} ${JSON.stringify(r.body)}`);
    assert.deepEqual(await stored(r.body.commission.id), { a: expect, currency: cur });
  }
  pass("manual commissions in USD, EUR, INR, AED, SAR, QAR, JPY are stored exactly");
  // precision validation: rejected, nothing written
  const before = (await pool.query("select count(*)::int n from commissions")).rows[0].n;
  for (const [cur, amount] of [["USD", "1.005"], ["JPY", "100.5"]]) {
    const r = await record(await mkDeal(cur), { amount, currency: cur });
    assert.equal(r.status, 400, `${cur} ${amount} -> ${r.status}`);
    assert.equal(r.body.error, "commission_amount_precision_exceeds_currency");
  }
  assert.equal((await record(await mkDeal("USD"), { amount: "10", currency: "XXX" })).status, 400);
  assert.equal((await pool.query("select count(*)::int n from commissions")).rows[0].n, before);
  pass("excess precision and unsupported currencies are rejected with a clear error and write nothing");
  // calculated
  const calc = await record(await mkDeal("USD", "5900.00"), { commissionType: "percentage", commissionRate: 1.25, confirmAgreedTerms: true });
  assert.equal(calc.status, 201, JSON.stringify(calc.body));
  assert.equal((await stored(calc.body.commission.id)).a, "7375.00");
  pass("calculated percentage commission stored at the currency's precision");
  // 3 decimals: refused before migration, never rounded
  const omrDeal = await mkDeal("OMR");
  const refused = await record(omrDeal, { amount: "1500.125", currency: "OMR" });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error, "commission_precision_exceeds_storage");
  assert.equal((await record(omrDeal, { amount: "1500.100", currency: "OMR" })).status, 201);
  pass("before the migration a non-zero third decimal is refused (409), a zero third decimal is accepted");
  // apply the DRAFT forward migration to this synthetic DB only, then enable the flag
  const preRows = (await pool.query("select id, amount::text a from commissions order by id")).rows;
  await pool.query(await readFile(new URL("../../../../docs/drafts/commission-3-decimals-forward.sql.draft", import.meta.url), "utf8"));
  process.env.UDC_COMMISSION_STORAGE_DIGITS = "3";
  const post = await record(await mkDeal("OMR"), { amount: "1500.125", currency: "OMR" });
  assert.equal(post.status, 201, JSON.stringify(post.body));
  assert.equal((await stored(post.body.commission.id)).a, "1500.125");
  const postRows = (await pool.query("select id, amount::text a from commissions where id = any($1) order by id", [preRows.map((r) => r.id)])).rows;
  assert.deepEqual(postRows.map((r) => Number(r.a)), preRows.map((r) => Number(r.a)));
  pass("after the draft migration (synthetic DB) and the flag, OMR 1500.125 is stored exactly and earlier rows keep their values");
  const jpyAfter = await record(await mkDeal("JPY"), { amount: "250000", currency: "JPY" });
  assert.equal(jpyAfter.status, 201);
  assert.equal(Number((await stored(jpyAfter.body.commission.id)).a), 250000);
  assert.equal((await record(await mkDeal("JPY"), { amount: "100.5", currency: "JPY" })).status, 400);
  pass("JPY and USD precision rules are unchanged after widening");
  // preview route
  const pv = await call("POST", `/admin/deals/${await mkDeal("USD", "300.00")}/default-commission-preview`, { invoiceDate: "2026-10-20", rbiReferenceRateInrPerUnit: "83.5", rbiReferenceRateDate: "2026-10-20" }, admin.cookie);
  assert.equal(pv.status, 200, JSON.stringify(pv.body));
  assert.equal(pv.body.ratePercent, "1"); assert.equal(pv.body.requiresInvoiceConfirmation, true);
  const pvMr = await call("POST", `/admin/deals/${await mkDeal("USD", "300.00")}/default-commission-preview`, { invoiceDate: "2026-10-20" }, admin.cookie);
  assert.equal(pvMr.body.status, "manual_review");
  pass("default-commission preview route: estimate flagged, manual_review without an RBI rate");
  console.log(`PASSED: ${checks} real PostgreSQL commission route scenarios (synthetic data, no network).`);
} finally {
  globalThis.fetch = beforeFetch;
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
