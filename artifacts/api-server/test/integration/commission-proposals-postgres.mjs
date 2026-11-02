// Synthetic loopback-only commission proposal and concurrent human-approval SQL tests.
// Uses a fresh udc_qa_commroutes_* database and its fixture-only precision migration.
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
      contents: `import express from 'express';import cookieParser from 'cookie-parser';import auth from './src/routes/auth';import admin from './src/routes/admin';import proposals from './src/routes/commissionProposals';import privacy from './src/routes/privacy';import {loadAuth} from './src/auth/middleware';export {pool,db} from '@workspace/db';export {hashPassword} from './src/auth/passwords';const app=express();app.set('trust proxy','loopback');app.use(express.json());app.use(cookieParser());app.use(loadAuth);app.use(auth);app.use(admin);app.use(proposals);app.use(privacy);export default app;`,
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


  const agent=await mk('agent','verified');const dealId=await mkDeal('USD','500.00');
  await pool.query("insert into deal_participants(deal_id,user_id,participant_role,status) values($1,$2,'agent','active')",[dealId,agent.id]);
  const rule={dealId,beneficiaryUserId:agent.id,method:'percentage',rate:'2',currency:'USD',agreementReference:'SYNTHETIC signed fee agreement for QA only',humanConfirmed:true};
  assert.equal((await call('POST','/admin/commission-agreed-terms',rule,buyer.cookie)).status,403);
  const prepared=await call('POST','/admin/commission-agreed-terms',rule,admin.cookie);assert.equal(prepared.status,201,JSON.stringify(prepared.body));assert.equal(prepared.body.proposals.length,1);const proposal=prepared.body.proposals[0];
  assert.equal(proposal.metadata.amount,'1000.00');assert.equal((await pool.query('select count(*)::int as n from commissions where deal_id=$1',[dealId])).rows[0].n,0);pass('completion proposal is non-liability, explicit rule only');
  const list=await call('GET','/admin/commission-proposals',undefined,admin.cookie);assert.equal(list.status,200);assert.ok(list.body.proposals.some(p=>p.id===proposal.id));
  const url='/admin/commission-proposals/'+proposal.id+'/approve';
  assert.equal((await call('POST',url,{humanApproved:true},buyer.cookie)).status,403);assert.equal((await call('POST',url,{},admin.cookie)).status,400);
  await pool.query("update deals set agreed_price='600' where id=$1",[dealId]);assert.equal((await call('POST',url,{humanApproved:true},admin.cookie)).status,409);await pool.query("update deals set agreed_price='500' where id=$1",[dealId]);pass('changed terms and non-admin/unconfirmed approvals blocked');
  const results=await Promise.all(Array.from({length:8},()=>call('POST',url,{humanApproved:true},admin.cookie)));assert.equal(results.filter(r=>r.status===200).length,1,JSON.stringify(results));assert.equal(results.filter(r=>r.status===409).length,7);assert.equal((await pool.query('select count(*)::int as n from commissions where deal_id=$1',[dealId])).rows[0].n,1);assert.equal((await pool.query("select count(*)::int as n from audit_logs where action='commission_proposal_approved' and entity_id=$1",[proposal.id])).rows[0].n,1);pass('eight concurrent human approvals create exactly one liability and audit');
  const newRule=await call('POST','/admin/commission-agreed-terms',{...rule,rate:'3'},admin.cookie);assert.equal(newRule.status,201);assert.equal(newRule.body.proposals.length,0);pass('existing beneficiary commission never produces a second owed proposal');

  const d2=await mkDeal('USD','500.00');await pool.query("insert into deal_participants(deal_id,user_id,participant_role,status) values($1,$2,'agent','active')",[d2,agent.id]);
  const r1=await call('POST','/admin/commission-agreed-terms',{...rule,dealId:d2},admin.cookie);const r2=await call('POST','/admin/commission-agreed-terms',{...rule,dealId:d2,rate:'3'},admin.cookie);
  assert.equal((await call('POST','/admin/commission-proposals/'+r1.body.proposals[0].id+'/approve',{humanApproved:true},admin.cookie)).status,409);
  await pool.query("update users set status='suspended' where id=$1",[agent.id]);const newUrl='/admin/commission-proposals/'+r2.body.proposals[0].id+'/approve';assert.equal((await call('POST',newUrl,{humanApproved:true},admin.cookie)).status,409);await pool.query("update users set status='verified' where id=$1",[agent.id]);
  await pool.query("create function qa_reject_commission_audit() returns trigger language plpgsql as $$begin if NEW.action='commission_proposal_approved' then raise exception 'synthetic audit outage'; end if; return NEW; end$$;create trigger qa_reject_commission_audit before insert on audit_logs for each row execute function qa_reject_commission_audit()");
  assert.equal((await call('POST',newUrl,{humanApproved:true},admin.cookie)).status,500);assert.equal((await pool.query('select count(*)::int n from commissions where deal_id=$1',[d2])).rows[0].n,0,'audit failure must roll back owed commission');
  await pool.query('drop trigger qa_reject_commission_audit on audit_logs; drop function qa_reject_commission_audit()');assert.equal((await call('POST',newUrl,{humanApproved:true},admin.cookie)).status,200);pass('newer explicit terms invalidate prior proposal, suspension blocks, audit outage rolls back and retry succeeds');

  const mid=(await pool.query("insert into deal_meetings(deal_id,requested_by,status) values($1,$2,'scheduled') returning id",[d2,buyer.id])).rows[0].id;
  const rep={name:'Synthetic Representative',role:'Observer',agreementReference:'Synthetic verified agreement by both parties and representative',partiesAgreed:true,representativeAgreed:true,noPaymentOrBooking:true};const repUrl='/admin/meetings/'+mid+'/representative';
  assert.equal((await call('POST',repUrl,rep,buyer.cookie)).status,403);assert.equal((await call('POST',repUrl,{...rep,representativeAgreed:false},admin.cookie)).status,400);assert.equal((await call('POST',repUrl,rep,admin.cookie)).status,201);assert.equal((await call('GET',repUrl,undefined,admin.cookie)).body.record.metadata.recordOnly,true);await pool.query("update deal_meetings set status='cancelled' where id=$1",[mid]);assert.equal((await call('POST',repUrl,rep,admin.cookie)).status,409);pass('representative human confirmations required, private audited record only, cancelled meeting refused');
  const pr=await call('POST','/privacy/requests',{confirmed:true},buyer.cookie);assert.equal(pr.status,201,JSON.stringify(pr.body));const privacyId=pr.body.request.entityId;const privacyUrl='/admin/privacy/requests/'+privacyId;const review={status:'resolved',outcome:'Synthetic review only: no actual hosted data deletion.'};assert.equal((await call('PATCH',privacyUrl,review,admin.cookie)).status,400);const verifiedChecklist={identity:true,database:true,messagesAndMemory:true,storage:true,providers:true,backups:true,retentionExplained:true};assert.equal((await call('PATCH',privacyUrl,{...review,verifiedChecklist},buyer.cookie)).status,403);assert.equal((await call('PATCH',privacyUrl,{...review,verifiedChecklist},admin.cookie)).status,200);assert.equal((await call('PATCH',privacyUrl,{...review,verifiedChecklist},admin.cookie)).status,409);pass('privacy resolution requires all seven human checks and admin, refuses repeat closure');
  console.log(`PASSED: ${checks} real PostgreSQL commission-proposal scenarios, no external network`);
} finally {globalThis.fetch=beforeFetch;if(server)await new Promise(r=>server.close(r));await pool?.end();await rm(directory,{recursive:true,force:true});}
