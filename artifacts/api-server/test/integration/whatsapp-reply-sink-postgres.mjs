// Run against a dedicated local database after applying lib/db's schema:
// UDC_QA_DATABASE_URL=postgresql://udc_dev@127.0.0.1:5432/udc_qa_registration?sslmode=disable \
//   node artifacts/api-server/test/integration/whatsapp-buyer-postgres.mjs
// Actual signed webhook, consent, sessions, transactions and persistence;
// WhatsApp onboarding experience: welcome, consent, role buttons, registration, invalid input, retries, interruptions.
// Staging reply sink: with AKIF_WHATSAPP_REPLY_SINK=store nothing reaches Meta and replies can be read back.
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import fs from 'node:fs';

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
  AKIF_WHATSAPP_REPLY_SINK: 'store',
});
await mkdir(new URL('../../tmp/', import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL('../../tmp/qa-', import.meta.url)));
const output = `${directory}/webhook.mjs`;
let server, pool;
const fetchBefore = globalThis.fetch;
const sent = [], providerCalls = [], leaked = [];
let localOrigin;
globalThis.fetch = async (input, init) => {
  const destination = new URL(String(input));
  if (destination.origin === localOrigin) return fetchBefore(input, init);
  if (destination.hostname === 'graph.facebook.com' && destination.pathname.endsWith('/messages')) {
    const body = JSON.parse(init.body);
    assert.ok(testPhones.has(body.to), 'never address a real recipient');
    leaked.push(body);
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
  const sign = (t) => `sha256=${createHmac('sha256', secret).update(t).digest('hex')}`;
  const post = (text, id = randomUUID(), from) => { const raw = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [{ profile: { name: label } }], messages: [{ id, from, type: 'text', text: { body: text } }] } }] }] });
    return fetchBefore(`${localOrigin}/api/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(raw) }, body: raw }); };
  const read = (to, sig = sign('read-sink')) => fetchBefore(`${localOrigin}/api/webhooks/whatsapp-sink?to=${to}`, { headers: sig ? { 'x-udc-sink-signature': sig } : {} });
  const U = '15555550142';
  assert.equal((await post('hi', undefined, U)).status, 200);
  await new Promise(r => setTimeout(r, 800));
  assert.equal(leaked.length, 0, 'sink on: nothing may be sent to Meta');
  const ok = await read(U); assert.equal(ok.status, 200);
  const { replies } = await ok.json();
  assert.ok(replies.length >= 1 && replies.every(r => r.to === U), 'the welcome reply is stored for the simulated user');
  assert.match(replies.map(r => r.text).join('\n'), /agree/i, 'stored text is readable');
  console.log('PASSED: sink stores the reply and nothing reaches Meta:', JSON.stringify(replies[0].text.slice(0, 60)));
  assert.equal((await read(U, null)).status, 404, 'unsigned read refused');
  assert.equal((await read(U, 'sha256=' + '0'.repeat(64))).status, 404, 'wrong signature refused');
  assert.equal((await read(U, 'sha256=abc')).status, 404, 'short signature refused');
  const other = await (await read('15555550143')).json(); assert.equal(other.replies.length, 0, 'filtered by recipient');
  console.log('PASSED: readout needs the app-secret signature, filters by recipient');
  await post('I agree', undefined, U); await new Promise(r => setTimeout(r, 800));
  const more = (await (await read(U)).json()).replies;
  assert.ok(more.length > replies.length, 'a second reply was stored');
  assert.equal(leaked.length, 0);
  console.log('PASSED: second reply stored, still nothing sent; total stored', more.length, 'kinds', more.map(r => r.kind).join(','));
} finally {
  globalThis.fetch = fetchBefore;
  delete globalThis.__udcCombinedMail;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
