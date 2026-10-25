// WRITTEN BUT NOT YET EXECUTED (no Postgres server was available when this was authored).
// Dedicated loopback QA DB only, fictional data, real routes and real SQL. Run with:
//   UDC_VERIFICATION_QA_DATABASE_URL=postgresql://udc_dev@127.0.0.1:5432/udc_qa_verification_x \
//   node artifacts/api-server/test/integration/company-verification-postgres.mjs
// The schema must already exist (pnpm --filter @workspace/db run push against the same DB).
// Covers: registration company rule, verify-needs-approved-doc (409), last-doc rejection downgrade.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const url = new URL(process.env.UDC_VERIFICATION_QA_DATABASE_URL ?? "http://missing.invalid");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.match(url.pathname, /^\/udc_qa_verification_[a-z0-9_]+$/);
for (const key of Object.keys(process.env))
  if (/^(SUPABASE_|WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_|SESSION_SECRET)/.test(key)) delete process.env[key];
Object.assign(process.env, {
  SUPABASE_DATABASE_URL: url.href,
  SESSION_SECRET: randomBytes(32).toString("hex"),
  NODE_ENV: "test",
});
await mkdir(new URL("../../tmp/", import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL("../../tmp/qa-verification-", import.meta.url)));
let server, pool, origin;
const beforeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  assert.equal(new URL(String(input)).origin, origin, "never contact external services");
  return beforeFetch(input, init);
};
try {
  await build({
    stdin: {
      contents: `import express from 'express';import cookieParser from 'cookie-parser';import auth from './src/routes/auth';import admin from './src/routes/admin';import {loadAuth} from './src/auth/middleware';export {pool,db} from '@workspace/db';export {hashPassword} from './src/auth/passwords';export {approvedCompanyEvidence} from './src/marketplace/verifiedCounterparties';const app=express();app.set('trust proxy','loopback');app.use(express.json());app.use(cookieParser());app.use(loadAuth);app.use(auth);app.use(admin);export default app;`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
    },
    outfile: directory + "/app.mjs",
    bundle: true, platform: "node", format: "esm", external: ["pg-native"], logLevel: "silent",
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
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `198.19.0.${ip++ % 250}`, ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json().catch(() => ({})), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  };
  const pass = (label) => { checks++; console.log("PASSED: " + label); };
  const base = { password: "Fictional-Password9!", accepted_terms: true, adult_business_user: true };
  const id = () => randomUUID().slice(0, 8);

  // Registration rule
  const buyerEmail = `buyer-${id()}@qa-trading.example.invalid`;
  assert.equal((await call("POST", "/auth/register", { ...base, full_name: "QA Buyer", email: `p-${id()}@gmail.com`, role: "buyer", company_name: "QA Trading" })).status, 400);
  assert.equal((await call("POST", "/auth/register", { ...base, full_name: "QA Buyer", email: buyerEmail, role: "buyer" })).status, 400);
  const buyer = await call("POST", "/auth/register", { ...base, full_name: "QA Buyer", email: buyerEmail, role: "buyer", company_name: "QA Trading" });
  assert.equal(buyer.status, 201, JSON.stringify(buyer.body));
  const buyerId = buyer.body.user.id;
  const company = (await pool.query("select id,company_name,verification_status from companies where owner_user_id=$1", [buyerId])).rows;
  assert.equal(company.length, 1);
  assert.equal(company[0].verification_status, "pending");
  const agent = await call("POST", "/auth/register", { ...base, full_name: "QA Agent", email: `a-${id()}@gmail.com`, role: "agent" });
  assert.equal(agent.status, 201);
  assert.equal((await pool.query("select count(*)::int n from companies where owner_user_id=$1", [agent.body.user.id])).rows[0].n, 0);
  pass("web registration: buyer needs company email and name and gets a pending company row; agent exempt");

  // Admin session
  const adminEmail = `admin-${id()}@example.invalid`, adminPassword = "Fictional-Admin9!Pw";
  await pool.query("insert into users(email,password_hash,role,status) values($1,$2,'admin','active')", [adminEmail, await app.hashPassword(adminPassword)]);
  const login = await call("POST", "/auth/login", { email: adminEmail, password: adminPassword });
  assert.equal(login.status, 200);
  const cookie = login.cookie;
  assert.ok(cookie);
  const companyId = company[0].id;

  // Verify without an approved document is refused
  const refused = await call("PATCH", `/admin/companies/${companyId}/verification`, { verification_status: "verified" }, cookie);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error, "approved_company_document_required");
  assert.equal((await pool.query("select verification_status from companies where id=$1", [companyId])).rows[0].verification_status, "pending");
  pass("company cannot be verified without an approved document (409, status unchanged)");

  // Verifying the USER before any company evidence is refused
  const userRefused = await call("PATCH", `/admin/users/${buyerId}/verification`, { status: "verified" }, cookie);
  assert.equal(userRefused.status, 409);
  assert.equal(userRefused.body.error, "verified_company_and_approved_document_required");
  assert.notEqual((await pool.query("select status from users where id=$1", [buyerId])).rows[0].status, "verified");
  pass("buyer cannot be verified through the admin route without a verified company and approved document (409)");

  // Approve a document, then verify
  const doc = (await pool.query("insert into company_verification_documents(company_id,uploaded_by,document_type,file_url,status) values($1,$2,'certificate','storage://private/qa/doc.pdf','pending') returning id", [companyId, buyerId])).rows[0].id;
  assert.equal((await call("PATCH", `/admin/company-verification-documents/${doc}/status`, { status: "approved" }, cookie)).status, 200);
  assert.equal((await call("PATCH", `/admin/companies/${companyId}/verification`, { verification_status: "verified" }, cookie)).status, 200);
  const userVerified = await call("PATCH", `/admin/users/${buyerId}/verification`, { status: "verified" }, cookie);
  assert.equal(userVerified.status, 200);
  assert.equal((await pool.query("select status from users where id=$1", [buyerId])).rows[0].status, "verified");
  assert.equal(await app.approvedCompanyEvidence(buyerId), true);
  pass("approved document then verified company satisfies the marketplace evidence check");

  // Rejecting the last approved document downgrades company and owner
  const reject = await call("PATCH", `/admin/company-verification-documents/${doc}/status`, { status: "rejected", reviewNote: "Unreadable scan" }, cookie);
  assert.equal(reject.status, 200);
  assert.equal((await pool.query("select verification_status from companies where id=$1", [companyId])).rows[0].verification_status, "under_review");
  assert.equal((await pool.query("select status from users where id=$1", [buyerId])).rows[0].status, "under_review");
  assert.equal(await app.approvedCompanyEvidence(buyerId), false);
  pass("rejecting the last approved document downgrades company and owner and fails the evidence check");

  console.log(`PASSED: ${checks} real PostgreSQL company-verification scenarios; no real network/provider calls.`);
} finally {
  globalThis.fetch = beforeFetch;
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
