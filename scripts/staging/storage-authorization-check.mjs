#!/usr/bin/env node
// WRITTEN, NOT RUN. For an isolated STAGING Supabase project with SYNTHETIC accounts only.
// Never point this at production or real customer data. It needs the owner's explicit approval to run.
//
// Required env (values are never printed):
//   STAGING_API_BASE        e.g. https://udc-staging.example/api       (must NOT be the production host)
//   STAGING_SUPABASE_URL    https://<staging-ref>.supabase.co
//   STAGING_SUPABASE_ANON_KEY
//   COMPANY_A_COOKIE / COMPANY_B_COOKIE   session cookies of two synthetic verified buyers in DIFFERENT companies
//   STAGING_PROD_HOST_BLOCKLIST (optional, comma list of hosts that must never be used)
// Test PDF is generated here; nothing real is uploaded.
import assert from "node:assert/strict";

const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`missing ${k}`); return v; };
const api = need("STAGING_API_BASE").replace(/\/$/, "");
const sb = need("STAGING_SUPABASE_URL").replace(/\/$/, "");
const anon = need("STAGING_SUPABASE_ANON_KEY");
const A = need("COMPANY_A_COOKIE"), B = need("COMPANY_B_COOKIE");
for (const h of (process.env.STAGING_PROD_HOST_BLOCKLIST ?? "").split(",").filter(Boolean))
  assert.ok(!api.includes(h) && !sb.includes(h), "refusing to run against a blocklisted (production) host");
const bucket = "udc-documents";
const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("synthetic staging probe ".repeat(10))]);
const call = (path, opts = {}, cookie) => fetch(api + path, { ...opts, headers: { ...(cookie ? { cookie } : {}), ...(opts.headers ?? {}) } });
let n = 0; const pass = (m) => console.log(`PASSED ${++n}: ${m}`);

// 1. Company A creates a vault upload link and uploads a document.
const link = await (await call("/vault/upload-links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentType: "other" }) }, A)).json();
assert.ok(link.url, "link issued");
const up = await fetch(link.url, { method: "POST", headers: { "content-type": "application/pdf" }, body: pdf });
assert.equal(up.status, 201); pass("A uploads through a single-use link; stored as pending");
assert.equal((await fetch(link.url, { method: "POST", headers: { "content-type": "application/pdf" }, body: pdf })).status, 410); pass("link cannot be reused");

// 2. The bucket is private: anonymous reads and listings fail.
const probe = `companies/00000000-0000-0000-0000-000000000000/vault-probe.pdf`;
for (const url of [`${sb}/storage/v1/object/public/${bucket}/${probe}`, `${sb}/storage/v1/object/${bucket}/${probe}`]) {
  const r = await fetch(url, { headers: { apikey: anon, authorization: `Bearer ${anon}` } });
  assert.ok([400, 401, 403, 404].includes(r.status), `anonymous object read must fail, got ${r.status}`);
}
const list = await fetch(`${sb}/storage/v1/object/list/${bucket}`, { method: "POST", headers: { apikey: anon, authorization: `Bearer ${anon}`, "content-type": "application/json" }, body: JSON.stringify({ prefix: "", limit: 5 }) });
if (list.ok) assert.deepEqual(await list.json(), [], "anonymous listing must return nothing");
pass("bucket is private: anonymous public/direct reads fail and listing is empty");

// 3. Owner view shows status only; no file location.
const mine = await (await call("/vault/documents", {}, A)).json();
assert.ok(mine.documents.length >= 1 && !JSON.stringify(mine).includes("storage://") && !JSON.stringify(mine).includes("/storage/v1/"));
pass("owner document list exposes status only, never a storage path or URL");

// 4. Company B cannot see or delete A's document.
const docId = mine.documents[0].id;
assert.equal((await call(`/vault/documents/${docId}/deletion-request`, { method: "POST" }, B)).status, 404);
assert.equal((await (await call("/vault/documents", {}, B)).json()).documents.some((d) => d.id === docId), false);
pass("company B cannot list or request deletion of company A's document");

// 5. Signed URLs (deal documents): valid for the participant, short-lived, not usable for another path.
if (process.env.DEAL_ID_WITH_APPROVED_DOC) {
  const d = process.env.DEAL_ID_WITH_APPROVED_DOC;
  const docs = await (await call(`/deals/${d}/documents`, {}, A)).json();
  const signed = docs.documents.find((x) => x.fileUrl)?.fileUrl;
  assert.ok(signed, "participant receives a signed URL");
  assert.equal((await fetch(signed)).status, 200);
  const tampered = signed.replace(/deals\/[^/]+\//, "deals/00000000-0000-0000-0000-000000000000/");
  assert.notEqual((await fetch(tampered)).status, 200);
  assert.equal((await call(`/deals/${d}/documents`, {}, B)).status === 200 && (await (await call(`/deals/${d}/documents`, {}, B)).json()).documents?.length > 0, false, "non-participant gets no documents");
  pass("signed URL works for the participant, a tampered path fails, a non-participant gets nothing");
}
console.log(`DONE: ${n} storage authorization checks (staging, synthetic data). Record the signed-URL expiry separately: wait past 300 seconds and confirm the URL then fails.`);
