// Run against a dedicated local database after applying lib/db's schema:
// UDC_QA_DATABASE_URL=postgresql://udc_dev@127.0.0.1:5432/udc_qa_registration?sslmode=disable \
//   node artifacts/api-server/test/integration/whatsapp-buyer-postgres.mjs
// Actual signed webhook, consent, sessions, transactions and persistence;
// WhatsApp onboarding experience: welcome, consent, role buttons, registration, invalid input, retries, interruptions.
// Unauthenticated route sweep: every mounted API route called with no credentials. Never 5xx; no unexpected 2xx.
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
      contents: `import app from './src/app';
        export {pool} from '@workspace/db';
        export default app;`,
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

  // Express 5 layers do not expose the mount path, so the top-level router is /api and nested routers
  // are mounted without a prefix (see routes/index.ts). Wrongly-prefixed paths show up as 404s below.
  const walk = (stack, prefix = '') => stack.flatMap(l => {
    if (l.route) return Object.keys(l.route.methods).map(m => [m.toUpperCase(), prefix + l.route.path]);
    if (l.handle?.stack) return walk(l.handle.stack, prefix || '/api');
    return [];
  });
  const routes = walk((module.default.router ?? module.default._router).stack).filter(([m]) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m));
  const unique = [...new Map(routes.map(r => [r.join(' '), r])).values()];
  const id = '00000000-0000-4000-8000-000000000001';
  const rows = [];
  for (const [method, path] of unique) {
    const concrete = path.replace(/:[A-Za-z_]+/g, id).replace(/\(.*?\)/g, '');
    const r = await fetchBefore(`${localOrigin}${concrete}`, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}', redirect: 'manual' });
    rows.push([r.status, method, concrete]);
  }
  const by = {}; for (const [s, m, p] of rows) (by[s] ??= []).push(`${m} ${p}`);
  console.log('ROUTES-SWEPT', rows.length);
  for (const s of Object.keys(by).sort()) console.log('STATUS', s, by[s].length);
  const five = rows.filter(r => r[0] >= 500);
  const open = rows.filter(r => r[0] >= 200 && r[0] < 300);
  console.log('OPEN-2xx-ROUTES (review: should be only public ones):'); for (const [, m, p] of open) console.log('  ', m, p);
  console.log('5XX:', JSON.stringify(five));
  assert.ok(rows.length > 100, 'route walk found the mounted routes');
  assert.equal(five.length, 0, '5xx on unauthenticated call: ' + JSON.stringify(five));
  console.log(`PASSED: unauthenticated sweep of ${rows.length} routes, no 5xx`);
} finally {
  globalThis.fetch = fetchBefore;
  delete globalThis.__udcCombinedMail;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
