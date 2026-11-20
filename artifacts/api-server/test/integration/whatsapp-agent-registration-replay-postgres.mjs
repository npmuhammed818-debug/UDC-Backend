// Replay of the Nov 15 16:25-16:28 conversation through the real signed webhook handler,
// real Postgres, relay ON for the test number, outbound scope ON.
// SIMULATED: the model (scripted, no network), Meta (fetch capture), the email provider (outbox stub).
// Run: UDC_QA_DATABASE_URL=postgresql://udc_dev@127.0.0.1:5432/udc_qa_replay?sslmode=disable node this-file
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const url = new URL(process.env.UDC_QA_DATABASE_URL ?? 'http://missing.invalid');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.match(url.pathname, /^\/udc_qa_[a-z0-9_]+$/);
const secret = randomBytes(32).toString('hex');
const ME = '15555550142', OTHER = '15555550199';
const PROFILE = 'Maryam Boutique', TYPED = 'Muhammed np', EMAIL = 'tester+wa1@example.invalid';
const mail = { outbox: [] }; globalThis.__udcCombinedMail = mail;
for (const k of Object.keys(process.env)) if (/^(?:WHATSAPP_|AKIF_|NVIDIA_|OPENAI_|HERMES_|GROQ_|UDC_)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  NODE_ENV: 'production', SESSION_SECRET: secret, SUPABASE_DATABASE_URL: url.href, WHATSAPP_APP_SECRET: secret,
  WHATSAPP_INBOUND_PER_MINUTE: '100000', WHATSAPP_ACCESS_TOKEN: 'synthetic', WHATSAPP_PHONE_NUMBER_ID: 'synthetic-phone-id',
  AKIF_BRAIN_ORCHESTRATOR: 'on', AKIF_GROQ: 'on', GROQ_API_KEY: 'synthetic',
  AKIF_HUMAN_RELAY_ENABLED: 'true', AKIF_HUMAN_RELAY_NUMBERS: 'all', AKIF_HUMAN_RELAY_AUTO_GREETINGS: 'on', AKIF_HUMAN_RELAY_AUTO_TOOLS: 'on',
  UDC_WHATSAPP_ONLY_TO: ME,
});
await mkdir(new URL('../../tmp/', import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL('../../tmp/qa-replay-', import.meta.url)));
const output = `${directory}/webhook.mjs`;
let server, pool, localOrigin;
const metaSends = [], fetchBefore = globalThis.fetch;
let seenUser = [];
globalThis.fetch = async (input, init) => {
  const d = new URL(String(input));
  if (d.origin === localOrigin) return fetchBefore(input, init);
  if (d.hostname === 'graph.facebook.com') { try { metaSends.push(JSON.parse(init.body)); } catch {} return Response.json({ messages: [{ id: 'qa-out-' + metaSends.length }] }); }
  if (d.hostname === 'api.groq.com') {
    const { messages } = JSON.parse(init.body);
    const last = messages[messages.length - 1];
    const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
    seenUser.push(lastUser);
    let content = 'How can I help?';
    if (globalThis.__submitOnEmail && last.role !== 'tool' && lastUser.trim() === EMAIL) {
      return Response.json({ choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'submit_registration', arguments: JSON.stringify({ role: 'agent' }) } }] } }] });
    }
    if (last.role === 'tool' && globalThis.__submitOnEmail) content = 'Done, you are registered as an agent.';
    else if (last.role !== 'tool') {
      if (/^agent$/i.test(lastUser.trim())) content = 'Great. What is your full name?';
      else if (lastUser.trim() === TYPED) content = 'Thanks. What email should UDC use?';
      else if (lastUser.trim() === EMAIL) content = 'Got it. Say "I am an agent" to finish.';
    }
    return Response.json({ choices: [{ message: { content } }] });
  }
  throw new Error('Unexpected network destination: ' + d.hostname);
};
try {
  await build({ stdin: { contents: `import express from 'express';
      import router from './src/routes/whatsappWebhook';
      export {pool} from '@workspace/db';
      const app=express();
      app.use(express.json({verify(req,res,body){req.rawBody=body;}}));
      app.use((req,res,next)=>{req.log={info(){},error(){}};next();});
      app.use('/api',router);export default app;`, resolveDir: fileURLToPath(new URL('../../', import.meta.url)) },
    outfile: output, bundle: true, platform: 'node', format: 'esm', external: ['pg-native', '@resvg/resvg-js'], logLevel: 'silent',
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
    plugins: [{ name: 'mail', setup(b) {
      b.onResolve({ filter: /\/emailDelivery$/ }, () => ({ path: 'mail', namespace: 'q' }));
      b.onLoad({ filter: /.*/, namespace: 'q' }, () => ({ contents: 'export const sendAuthEmail=async(message,signal)=>{globalThis.__udcCombinedMail.outbox.push(message);};' }));
    } }] });
  const m = await import(output); pool = m.pool;
  await pool.query(await readFile(new URL('../../../../lib/db/migrations/20261023_email_authentication.sql', import.meta.url), 'utf8'));
  server = m.default.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  localOrigin = `http://127.0.0.1:${server.address().port}`;
  const sign = t => `sha256=${createHmac('sha256', secret).update(t).digest('hex')}`;
  const post = (text, from) => { const raw = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [{ profile: { name: PROFILE } }], messages: [{ id: randomUUID(), from, type: 'text', text: { body: text } }] } }] }] });
    return fetchBefore(`${localOrigin}/api/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(raw) }, body: raw }); };
  const settle = () => new Promise(r => setTimeout(r, 2500));
  const texts = () => metaSends.filter(s => s.type === 'text').map(s => s.text.body);
  const user = async () => (await pool.query('select id,full_name,email,role,status from users where phone=$1', [ME])).rows;

  await post('hello', ME); await settle(); await post('I agree', ME); await settle(); metaSends.length = 0; // consent given as in production
  // Variant A: "I'm an agent" first, nothing typed yet. Must NOT create an account.
  // (Consent/welcome may come first; accept that the number is unregistered.)
  await post("I'm an agent", ME); await settle();
  assert.equal((await user()).length, 0, 'A: no account without a customer-typed name and email');
  assert.equal(mail.outbox.length, 0, 'A: no code before email is given');
  console.log('PASSED A: typed agent request alone creates no account and sends no code');

  // Variant B: the exact order from 16:25-16:28.
  for (const t of ['Agent', TYPED, EMAIL]) { const n = metaSends.length; await post(t, ME); await settle();
    console.log('  inbound', JSON.stringify(t), '-> outbound', metaSends.slice(n).map(s => String(s.text?.body ?? s.type ?? s.interactive?.body?.text ?? "?").slice(0, 70))); }
  await post("I'm an agent", ME); await settle();
  const rows = await user();
  console.log('  user rows', JSON.stringify(rows));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].full_name, TYPED, 'stored name is what the customer typed');
  assert.notEqual(rows[0].full_name, PROFILE, 'profile name is never the registration name');
  assert.equal(rows[0].email, EMAIL, 'stored email is the typed email');
  assert.equal(rows[0].role, 'agent'); assert.equal(rows[0].status, 'pending');
  const ch = (await pool.query('select count(*)::int c from email_auth_challenges where user_id=$1', [rows[0].id])).rows[0].c;
  assert.equal(ch, 1, 'exactly one email challenge');
  assert.equal(mail.outbox.length, 1, 'one code email handed to the (simulated) provider');
  assert.match(texts().at(-1), /6-digit code/, 'code-sent line follows the real send');
  console.log('PASSED B: exact sequence stores typed name+email, one challenge, code line after real send');

  // ---- Variant E: the ACTUAL failure order: Agent -> name -> "I'm an agent" -> email.
  // SIMULATED model: scripted text; on the email it calls submit_registration (as a real model would be expected to).
  globalThis.__submitOnEmail = true;
  await pool.query('delete from email_auth_challenges where user_id in (select id from users where phone=$1)', [ME]);
  await pool.query('delete from users where phone=$1', [ME]);
  await pool.query("delete from whatsapp_chat_sessions where purpose='brain_orchestrator'");
  mail.outbox.length = 0;
  let startOut = [];
  for (const t of ['Agent', TYPED, "I'm an agent", EMAIL]) { const n = metaSends.length; await post(t, ME); await settle();
    if (t === 'Agent') startOut = metaSends.slice(n).filter(s => s.status !== 'read').map(s => String(s.text?.body ?? ''));
    console.log('  E inbound', JSON.stringify(t), '-> outbound', metaSends.slice(n).filter(s => s.status !== 'read').map(s => String(s.text?.body ?? s.type ?? '?').slice(0, 80))); }
  assert.ok(startOut.length >= 1 && /full name/i.test(startOut.join(' ')), 'E: the bare Agent start is answered at once by the registration owner (not held for the relay)');
  const e = await user(); console.log('  E user rows', JSON.stringify(e));
  assert.equal(e.length, 1); assert.equal(e[0].full_name, TYPED); assert.equal(e[0].email, EMAIL);
  assert.equal((await pool.query('select count(*)::int c from email_auth_challenges where user_id=$1', [e[0].id])).rows[0].c, 1);
  assert.equal(mail.outbox.length, 1);
  console.log('PASSED E: actual failure order stores typed name+email, one challenge');

  // ---- Variant D: current malformed state (pending row with PROFILE name, no email; brain session full_name and email both = the email).
  await pool.query('delete from email_auth_challenges where user_id in (select id from users where phone=$1)', [ME]);
  await pool.query('delete from users where phone=$1', [ME]);
  await pool.query("insert into users (phone, full_name, role, status, password_hash) values ($1,$2,'agent','pending','x')", [ME, PROFILE]);
  const seedId = (await user())[0].id;
  await pool.query("delete from whatsapp_chat_sessions where purpose='brain_orchestrator'");
  await post('Agent', ME); await settle();
  await pool.query(`update whatsapp_chat_sessions set data = jsonb_set(data,'{brain,fields}', $1::jsonb) where purpose='brain_orchestrator'`, [JSON.stringify({ email: EMAIL, full_name: EMAIL })]);
  mail.outbox.length = 0;
  await post("I'm an agent", ME); await settle();
  let d = await user(); console.log('  D after typed request, rows', JSON.stringify(d));
  assert.equal(d.length, 1); assert.equal(d[0].id, seedId); assert.equal(d[0].full_name, PROFILE, 'typed shortcut did not touch the malformed row');
  // Write-boundary guard: even when the model submits against the stale malformed session, the email is never stored as the name.
  await post(EMAIL, ME); await settle();
  d = await user(); console.log('  D after email turn (model submits), rows', JSON.stringify(d));
  assert.equal(d.length, 1); assert.equal(d[0].id, seedId);
  assert.notEqual(d[0].full_name, EMAIL, 'D: email-shaped value never written as full_name');
  assert.equal(d[0].full_name, PROFILE, 'D: row unchanged by a submit that lacks a valid typed name');
  console.log('PASSED D: stale malformed session cannot write an email as the name');
  await pool.query('delete from email_auth_challenges where user_id=$1', [seedId]);
  await pool.query('update users set full_name=$2, email=null where id=$1', [seedId, PROFILE]); // back to the live pending-row shape
  // ---- Variant R: proposed reset: remove only the bad full_name from the session; row untouched; brain asks the name then submits in place.
  await pool.query("delete from whatsapp_chat_sessions where purpose='brain_orchestrator'");
  await post('Agent', ME); await settle(); await post(TYPED, ME); await settle(); mail.outbox.length = 0;
  await post(EMAIL, ME); await settle();
  d = await user(); console.log('  R after clean session + name + email, rows', JSON.stringify(d));
  assert.equal(d.length, 1); assert.equal(d[0].id, seedId, 'same row updated in place, not duplicated');
  assert.equal(d[0].full_name, TYPED); assert.equal(d[0].email, EMAIL);
  console.log('  R code emails handed to the simulated provider:', mail.outbox.length, '(informational: the code limiter is shared with the earlier D step in this same run)');
  console.log('PASSED R: in-place update of the existing pending row after a clean session');

  // Relay must not hold registration turns.
  const held = await (await fetchBefore(`${localOrigin}/api/akif-relay/pending`)).text().catch(() => '');
  console.log('  relay pending probe (informational):', held.slice(0, 80));

  // Scope: nothing to anyone else; inbound from OTHER gets no outbound.
  const before = metaSends.length; await post('hello', OTHER); await settle();
  console.log('  offenders', JSON.stringify(metaSends.filter(s => s.to !== ME)));
  assert.ok(metaSends.every(s => s.status === 'read' || s.to === ME), 'every outbound went only to the scoped number');
  assert.equal(metaSends.length, before, 'inbound from another number produced zero sends');
  console.log('PASSED C: outbound scope held, zero sends to other numbers; total sends', metaSends.length);
} finally { server?.close(); await pool?.end().catch(() => {}); globalThis.fetch = fetchBefore; }
