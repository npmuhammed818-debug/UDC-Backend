// Run against a dedicated local database after applying lib/db's schema:
// UDC_QA_DATABASE_URL=postgresql://udc_dev@127.0.0.1:5432/udc_qa_registration?sslmode=disable \
//   node artifacts/api-server/test/integration/whatsapp-buyer-postgres.mjs
// Actual signed webhook, consent, sessions, transactions and persistence;
// outbound Meta/AI requests are intercepted, never sent to real services.
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const url = new URL(process.env.UDC_QA_DATABASE_URL ?? 'http://missing.invalid');
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'only a local QA database is allowed');
assert.match(url.pathname, /^\/udc_qa_[a-z0-9_]+$/, 'use a dedicated QA database');
const secret = randomBytes(32).toString('hex');
const phone = `1000${Date.now()}`;
const label = `UDC QA ${randomUUID().slice(0, 8)}`;
const email = `qa-${randomUUID()}@example.invalid`;
// Ignore any real integration configuration inherited by the developer shell.
for (const key of Object.keys(process.env)) {
  if (/^(?:WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: 'production',
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
const sent = [], providerCalls = [];
let localOrigin;
globalThis.fetch = async (input, init) => {
  const destination = new URL(String(input));
  if (destination.origin === localOrigin) return fetchBefore(input, init);
  if (destination.hostname === 'graph.facebook.com' && destination.pathname.endsWith('/messages')) {
    const body = JSON.parse(init.body);
    assert.equal(body.to, phone, 'never address a real recipient');
    sent.push(body);
    return Response.json({ messages: [{ id: `qa-out-${sent.length}` }] });
  }
  if (destination.hostname === 'worker.example.invalid') {
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
  });
  const module = await import(output);
  pool = module.pool;
  server = module.default.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  localOrigin = `http://127.0.0.1:${server.address().port}`;
  async function post(text, id = randomUUID()) {
    const raw = JSON.stringify({ entry: [{ changes: [{ value: {
      contacts: [{ profile: { name: label } }],
      messages: [{ id, from: phone, ...(typeof text==='string'?{text:{body:text}}:{interactive:text}) }],
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
  assert.match(sent.at(-1).text.body, /Reply AGREE/);
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
  console.log('PASSED: signed webhook, privacy consent, worker timeout + fallback error, plain buyer registration, pending company review, private requirement persistence and duplicate submit protection (real local PostgreSQL; no live messages).');
} finally {
  globalThis.fetch = fetchBefore;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
