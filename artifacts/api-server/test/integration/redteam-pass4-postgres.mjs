// Red-team pass 4: fresh loopback synthetic SQL, provider/storage boundary fake.
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
Object.assign(process.env, { SUPABASE_DATABASE_URL: url.href, SESSION_SECRET: randomBytes(32).toString("hex"), NODE_ENV: "production" });
await mkdir(new URL("../../tmp/", import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL("../../tmp/qa-p0-", import.meta.url)));
let server, pool, origin;
const storage=[];globalThis.__pass4Storage=storage;const beforeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  assert.equal(new URL(String(input)).origin, origin, "never contact external services");
  return beforeFetch(input, init);
};
try {
  await build({
    stdin: {
      contents: `import app from './src/app';export {pool,db} from '@workspace/db';export {hashPassword} from './src/auth/passwords';export default app;`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
    },
    plugins:[{name:'synthetic-storage',setup(b){b.onResolve({filter:/supabase\/storage$/},()=>({path:'storage',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:`export async function uploadDocumentBytes(path){globalThis.__pass4Storage.push(path);return 'storage://udc-documents/'+path};export async function removeDocumentObject(path){globalThis.__pass4Storage.splice(globalThis.__pass4Storage.indexOf(path),1)};export async function createSignedDownloadUrl(path){return 'https://signed.example.invalid/'+path};export async function createSignedUploadUrl(path){return 'https://signed.example.invalid/up/'+path};export function storagePath(path){return 'storage://udc-documents/'+path};export function parseStoragePath(value){return value.startsWith('storage://udc-documents/')?value.slice(24):null};export async function downloadDocumentBytes(){throw Error('no network')};export async function inspectDocumentBucketPrivacy(){return {configured:true,private:true}};`}))}}],
    outfile: directory + "/app.mjs", bundle: true, platform: "node", format: "esm", external: ["pg-native"], logLevel: "silent",
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
  });
  const app = await import(directory + "/app.mjs");
  pool = app.pool;
  await pool.query(await (await import('node:fs/promises')).readFile(new URL('../../../../lib/db/migrations/20261023_email_authentication.sql',import.meta.url),'utf8'));
  server = app.default.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  let ip = 1, checks = 0;
  const call = async (method, path, body, cookie = "") => {
    const response = await fetch(origin + "/api" + path, {
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

  const outsider=await mk('buyer','verified');
  let requests=0;
  const walk=stack=>stack.flatMap(l=>l.route?Object.keys(l.route.methods).map(m=>[m.toUpperCase(),l.route.path]):l.handle?.stack?walk(l.handle.stack):[]);
  const adminRoutes=[...new Map(walk(app.default.router.stack).filter(([m,p])=>p.startsWith('/admin/')).map(r=>[r.join(' '),r])).values()];
  assert.ok(adminRoutes.length>80);
  for(const [method,path] of adminRoutes){
    const concrete=path.replace(/:[A-Za-z_]+/g,deal);
    for(const u of [undefined,buyer,seller,agent,outsider]){
      const r=await call(method,concrete,method==='GET'?undefined:{humanApproved:true,humanConfirmed:true,role:'admin',status:'paid'},u?.cookie);requests++;
      assert.equal(r.status,u?403:401,`${method} ${concrete} ${u?.id}: ${r.status}`);
    }
  }
  pass(`all ${adminRoutes.length} admin routes reject anonymous/buyer/seller/agent/outsider (${requests} requests), including money, audit and exports`);
  for(const path of [`/deals/${deal}`,`/deals/${deal}/documents`,`/deals/${deal}/messages`,`/deals/${deal}/execution`,`/deals/${deal}/tracking`,`/deals/${deal}/payment-status`,`/deals/${deal}/timeline`]){
    const r=await call('GET',path,undefined,outsider.cookie);assert.equal(r.status,404,path);assert.ok(!JSON.stringify(r.body).includes('777'));
  }
  pass('cross-user IDOR: outsider denied on deal, documents, messages, execution, tracking, payment and timeline');
  const pdf=Buffer.from('%PDF-1.7\nSynthetic red-team fixture, not a real document');
  const upload=async(u,bytes=pdf,type='application/pdf')=>{const r=await fetch(origin+`/api/deals/${deal}/documents/upload?documentType=other`,{method:'POST',headers:{cookie:u.cookie,'content-type':type},body:bytes});return {status:r.status,body:await r.json().catch(()=>({}))}};
  assert.equal((await upload(outsider)).status,404);assert.equal((await upload(agent)).status,403);assert.equal((await upload(buyer,Buffer.from('not a pdf'))).status,400);assert.equal((await upload(buyer,pdf,'text/html')).status,400);
  assert.equal((await pool.query('select count(*)::int n from documents')).rows[0].n,0);assert.equal(storage.length,0);pass('upload outsider, agent, bad magic and wrong MIME denied without object or row');
  await pool.query("create function qa_upload_audit_outage() returns trigger language plpgsql as $$begin if NEW.action='deal_document_uploaded' then raise exception 'synthetic audit outage'; end if; return NEW; end$$;create trigger qa_upload_audit_outage before insert on audit_logs for each row execute function qa_upload_audit_outage()");
  assert.equal((await upload(buyer)).status,500);
  assert.equal((await pool.query('select count(*)::int n from documents')).rows[0].n,0,'upload must roll back document and access when audit insert fails');assert.equal(storage.length,0,'upload audit failure must remove staged object');
  await pool.query('drop trigger qa_upload_audit_outage on audit_logs;drop function qa_upload_audit_outage()');pass('upload audit failure rolls back document, access and staged object');
  await pool.query("insert into documents(deal_id,uploaded_by,document_type,file_url) select $1::uuid,$2::uuid,'other','storage://udc-documents/deals/'||$1::text||'/'||gen_random_uuid()||'.pdf' from generate_series(1,19)",[deal,buyer.id]);
  const uploads=await Promise.all(Array.from({length:8},()=>upload(buyer)));
  assert.equal(uploads.filter(r=>r.status===201).length,1,JSON.stringify(uploads));assert.equal(uploads.filter(r=>r.status===429).length,7);
  assert.equal((await pool.query('select count(*)::int n from documents where uploaded_by=$1',[buyer.id])).rows[0].n,20);pass('eight concurrent uploads at 19/20 create exactly one document, remaining seven hit quota');
  const companyId=(await pool.query("insert into companies(owner_user_id,company_name) values($1,'Fictional company') returning id",[seller.id])).rows[0].id;
  const companyUpload=async()=>{const r=await fetch(origin+'/api/company/documents/upload?documentType=company_registration',{method:'POST',headers:{cookie:seller.cookie,'content-type':'application/pdf'},body:pdf});return r.status};
  await pool.query("create function qa_company_audit_outage() returns trigger language plpgsql as $$begin if NEW.action='company_verification_document_uploaded' then raise exception 'synthetic audit outage'; end if; return NEW; end$$;create trigger qa_company_audit_outage before insert on audit_logs for each row execute function qa_company_audit_outage()");
  const objectsBefore=storage.length;assert.equal(await companyUpload(),500);assert.equal((await pool.query('select count(*)::int n from company_verification_documents')).rows[0].n,0);assert.equal(storage.length,objectsBefore);
  await pool.query('drop trigger qa_company_audit_outage on audit_logs;drop function qa_company_audit_outage()');
  await pool.query("insert into company_verification_documents(company_id,uploaded_by,document_type,file_url) select $1::uuid,$2::uuid,'company_registration','storage://udc-documents/companies/'||$1::text||'/'||gen_random_uuid()||'.pdf' from generate_series(1,9)",[companyId,seller.id]);
  const companyResults=await Promise.all(Array.from({length:8},()=>companyUpload()));assert.equal(companyResults.filter(n=>n===201).length,1,JSON.stringify(companyResults));assert.equal(companyResults.filter(n=>n===429).length,7);pass('company upload audit outage leaves no row/object; eight concurrent requests respect 10/day quota');
  await pool.query("insert into documents(deal_id,uploaded_by,document_type,file_url) select $1::uuid,$2::uuid,'other','storage://udc-documents/deals/'||$1::text||'/'||gen_random_uuid()||'.pdf' from generate_series(1,19)",[deal,admin.id]);
  const adminUpload=async()=>{const r=await fetch(origin+`/api/admin/deals/${deal}/documents/upload?documentType=other`,{method:'POST',headers:{cookie:admin.cookie,'content-type':'application/pdf'},body:pdf});return r.status};
  const adminResults=await Promise.all(Array.from({length:8},()=>adminUpload()));assert.equal(adminResults.filter(n=>n===201).length,1,JSON.stringify(adminResults));assert.equal(adminResults.filter(n=>n===429).length,7);pass('admin direct upload has same serialized quota, exactly one slot out of eight requests');
  await pool.query("update users set status='suspended' where id=$1",[buyer.id]);assert.equal((await call('GET',`/deals/${deal}`,undefined,buyer.cookie)).status,403);
  await pool.query("update users set status='verified' where id=$1",[buyer.id]);await pool.query('update auth_sessions set revoked_at=now() where user_id=$1',[buyer.id]);assert.equal((await call('GET',`/deals/${deal}`,undefined,buyer.cookie)).status,401);pass('existing cookie loses access immediately on suspension or session revocation');
  console.log(`PASSED: ${checks} real PostgreSQL P0 gate scenarios (synthetic data, no network).`);
} finally {
  globalThis.fetch = beforeFetch;
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
