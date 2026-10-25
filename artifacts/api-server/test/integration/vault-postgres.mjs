// Isolated loopback QA DB only (udc_qa_vault_*), synthetic data, real routes and real SQL.
// Vault upload end to end: link issue, bearer page, upload, single use, expiry, status-only view, deletion request.
// Supabase storage is replaced by an in-memory fake (no network).
//   UDC_VAULT_QA_DATABASE_URL='postgresql://udc_dev@127.0.0.1:5432/udc_qa_vault_x?sslmode=disable' node .../p0-gates-postgres.mjs
// Schema must exist first: pnpm --filter @workspace/db run push against the same DB.
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const url = new URL(process.env.UDC_VAULT_QA_DATABASE_URL ?? "http://missing.invalid");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.match(url.pathname, /^\/udc_qa_vault_[a-z0-9_]+$/);
for (const key of Object.keys(process.env))
  if (/^(SUPABASE_|WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_|SESSION_SECRET)/.test(key)) delete process.env[key];
Object.assign(process.env, { SUPABASE_DATABASE_URL: url.href, SESSION_SECRET: randomBytes(32).toString("hex"), NODE_ENV: "test" });
await mkdir(new URL("../../tmp/", import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL("../../tmp/qa-vault-", import.meta.url)));
let server, pool, origin;
const beforeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  assert.equal(new URL(String(input)).origin, origin, "never contact external services");
  return beforeFetch(input, init);
};
try {
  await build({
    stdin: {
      contents: `import express from 'express';import cookieParser from 'cookie-parser';import auth from './src/routes/auth';import vault from './src/routes/vault';import {loadAuth} from './src/auth/middleware';export {pool,db} from '@workspace/db';export {hashPassword} from './src/auth/passwords';const app=express();app.set('trust proxy','loopback');app.use(express.json());app.use(cookieParser());app.use(loadAuth);app.use(auth);app.use(vault);app.use('/api',vault);export default app;`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
    },
    plugins: [{ name: "fake-storage", setup(b) { b.onResolve({ filter: /supabase\/storage$/ }, () => ({ path: "fs", namespace: "fake" })); b.onLoad({ filter: /.*/, namespace: "fake" }, () => ({ loader: "js", contents: "export async function uploadDocumentBytes(path, bytes, type){ if(globalThis.__failStorage) throw new Error('down'); (globalThis.__stored ??= []).push({path,type,size:bytes.length}); return 'memory://'+path; }" })); } }],
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


  const owner = await mk("buyer", "verified"), other = await mk("buyer", "verified"), agent = await mk("agent", "verified");
  const mkCompany = async (u) => (await pool.query("insert into companies(owner_user_id,company_name,country) values($1,'QA Trading FZE','AE') returning id", [u.id])).rows[0].id;
  const ownerCo = await mkCompany(owner); await mkCompany(other);
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("synthetic".repeat(20))]);
  const upload = (token, bytes) => fetch(`${origin}/vault/upload/${token}`, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: bytes });
  const tokenOf = (url) => url.split("/").pop();

  delete process.env.VAULT_PUBLIC_BASE_URL;
  assert.equal((await call("POST", "/vault/upload-links", { documentType: "company_registration" }, owner.cookie)).status, 503, "no public base URL, no link");
  process.env.VAULT_PUBLIC_BASE_URL = "https://vault.example.invalid";
  assert.equal((await call("POST", "/vault/upload-links", { documentType: "company_registration" })).status, 401);
  assert.equal((await call("POST", "/vault/upload-links", { documentType: "company_registration" }, agent.cookie)).status, 403, "agents have no vault");
  assert.equal((await call("POST", "/vault/upload-links", { documentType: "selfie_with_aadhaar" }, owner.cookie)).status, 400, "unknown type refused");
  for(const bad of ['https://user:password@vault.example.invalid','https://vault.example.invalid/path','https://vault.example.invalid/?query=private','https://vault.example.invalid/#fragment']){
    const before=Number((await pool.query('select count(*) from vault_upload_links')).rows[0].count);
    process.env.VAULT_PUBLIC_BASE_URL=bad;
    assert.equal((await call('POST','/vault/upload-links',{documentType:'company_registration'},owner.cookie)).status,503);
    assert.equal(Number((await pool.query('select count(*) from vault_upload_links')).rows[0].count),before,'bad config cannot persist a bearer token');
  }
  process.env.VAULT_PUBLIC_BASE_URL='https://vault.example.invalid';
  pass("link issue: needs a configured https base, login, a non-agent role and a known document type");

  const issued = await call("POST", "/vault/upload-links", { documentType: "company_registration" }, owner.cookie);
  assert.equal(issued.status, 201, JSON.stringify(issued.body));
  const token = tokenOf(issued.body.url);
  const stored = (await pool.query("select token_hash from vault_upload_links where user_id=$1", [owner.id])).rows;
  assert.ok(!JSON.stringify(stored).includes(token), "raw token is never stored");
  const page = await fetch(origin+new URL(issued.body.url).pathname);
  assert.equal(page.status, 200); assert.match(page.headers.get("cache-control"), /no-store/);
  assert.equal((await fetch(`${origin}/vault/upload/${"x".repeat(43)}`)).status, 410);
  pass("upload page opens only for a real token, no-store headers, token stored hashed only");

  assert.equal((await upload(token, Buffer.from("MZ not a document at all"))).status, 415, "file type is judged by bytes");
  globalThis.__failStorage = true;
  assert.equal((await upload(token, pdf)).status, 502);
  globalThis.__failStorage = false;
  assert.equal((await pool.query("select used_at from vault_upload_links where user_id=$1", [owner.id])).rows[0].used_at, null, "failed storage releases the link");
  const ok = await upload(token, pdf);
  assert.equal(ok.status, 201); assert.equal((await ok.json()).status, "pending");
  assert.equal(globalThis.__stored.length, 1);
  assert.ok(globalThis.__stored[0].path.startsWith(`companies/${ownerCo}/vault-`));
  assert.equal((await upload(token, pdf)).status, 410, "single use");
  const row = (await pool.query("select status, document_type, uploaded_by from company_verification_documents where company_id=$1", [ownerCo])).rows;
  assert.deepEqual(row.map((r) => [r.status, r.document_type, r.uploaded_by]), [["pending", "company_registration", owner.id]]);
  pass("bad bytes 415, storage failure 502 releases the link, good PDF 201 stored under the owner's company as pending, second use 410");

  const exp = await call("POST", "/vault/upload-links", { documentType: "tax_certificate" }, owner.cookie);
  await pool.query("update vault_upload_links set expires_at = now() - interval '1 minute' where token_hash is not null and used_at is null and user_id=$1", [owner.id]);
  assert.equal((await upload(tokenOf(exp.body.url), pdf)).status, 410, "expired link");
  const links = [];
  for (let i = 0; i < 5; i++) links.push(await call("POST", "/vault/upload-links", { documentType: "other" }, other.cookie));
  assert.deepEqual(links.map((l) => l.status), [201, 201, 201, 201, 201]);
  assert.equal((await call("POST", "/vault/upload-links", { documentType: "other" }, other.cookie)).status, 429, "active link cap");
  pass("expired link 410; at most 5 active links per user (6th gets 429)");

  const mine = await call("GET", "/vault/documents", undefined, owner.cookie);
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.documents.map((d) => d.status), ["pending"]);
  assert.ok(!JSON.stringify(mine.body).includes("memory://"), "no file location in the owner view");
  assert.equal((await call("GET", "/vault/documents", undefined, other.cookie)).body.documents.length, 0, "other company sees nothing");
  const docId = mine.body.documents[0].id;
  assert.equal((await call("POST", `/vault/documents/${docId}/deletion-request`, {}, other.cookie)).status, 404, "cannot request deletion of another company's file");
  assert.equal((await call("POST", `/vault/documents/${docId}/deletion-request`, {}, owner.cookie)).status, 202);
  assert.equal((await call("POST", `/vault/documents/${docId}/deletion-request`, {}, owner.cookie)).status, 202);
  assert.equal((await pool.query("select count(*)::int n from vault_deletion_requests where document_id=$1", [docId])).rows[0].n, 1, "no duplicate open request");
  assert.ok((await pool.query("select count(*)::int n from vault_access_log")).rows[0].n >= 4, "access is logged");
  pass("owner sees status only (no file URL), other companies see nothing and cannot delete, deletion request recorded once, access logged");
  console.log(`PASSED: ${checks} real PostgreSQL vault scenarios (synthetic data, fake storage, no network).`);
} finally {
  globalThis.fetch = beforeFetch;
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
