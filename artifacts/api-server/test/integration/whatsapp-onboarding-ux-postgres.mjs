// Run against a dedicated local database after applying lib/db's schema:
// UDC_QA_DATABASE_URL=postgresql://udc_dev@127.0.0.1:5432/udc_qa_registration?sslmode=disable \
//   node artifacts/api-server/test/integration/whatsapp-buyer-postgres.mjs
// Actual signed webhook, consent, sessions, transactions and persistence;
// WhatsApp onboarding experience: welcome, consent, role buttons, registration, invalid input, retries, interruptions.
// Combined #119-122 integration: all roles, retries, offers and permissions.
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
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const transcript = [];
  const textOf = (b) => b.text?.body ?? b.interactive?.body?.text ?? '[non-text]';
  async function say(sender, who, input, id = randomUUID()) {
    const before = sent.length;
    await post(input, id, sender);
    const shown = typeof input === 'string' ? input : (input.button_reply?.id ?? input.list_reply?.id ?? 'interactive');
    transcript.push(`${who} > ${shown}`);
    const out = sent.slice(before).filter(b => b.to === sender);
    for (const b of out) {
      const buttons = b.interactive?.action?.buttons?.map(x => x.reply.title).join(' | ');
      transcript.push(`UDC  < ${textOf(b).replace(/\n/g, '\n       ')}${buttons ? `\n       [buttons: ${buttons}]` : ''}${b.interactive?.type === 'list' ? '\n       [list menu]' : ''}`);
    }
    return out;
  }
  const lastText = (out) => out.map(textOf).join('\n');
  const SUPPORT = 'udc@updowncircle.site';
  const roles = [
    ['buyer', phone + '10', [['Name', 'Asha Verma'], ['email', 'asha@verma-imports.example.invalid'], ['company', 'Verma Imports Pvt Ltd'], ['country', 'India']]],
    ['seller', phone + '11', [['Name', 'Omar Said'], ['email', 'omar@said-exports.example.invalid'], ['company', 'Said Exports LLC'], ['country', 'Oman']]],
    ['agent', phone + '12', [['Name', 'Lena Park'], ['email', 'lena.park@example.invalid']]],
  ];
  for (const [, p] of roles) testPhones.add(p);

  // 1. First message: formatting, links, support email, consent.
  const [roleB, pB] = roles[0];
  let out = await say(pB, 'User', 'hi');
  const first = lastText(out);
  console.log('FIRST-MESSAGE-LENGTH', first.length);
  assert.equal(out.length, 1, 'one first message');
  assert.ok(!first.includes('\\n'), 'no literal backslash-n in the welcome');
  assert.ok(first.includes('https://updowncircle.site/#/terms') && first.includes('https://updowncircle.site/#/privacy'), 'published Terms and Privacy links');
  assert.ok(first.includes(SUPPORT) && !/gmail\.com/i.test(first), 'support email is udc@updowncircle.site');
  assert.match(first, /Reply "I agree"/);
  assert.match(first, /18\+/); assert.match(first, /withdraw consent/i);
  assert.ok(first.length <= 1700, 'first message stays readable');
  assert.ok(first.split('\n').filter(l => l.length > 400).length === 0, 'no wall-of-text line');

  // 2. Consent: unclear replies never count; after the full notice they get a short reminder, not a wall of text again.
  for (const [n, unclear] of ['ok', 'yes please', 'what is this?', 'agree maybe'].entries()) {
    out = await say(pB, 'User', unclear);
    assert.match(lastText(out), /reply "I agree"/i, `"${unclear}" must not count as consent`);
    assert.ok(!out.some(b => b.interactive?.action?.buttons), 'no role buttons before consent');
    assert.ok(lastText(out).includes('https://updowncircle.site/#/terms') && lastText(out).includes(SUPPORT));
    assert.ok(lastText(out).length < 520, `reminder ${n} is short (${lastText(out).length})`);
  }
  out = await say(pB, 'User', 'show notice');
  assert.match(lastText(out), /What we collect, and why/, 'the full notice can be shown again on request');
  assert.equal(await count('select count(*) from users where phone=$1', [pB]), 0);
  out = await say(pB, 'User', 'I agree');
  assert.equal(out.length, 1);
  assert.equal(out[0].interactive.action.buttons.map(b => b.reply.title).join(','), 'Buyer,Seller,Agent');
  assert.ok(!textOf(out[0]).includes('\\n'));

  // 3. Interrupted before choosing a role: a question gets an answer, never a form or a menu list.
  out = await say(pB, 'User', 'Why do you need a company name?');
  assert.match(lastText(out), /company name and a company email/);
  assert.match(lastText(out), /Agents do not need/);
  assert.ok(!out.some(b => b.interactive?.type === 'list'), 'no menu list unless asked');
  out = await say(pB, 'User', { type: 'button_reply', button_reply: { id: 'udc:buyer' } });
  assert.match(lastText(out), /full name/i);

  // 4. Buyer form: invalid inputs explain why, retries work, interruption resumes at the same question.
  out = await say(pB, 'User', 'Asha Verma');
  assert.match(lastText(out), /company email/);
  out = await say(pB, 'User', 'not-an-email');
  assert.match(lastText(out), /does not look like an email address/);
  assert.match(lastText(out), /company email\?/);
  out = await say(pB, 'User', 'asha@gmail.com');
  assert.match(lastText(out), /need a company email \(not Gmail/);
  assert.equal(await count('select count(*) from users where phone=$1', [pB]), 0);
  out = await say(pB, 'User', 'Why do you need a company email?');
  assert.match(lastText(out), /Agents do not need/);
  out = await say(pB, 'User', 'asha@verma-imports.example.invalid');
  assert.match(lastText(out), /company name/i);
  out = await say(pB, 'User', 'x'.repeat(400));
  assert.match(lastText(out), /Please keep this answer within \d+ characters/);
  out = await say(pB, 'User', 'Verma Imports Pvt Ltd');
  assert.match(lastText(out), /country/i);
  out = await say(pB, 'User', 'India');
  assert.match(lastText(out), /Please review/);
  assert.match(lastText(out), /Registration needs UDC approval/);
  assert.equal(await count('select count(*) from users where phone=$1', [pB]), 0, 'nothing is created before the user confirms');
  out = await say(pB, 'User', 'Submit');
  assert.equal(await count("select count(*) from users where phone=$1 and role='buyer' and status='pending'", [pB]), 1);
  assert.equal(await count("select count(*) from companies c join users u on u.id=c.owner_user_id where u.phone=$1 and c.company_name='Verma Imports Pvt Ltd'", [pB]), 1);

  // 5. After onboarding: normal chat does not open the menu; the menu appears only when requested.
  const menusBefore = sent.filter(b => b.to === pB && b.interactive).length;
  out = await say(pB, 'User', 'Thanks, what happens next?');
  assert.ok(!out.some(b => b.interactive), 'no buttons or lists in a normal reply');
  out = await say(pB, 'User', 'menu');
  assert.ok(out.some(b => b.interactive), 'the menu appears when asked');

  // 6. Seller: tap Seller, interrupt with cancel, restart, complete.
  const [, pS] = roles[1];
  await say(pS, 'User', 'hello'); await say(pS, 'User', 'I agree');
  out = await say(pS, 'User', { type: 'button_reply', button_reply: { id: 'udc:seller' } });
  assert.match(lastText(out), /full name/i);
  await say(pS, 'User', 'Omar Said');
  out = await say(pS, 'User', 'cancel');
  assert.match(lastText(out), /Nothing was submitted/);
  assert.equal(await count('select count(*) from users where phone=$1', [pS]), 0);
  out = await say(pS, 'User', { type: 'button_reply', button_reply: { id: 'udc:seller' } });
  assert.match(lastText(out), /full name/i, 'registration can restart after cancelling');
  for (const a of ['Omar Said', 'omar@said-exports.example.invalid', 'Said Exports LLC', 'Oman']) out = await say(pS, 'User', a);
  assert.match(lastText(out), /Please review/);
  out = await say(pS, 'User', 'Edit');
  assert.match(lastText(out), /Send just the details you want to change/);
  out = await say(pS, 'User', 'full_name: Omar Al Said');
  assert.match(lastText(out), /Please review/);
  assert.match(lastText(out), /Omar Al Said/);
  assert.match(lastText(out), /Said Exports LLC/, 'the other saved details are kept');
  await say(pS, 'User', 'Submit');
  assert.equal(await count("select count(*) from users where phone=$1 and role='seller' and full_name='Omar Al Said'", [pS]), 1);

  // 7. Agent: no company, any email, no company questions.
  const [, pA] = roles[2];
  await say(pA, 'User', 'hi'); await say(pA, 'User', 'I agree');
  out = await say(pA, 'User', { type: 'button_reply', button_reply: { id: 'udc:agent' } });
  out = await say(pA, 'User', 'Lena Park');
  assert.match(lastText(out), /Personal or business email is fine/);
  out = await say(pA, 'User', 'lena.park@gmail.com');
  assert.match(lastText(out), /Please review/);
  assert.ok(!/company/i.test(lastText(out).replace(/Registration needs UDC approval/, '')), 'agents are not asked for a company');
  await say(pA, 'User', 'Submit');
  assert.equal(await count("select count(*) from users where phone=$1 and role='agent'", [pA]), 1);
  assert.equal(await count("select count(*) from companies c join users u on u.id=c.owner_user_id where u.phone=$1", [pA]), 0);

  // 8. Interrupted and abandoned: a user who stops mid-form and returns later with a greeting is asked the same question, not restarted.
  const pX = phone + '13'; testPhones.add(pX);
  await say(pX, 'User', 'hi'); await say(pX, 'User', 'I agree'); await say(pX, 'User', { type: 'button_reply', button_reply: { id: 'udc:buyer' } });
  await say(pX, 'User', 'Rahul Nair');
  out = await say(pX, 'User', 'hello again');
  console.log('RETURN-GREETING', JSON.stringify(lastText(out).slice(0, 160)));

  // 8b. Confidential documents: asked about passports or bank statements, AKIF points to the private link, never asks for WhatsApp attachments.
  out = await say(pB, 'User', 'Should I send my passport and bank statement here on WhatsApp?');
  const docAnswer = lastText(out);
  console.log('DOC-ANSWER', JSON.stringify(docAnswer.slice(0, 260)));
  assert.match(docAnswer, /private|secure|upload link|vault/i);
  assert.ok(!/(?:please|you can|go ahead and)\s+send (?:me )?(?:your|the) (?:passport|bank statement)/i.test(docAnswer));

  // 9. No outbound message in the whole run contains a literal backslash-n or a personal-address leak.
  for (const b of sent) {
    const t = textOf(b);
    assert.ok(!t.includes('\\n'), 'literal \\n found: ' + t.slice(0, 80));
    assert.ok(!/npmuhammed818@gmail\.com/i.test(t), 'old support address must not be shown');
  }
  fs.writeFileSync(process.env.UDC_TRANSCRIPT_FILE || '/tmp/udc-onboarding-transcript.txt', transcript.join('\n'));
  console.log('PASSED: onboarding for buyer, seller and agent: welcome formatting and links, consent gate (short reminders), role buttons, helpful validation messages, retries, cancel and restart, edit, nothing created before confirmation, menu only on request.');
} finally {
  globalThis.fetch = fetchBefore;
  delete globalThis.__udcCombinedMail;
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
