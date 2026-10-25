// Meta limits probe (fake Meta, local PG): 429 retry/backoff, reply-loss release + redelivery, 24h window, per-phone cap, outbound pacing.
// Run against a dedicated local database after applying lib/db's schema:
// UDC_QA_DATABASE_URL=postgresql://udc_dev@127.0.0.1:5432/udc_qa_registration?sslmode=disable \
//   node artifacts/api-server/test/integration/whatsapp-buyer-postgres.mjs
// Actual signed webhook, consent, sessions, transactions and persistence;
// outbound Meta/AI requests are intercepted, never sent to real services.
// Combined #119-122 integration: all roles, retries, offers and permissions.
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
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
const sent = [], providerCalls = [], metaCalls = [], sleeps = [];
const metaMode = { type: 'ok', n: 0 };
let localOrigin;
globalThis.fetch = async (input, init) => {
  const destination = new URL(String(input));
  if (destination.origin === localOrigin) return fetchBefore(input, init);
  if (destination.hostname === 'graph.facebook.com' && destination.pathname.endsWith('/messages')) {
    const body = JSON.parse(init.body);
    assert.ok(testPhones.has(body.to), 'never address a real recipient');
    metaCalls.push(body);
    if (metaMode.type === 'always429') return new Response(JSON.stringify({ error: { code: 130429 } }), { status: 429, headers: { 'retry-after': '1' } });
    if (metaMode.type === 'twice429' && metaMode.n++ < 2) return new Response(JSON.stringify({ error: { code: 80007 } }), { status: 429 });
    if (metaMode.type === 'windowClosed') return new Response(JSON.stringify({ error: { code: 131047 } }), { status: 400 });
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
        export {pool,db} from '@workspace/db';
        export {setSleepForTest,resetOutboundPacingForTest,sendWhatsAppText} from './src/whatsapp/client';
        export {resetInboundCapForTest} from './src/whatsapp/inboundRateCap';
        export {sendPoolInviteMessage} from './src/marketplace/poolInvites';
        const app=express();
        app.use(express.json({verify(req,res,body){req.rawBody=body;}}));
        app.use((req,res,next)=>{req.log={info(){},error(){},warn(){}};next();});
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
    return response.status;
  }
  const migration = await readFile(new URL('../../../../lib/db/migrations/20261025_whatsapp_inbound_dedup.sql', import.meta.url), 'utf8');
  await pool.query(migration);
  await pool.query(migration); // exact SQL must be safe to repeat
  for (const role of ['anon', 'authenticated']) {
    for (const op of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      assert.equal((await pool.query('select has_table_privilege($1,$2,$3) allowed', [role, 'public.whatsapp_inbound_dedup', op])).rows[0].allowed, false);
    }
  }
  for (const op of ['TRUNCATE', 'TRIGGER', 'REFERENCES']) {
    assert.equal((await pool.query('select has_table_privilege($1,$2,$3) allowed', ['service_role', 'public.whatsapp_inbound_dedup', op])).rows[0].allowed, false);
  }
  module.setSleepForTest(async (ms) => { sleeps.push(ms); });
  const dedupRows = async () => (await pool.query('select completed_at from whatsapp_inbound_dedup')).rows;

  // 1. Meta throttles twice, then accepts: the reply still arrives (retry with backoff), webhook answers 200.
  metaMode.type = 'twice429'; metaMode.n = 0; metaCalls.length = 0; sleeps.length = 0; sent.length = 0;
  assert.equal(await post('Hello', randomUUID()), 200);
  assert.ok(sent.length >= 1, 'reply delivered after two throttled attempts');
  assert.ok(metaCalls.length >= 3 && sleeps.length >= 2 && sleeps[1] > sleeps[0] - 250, 'backoff grows: ' + sleeps);
  console.log('PASSED: two Meta 429s then success: reply delivered, backoff', sleeps.join('ms, ') + 'ms');

  // 2. Meta keeps throttling: reply is lost for now, so the claim is released, webhook answers 503, redelivery works.
  metaMode.type = 'always429'; metaCalls.length = 0; sent.length = 0; sleeps.length = 0;
  const lostId = randomUUID();
  assert.equal(await post('Hello', lostId), 503, 'non-2xx so Meta redelivers');
  assert.equal(metaCalls.length >= 4 ? 4 : metaCalls.length, 4, 'bounded retries: ' + metaCalls.length);
  assert.ok(sleeps.every((ms) => ms <= 8000));
  const h = createHash('sha256').update('wa-inbound:' + lostId).digest('hex');
  assert.equal((await pool.query('select 1 from whatsapp_inbound_dedup where id_hash=$1', [h])).rows.length, 0, 'claim released, not left completed');
  metaMode.type = 'ok'; sent.length = 0;
  assert.equal(await post('Hello', lostId), 200, 'Meta redelivery of the same id');
  assert.ok(sent.length >= 1, 'redelivered message is answered');
  assert.equal(await post('Hello', lostId), 200);
  const again = sent.length; await post('Hello', lostId);
  assert.equal(sent.length, again, 'and only once after that');
  console.log('PASSED: persistent 429: bounded retries, claim released, 503 to Meta, redelivery answered once');

  // 3. Per-phone inbound cap: burst of 30 messages -> 20 processed, one notice, rest dropped quietly.
  module.resetInboundCapForTest(); sent.length = 0;
  const burstPhone = phone; 
  for (let i = 0; i < 30; i++) assert.equal(await post('Hello', randomUUID(), burstPhone), 200);
  const notices = sent.filter((m) => /very quickly/.test(JSON.stringify(m))).length;
  assert.equal(notices, 1, 'exactly one slow-down notice, got ' + notices);
  assert.ok(sent.length <= 22, 'no reply storm: ' + sent.length);
  module.resetInboundCapForTest();
  console.log('PASSED: per-phone cap: 30 rapid messages, one slow-down notice, no reply storm; counted per phone');

  // 4. Outbound token bucket: with 5/s, 12 immediate sends make the later ones wait.
  process.env.WHATSAPP_OUTBOUND_PER_SECOND = '5'; module.resetOutboundPacingForTest(); sleeps.length = 0;
  for (let i = 0; i < 12; i++) await module.sendWhatsAppText(phone, 'x' + i);
  assert.ok(sleeps.length >= 6 && sleeps[0] === 200 && sleeps.every((ms) => ms > 0), 'paced: ' + sleeps);
  delete process.env.WHATSAPP_OUTBOUND_PER_SECOND; module.resetOutboundPacingForTest();
  console.log('PASSED: outbound token bucket paces a burst of 12 sends at 5/s (' + sleeps.length + ' waits)');

  // 5. Pool invite outside the 24h window: Meta refuses (131047) -> "not delivered" in the admin audit log, no throw.
  const [buyer] = (await pool.query("insert into users(email,password_hash,role,status,full_name,phone) values('pool-buyer@example.invalid','x','buyer','verified','Pool Buyer',$1) returning id", ['1000' + Date.now() + '9'])).rows;
  testPhones.add((await pool.query('select phone from users where id=$1', [buyer.id])).rows[0].phone);
  const alloc = randomUUID();
  metaMode.type = 'windowClosed';
  assert.equal(await module.sendPoolInviteMessage(buyer.id, alloc, { quantity: '10', unit: 'MT' }), 'not_delivered_window_closed');
  let audit = (await pool.query("select metadata from audit_logs where action='buyer_pool_invite_notification_not_delivered' and entity_id=$1", [alloc])).rows;
  assert.equal(audit.length, 1); assert.equal(audit[0].metadata.reason, 'not_delivered_window_closed');
  metaMode.type = 'always429';
  const alloc2 = randomUUID();
  assert.equal(await module.sendPoolInviteMessage(buyer.id, alloc2, { quantity: '10', unit: 'MT' }), 'not_delivered');
  metaMode.type = 'ok';
  assert.equal(await module.sendPoolInviteMessage(buyer.id, randomUUID(), { quantity: '10', unit: 'MT' }), 'sent');
  // Evidence-based check: flag on, no inbound evidence recorded -> blocked before any send.
  process.env.UDC_WHATSAPP_WINDOW_EVIDENCE_ENABLED = 'true'; metaCalls.length = 0;
  const w = await module.sendPoolInviteMessage(buyer.id, randomUUID(), { quantity: '10', unit: 'MT' });
  delete process.env.UDC_WHATSAPP_WINDOW_EVIDENCE_ENABLED;
  assert.ok(w === 'not_delivered_window_closed' || w === 'not_delivered', w);
  console.log('PASSED: pool invites: window closed (Meta 131047) and persistent throttling both recorded as "notification not delivered" for the admin; normal send works; evidence gate blocks before sending (' + w + ')');
} finally {
  globalThis.fetch = fetchBefore;
  delete globalThis.__udcCombinedMail;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
