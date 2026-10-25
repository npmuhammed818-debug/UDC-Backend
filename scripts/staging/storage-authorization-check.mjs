#!/usr/bin/env node
// Real Supabase Storage authorization check. Run ONLY against the isolated free-tier TEST project, synthetic data only.
// Never use production credentials. Secrets come from the environment and are never printed.
//   SUPABASE_TEST_URL   https://<test-ref>.supabase.co
//   SUPABASE_TEST_ANON_KEY
//   SUPABASE_TEST_SERVICE_ROLE_KEY
// It mirrors how the API server uses Storage (service role signs URLs; end users never touch Storage directly):
// private bucket, upload via signed upload URL, download via short-lived signed URL, no anonymous or
// authenticated-user access, tampered or expired URLs fail, cross-company paths stay separate.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`missing ${k}`); return v; };
const base = need("SUPABASE_TEST_URL").replace(/\/$/, "");
const anon = need("SUPABASE_TEST_ANON_KEY");
const svc = need("SUPABASE_TEST_SERVICE_ROLE_KEY");
for (const h of (process.env.SUPABASE_PROD_HOST_BLOCKLIST ?? "").split(",").filter(Boolean)) assert.ok(!base.includes(h), "blocklisted host");
const bucket = `udc-test-${randomUUID().slice(0, 8)}`;
const S = `${base}/storage/v1`;
const jh = (key) => ({ apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" });
const pdf = (tag) => Buffer.from(`%PDF-1.4\n% synthetic test document ${tag}\n`);
const results = []; const pass = (m) => { results.push(m); console.log(`PASSED ${results.length}: ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const companyA = randomUUID(), companyB = randomUUID();
const pathA = `companies/${companyA}/doc-a.pdf`, pathB = `companies/${companyB}/doc-b.pdf`;

try {
  // setup: private bucket (service role)
  let r = await fetch(`${S}/bucket`, { method: "POST", headers: jh(svc), body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 1048576, allowed_mime_types: ["application/pdf"] }) });
  assert.ok(r.ok, `bucket create ${r.status}`);
  const meta = await (await fetch(`${S}/bucket/${bucket}`, { headers: jh(svc) })).json();
  assert.equal(meta.public, false); pass("bucket is private");

  // upload through signed upload URLs, as the vault link flow does
  for (const [p, tag] of [[pathA, "A"], [pathB, "B"]]) {
    const sign = await fetch(`${S}/object/upload/sign/${bucket}/${p}`, { method: "POST", headers: jh(svc), body: "{}" });
    assert.ok(sign.ok, `upload sign ${sign.status}`);
    const url = `${S}${(await sign.json()).url}`;
    const up = await fetch(url, { method: "PUT", headers: { "content-type": "application/pdf" }, body: pdf(tag) });
    assert.ok(up.ok, `upload ${up.status}`);
  }
  pass("two companies each upload a synthetic PDF through a signed upload URL");

  // non-PDF is refused by the bucket policy
  const bad = await fetch(`${S}/object/${bucket}/companies/${companyA}/x.txt`, { method: "POST", headers: { ...jh(svc), "content-type": "text/plain" }, body: "hello" });
  assert.ok(!bad.ok, "non-PDF must be rejected"); pass("non-PDF upload rejected by bucket mime policy");

  // anonymous access: public URL, direct object, authenticated route, listing, upload
  for (const [label, url] of [["public URL", `${S}/object/public/${bucket}/${pathA}`], ["direct object", `${S}/object/${bucket}/${pathA}`], ["authenticated route", `${S}/object/authenticated/${bucket}/${pathA}`]]) {
    const x = await fetch(url, { headers: { apikey: anon, authorization: `Bearer ${anon}` } });
    assert.ok(!x.ok, `${label} must fail for anon (got ${x.status})`);
  }
  const lst = await fetch(`${S}/object/list/${bucket}`, { method: "POST", headers: jh(anon), body: JSON.stringify({ prefix: `companies/${companyA}`, limit: 10 }) });
  if (lst.ok) assert.deepEqual(await lst.json(), []);
  const aup = await fetch(`${S}/object/${bucket}/companies/${companyA}/evil.pdf`, { method: "POST", headers: { apikey: anon, authorization: `Bearer ${anon}`, "content-type": "application/pdf" }, body: pdf("evil") });
  assert.ok(!aup.ok, "anon upload must fail");
  pass("anonymous: public URL, direct read, authenticated route, listing and upload are all denied");

  // OPT-IN (writes two temporary synthetic auth users, deleted afterwards): a signed-in end user with no policies must also be denied
  if (process.env.CREATE_SYNTHETIC_AUTH_USERS === "yes") {
  const users = [];
  for (const c of ["a", "b"]) {
    const email = `udc-test-${c}-${randomUUID().slice(0, 6)}@example.com`, password = `Tt-${randomUUID()}`;
    const cr = await fetch(`${base}/auth/v1/admin/users`, { method: "POST", headers: jh(svc), body: JSON.stringify({ email, password, email_confirm: true }) });
    assert.ok(cr.ok, `synthetic user create ${cr.status}`);
    const id = (await cr.json()).id; (globalThis.__users ??= []).push(id);
    const tk = await (await fetch(`${base}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).json();
    assert.ok(tk.access_token, "synthetic user signs in"); users.push({ id, token: tk.access_token });
  }
  for (const [i, u] of users.entries()) {
    const target = i === 0 ? pathB : pathA; // each user tries the OTHER company's file
    const x = await fetch(`${S}/object/authenticated/${bucket}/${target}`, { headers: { apikey: anon, authorization: `Bearer ${u.token}` } });
    assert.ok(!x.ok, `signed-in user ${i} read of the other company's file must fail (got ${x.status})`);
    const own = await fetch(`${S}/object/authenticated/${bucket}/${i === 0 ? pathA : pathB}`, { headers: { apikey: anon, authorization: `Bearer ${u.token}` } });
    assert.ok(!own.ok, "no storage policies exist, so even a signed-in user cannot read directly: access is only via API-issued signed URLs");
  }
  pass("signed-in users (two synthetic companies) cannot read any object directly, including the other company's; access exists only via API-issued signed URLs");
  } else console.log("SKIPPED: signed-in user checks (set CREATE_SYNTHETIC_AUTH_USERS=yes to create and delete two temporary auth users)");

  // authorized path: signed URL works, short-lived, tamper-proof
  const sg = await fetch(`${S}/object/sign/${bucket}/${pathA}`, { method: "POST", headers: jh(svc), body: JSON.stringify({ expiresIn: 5 }) });
  assert.ok(sg.ok); const signed = `${S}${(await sg.json()).signedURL}`;
  const okr = await fetch(signed); assert.equal(okr.status, 200);
  assert.ok((await okr.text()).includes("synthetic test document A")); pass("signed URL downloads the correct document within its lifetime");
  const sb = await (await fetch(`${S}/object/sign/${bucket}/${pathB}`, { method: "POST", headers: jh(svc), body: JSON.stringify({ expiresIn: 60 }) })).json();
  const swapped = signed.replace(pathA, pathB);
  assert.notEqual((await fetch(swapped)).status, 200, "A's token must not unlock B's path"); pass("cross-company: company A's signed token does not unlock company B's file");
  assert.equal((await fetch(`${S}${sb.signedURL}`)).status, 200);
  const tampered = signed.replace(/token=[^&]+/, "token=eyJhbGciOiJIUzI1NiJ9.e30.invalid");
  assert.notEqual((await fetch(tampered)).status, 200); pass("tampered token rejected");
  await sleep(7000);
  const late = await fetch(signed); assert.notEqual(late.status, 200, `expired URL must fail (got ${late.status})`);
  pass("signed URL stops working after its 5 second lifetime (production uses a longer, configured lifetime)");
} finally {
  // cleanup: remove synthetic objects and bucket
  try {
    for (const u of globalThis.__users ?? []) await fetch(`${base}/auth/v1/admin/users/${u}`, { method: "DELETE", headers: jh(svc) });
    await fetch(`${S}/object/${bucket}`, { method: "DELETE", headers: jh(svc), body: JSON.stringify({ prefixes: [pathA, pathB] }) });
    await fetch(`${S}/bucket/${bucket}`, { method: "DELETE", headers: jh(svc) });
  } catch {}
}
console.log(`DONE: ${results.length} storage authorization checks passed on the isolated test project (synthetic data).`);
