// Run against a dedicated local database after applying lib/db's schema:
// UDC_QA_DATABASE_URL=postgresql://udc_dev@127.0.0.1:5432/udc_qa_registration?sslmode=disable \
//   node artifacts/api-server/test/integration/whatsapp-buyer-postgres.mjs
// Actual signed webhook, consent, sessions, transactions and persistence;
// outbound Meta/AI requests are intercepted, never sent to real services.
// Combined #119-122 integration: all roles, retries, offers and permissions.
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const url = new URL(process.env.UDC_QA_DATABASE_URL ?? 'http://missing.invalid');
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'only a local QA database is allowed');
assert.ok(!url.searchParams.has('host') || ['127.0.0.1','localhost'].includes(url.searchParams.get('host')), 'a host override must also stay local');
assert.match(url.pathname, /^\/udc_qa_[a-z0-9_]+$/, 'use a dedicated QA database');
const secret = randomBytes(32).toString('hex');
const phone = `1000${Date.now()}`;
const testPhones = new Set([phone]);
let forcedDecision = null;
const label = `UDC QA ${randomUUID().slice(0, 8)}`;
const email = `qa-${randomUUID()}@example.invalid`;
const mail = { outbox: [] };
globalThis.__udcCombinedMail = mail;
// Ignore any real integration configuration inherited by the developer shell.
for (const key of Object.keys(process.env)) {
  if (/^(?:WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: 'production',
  SESSION_SECRET: secret,
  SUPABASE_DATABASE_URL: url.href,
  WHATSAPP_APP_SECRET: secret,
  WHATSAPP_INBOUND_PER_MINUTE: '100000',
  WHATSAPP_ACCESS_TOKEN: 'synthetic-no-network-token',
  WHATSAPP_PHONE_NUMBER_ID: 'synthetic-phone-id',
  AKIF_WORKER_CONVERSATION_ENABLED: 'true',
  AKIF_WORKER_URL: 'https://worker.example.invalid',
  AKIF_WORKER_TOKEN: 'synthetic-no-network-token',
  NVIDIA_API_KEY: 'synthetic-no-network-token',
  NVIDIA_BASE_URL: 'https://fallback.example.invalid/v1',
});
await mkdir(new URL('../../tmp/', import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL('../../tmp/qa-', import.meta.url)));
const output = `${directory}/webhook.mjs`;
let server, pool;
const fetchBefore = globalThis.fetch;
const sent = [], providerCalls = [];
let localOrigin;
globalThis.fetch = async (input, init) => {
  const destination = new URL(String(input));
  if (destination.origin === localOrigin) return fetchBefore(input, init);
  if (destination.hostname === 'graph.facebook.com' && destination.pathname.endsWith('/messages')) {
    const body = JSON.parse(init.body);
    assert.ok(testPhones.has(body.to), 'never address a real recipient');
    sent.push(body);
    return Response.json({ messages: [{ id: `qa-out-${sent.length}` }] });
  }
  if (destination.hostname === 'worker.example.invalid') {
    if (forcedDecision) return Response.json({choices:[{message:{content:JSON.stringify(forcedDecision)}}]});
    providerCalls.push('worker_timeout');
    throw new DOMException('Synthetic worker timeout', 'AbortError');
  }
  if (destination.hostname === 'fallback.example.invalid') {
    providerCalls.push('fallback_429');
    return new Response('', { status: 429 });
  }
  throw new Error(`Unexpected network destination: ${destination.hostname}`);
};

try {
  await build({
    stdin: {
      contents: `import express from 'express';
        import router from './src/routes/whatsappWebhook';
        export {pool} from '@workspace/db';
        const app=express();
        app.use(express.json({verify(req,res,body){req.rawBody=body;}}));
        app.use((req,res,next)=>{req.log={info(){},error(){}};next();});
        app.use('/api',router);export default app;`,
      resolveDir: fileURLToPath(new URL('../../', import.meta.url)),
    },
    outfile: output, bundle: true, platform: 'node', format: 'esm',
    external: ['pg-native'],
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
    logLevel: 'silent',
    plugins: [{ name: 'fictional-email-provider', setup(b) {
      b.onResolve({ filter: /\/emailDelivery$/ }, () => ({ path: 'mail', namespace: 'combined-qa' }));
      b.onLoad({ filter: /.*/, namespace: 'combined-qa' }, () => ({ contents: 'export const sendAuthEmail=async(message,signal)=>{if(!signal)throw new Error("missing delivery deadline");globalThis.__udcCombinedMail.outbox.push(message);};' }));
    } }],
  });
  const module = await import(output);
  pool = module.pool;
  await pool.query(await readFile(new URL('../../../../lib/db/migrations/20261023_email_authentication.sql', import.meta.url), 'utf8'));
  server = module.default.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  localOrigin = `http://127.0.0.1:${server.address().port}`;
  async function post(text, id = randomUUID(), from = phone) {
    const raw = JSON.stringify({ entry: [{ changes: [{ value: {
      contacts: [{ profile: { name: label } }],
      messages: [{ id, from, ...(typeof text==='string'?{text:{body:text}}:{interactive:text}) }],
    } }] }] });
    const response = await fetch(`${localOrigin}/api/webhooks/whatsapp`, {
      method: 'POST', headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
      }, body: raw,
    });
    assert.equal(response.status, 200, await response.text());
  }
  const count = async (sql, parameters) => Number((await pool.query(sql, parameters)).rows[0].count);
  await post('Hello');
  assert.match(sent.at(-1).text.body, /Reply "I agree"/);
  assert.equal(await count('select count(*) from users where phone=$1', [phone]), 0);
  await post('AGREE');
  assert.equal(sent.at(-1).interactive.action.buttons.length, 3);
  await post('Buyer');
  assert.match(sent.at(-1).text.body, /full name/i);
  // Trigger the actual fallback chain before supplying simple answers.
  await post('Could you explain which details I should send?');
  assert.deepEqual(providerCalls, ['worker_timeout', 'fallback_429']);
  assert.equal(await count('select count(*) from users where phone=$1', [phone]), 0);
  const calls = providerCalls.length;
  for (const answer of [label, email, `company_name: ${label} Test Imports Ltd`, 'India']) await post(answer);
  assert.equal(providerCalls.length, calls, 'plain answers bypass failed providers');
  assert.equal(await count('select count(*) from users where phone=$1', [phone]), 0);
  await post('Submit');
  const { rows: [buyer] } = await pool.query('select id,role,status,email from users where phone=$1', [phone]);
  assert.ok(buyer);assert.equal(buyer.role, 'buyer');assert.equal(buyer.status, 'pending');assert.equal(buyer.email, email);
  const { rows: [company] } = await pool.query('select verification_status from companies where owner_user_id=$1', [buyer.id]);
  assert.equal(company.verification_status, 'pending');
  await post('Verify email');
  assert.match(sent.at(-1).text.body, /6-digit code/);
  assert.equal(mail.outbox.length, 1);assert.equal(mail.outbox[0].to, email);
  const code = mail.outbox[0].code;
  await post('Email code ' + code);
  assert.match(sent.at(-1).text.body, /ownership is verified/);
  await post('Email code ' + code);
  assert.match(sent.at(-1).text.body, /invalid or expired/);
  await post('Verify email');
  assert.equal(mail.outbox.length, 1, 'already verified account must not send another code');
  const { rows: [proof] } = await pool.query('select verified_email,email_verified_at,password_recovery_enabled,role,status from users where id=$1', [buyer.id]);
  assert.equal(proof.verified_email, email);assert.ok(proof.email_verified_at);
  assert.equal(proof.password_recovery_enabled, false);assert.equal(proof.role, 'buyer');assert.equal(proof.status, 'pending');
  assert.equal(providerCalls.length, calls, 'email code must bypass AI and trade memory');
  assert.equal(await count('select count(*) from whatsapp_intake_drafts where phone=$1', [phone]), 0);
  console.log('PASSED combined signed WhatsApp + PostgreSQL: outage registration, mocked email code, ownership proof, replay rejection and unchanged role/company/passwordless permissions before trade intake.');
  await post({type:'list_reply',list_reply:{id:'udc:requirement'}});
  assert.match(sent.at(-1).text.body, /product/i);
  for (const answer of ['Copper cathode', '100', 'Jebel Ali', 'CIF']) await post(answer);
  assert.equal(await count('select count(*) from buyer_requests where buyer_user_id=$1', [buyer.id]), 0);
  const submitId = randomUUID();
  await post({type:'button_reply',button_reply:{id:'udc:submit'}}, submitId);
  await post({type:'button_reply',button_reply:{id:'udc:submit'}}, submitId);
  const { rows: requests } = await pool.query('select quantity,destination,preferred_incoterm,status from buyer_requests where buyer_user_id=$1', [buyer.id]);
  assert.equal(requests.length, 1);
  assert.equal(Number(requests[0].quantity), 100);assert.equal(requests[0].destination, 'Jebel Ali');
  assert.equal(requests[0].preferred_incoterm, 'CIF');assert.equal(requests[0].status, 'pending_admin_review');
  assert.equal(providerCalls.length, calls);
  const { rows: [unchanged] } = await pool.query('select status from users where id=$1', [buyer.id]);
  assert.equal(unchanged.status, 'pending');

  const sellerPhone=phone+'1',agentPhone=phone+'2',conflictPhone=phone+'3';
  for(const sender of [sellerPhone,agentPhone,conflictPhone])testPhones.add(sender);
  const sendAs=(sender,text)=>post(text,randomUUID(),sender);
  for(const [role,sender,answers] of [
    ['seller',sellerPhone,[label+' Seller',`seller-${randomUUID()}@example.invalid`,label+' Test Exports Ltd','Oman']],
    ['agent',agentPhone,[label+' Agent',`qa-${randomUUID()}@gmail.com`]],
  ]){
    for(const text of ['Hello','AGREE',role,...answers])await sendAs(sender,text);
    assert.equal(await count('select count(*) from users where phone=$1',[sender]),0);
    await sendAs(sender,'Submit');
    const {rows:[account]}=await pool.query('select id,role,status from users where phone=$1',[sender]);
    assert.ok(account);assert.equal(account.role,role);assert.equal(account.status,'pending');
    if(role==='agent')assert.equal(await count('select count(*) from companies where owner_user_id=$1',[account.id]),0);
    else assert.equal(await count('select count(*) from companies where owner_user_id=$1 and verification_status=$2',[account.id,'pending']),1);
  }
  for(const product of ['Copper cathode','Sugar']){
    await sendAs(sellerPhone,{type:'list_reply',list_reply:{id:'udc:offer'}});
    for(const answer of [product,'125','kg','7','AED','Oman','FOB'])await sendAs(sellerPhone,answer);
    await sendAs(sellerPhone,'Submit');
  }
  const {rows:offers}=await pool.query('select sl.unit,sl.currency,sl.quantity,sl.price,sl.status from seller_listings sl join users u on u.id=sl.seller_user_id where u.phone=$1',[sellerPhone]);
  assert.equal(offers.length,2);
  for(const offer of offers){assert.equal(offer.unit,'kg');assert.equal(offer.currency,'AED');assert.equal(Number(offer.quantity),125);assert.equal(Number(offer.price),7);assert.equal(offer.status,'pending_admin_review');}
  assert.equal(providerCalls.length,calls,'seller and agent scalar flows should remain usable offline');

  for(const text of ['Hello','AGREE','Buyer',`full_name: ${label} Retry; email: ${email}; company_name: QA Retry Imports Ltd; country: India`,'Submit'])await sendAs(conflictPhone,text);
  assert.match(sent.at(-1).text.body,/already belongs/);
  assert.equal(await count('select count(*) from users where phone=$1',[conflictPhone]),0);
  const {rows:drafts}=await pool.query("select data from whatsapp_chat_sessions where data->>'email'=$1 and purpose='profile_buyer'",[email]);
  assert.equal(drafts.length,1);assert.equal(drafts[0].data.company_name,'QA Retry Imports Ltd');
  for(const text of ['Edit',`email: retry-${randomUUID()}@example.invalid`,'Submit'])await sendAs(conflictPhone,text);
  assert.equal(await count('select count(*) from users where phone=$1 and status=$2',[conflictPhone,'pending']),1);
  const {rows:[originalBuyer]}=await pool.query('select email,role,status from users where id=$1',[buyer.id]);
  assert.equal(originalBuyer.email,email);assert.equal(originalBuyer.role,'buyer');assert.equal(originalBuyer.status,'pending');

  for(const [sender,role,attempt] of [[agentPhone,'agent','buyer'],[agentPhone,'agent','seller'],[phone,'buyer','seller'],[sellerPhone,'seller','buyer']]){
    const {rows:[beforeAccount]}=await pool.query('select id,full_name,email,role,status,verified_email,email_verified_at,password_recovery_enabled from users where phone=$1',[sender]);
    const beforeRequests=await count('select count(*) from buyer_requests where buyer_user_id=$1',[beforeAccount.id]);
    const beforeOffers=await count('select count(*) from seller_listings where seller_user_id=$1',[beforeAccount.id]);
    forcedDecision={role:attempt,newIntake:true,fields:{product:'Sugar',quantity:100,targetPrice:500,price:490,destination:'Mombasa'},reply:'I will send this for review.'};
    const text=attempt==='buyer'?'New separate test requirement: I need 100 MT Sugar to Mombasa at USD 500 per MT.':'New separate test offer: I can supply 100 MT Sugar at USD 490 per MT.';
    await sendAs(sender,text);
    forcedDecision=null;
    assert.match(sent.at(-1).text.body,new RegExp('registered as '+role));
    assert.equal(await count('select count(*) from buyer_requests where buyer_user_id=$1',[beforeAccount.id]),beforeRequests);
    assert.equal(await count('select count(*) from seller_listings where seller_user_id=$1',[beforeAccount.id]),beforeOffers);
    assert.equal(await count('select count(*) from whatsapp_intake_drafts where phone=$1',[sender]),0);
    const {rows:[afterAccount]}=await pool.query('select id,full_name,email,role,status,verified_email,email_verified_at,password_recovery_enabled from users where phone=$1',[sender]);
    assert.deepEqual(afterAccount,beforeAccount,'cross-role attempts must not mutate the existing account');
  }
  console.log('PASSED additionally with real local PostgreSQL: seller and agent registration, two kg/AED offers, retained rejected registration + successful edit/retry, existing account unchanged, and signed cross-role intake blocked.');

  console.log('PASSED: signed webhook, privacy consent, worker timeout + fallback error, plain buyer registration, pending company review, private requirement persistence and duplicate submit protection (real local PostgreSQL; no live messages).');
} finally {
  globalThis.fetch = fetchBefore;
  delete globalThis.__udcCombinedMail;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
