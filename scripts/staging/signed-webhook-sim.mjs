#!/usr/bin/env node
// Simulated, signed WhatsApp-format webhook messages for STAGING daily testing.
// No real customers. Synthetic phone numbers only. Secrets come from the environment, never argv or logs.
//
//   WHATSAPP_APP_SECRET=...  node scripts/staging/signed-webhook-sim.mjs \
//     --base https://udc-staging-api.onrender.com --script scripts/staging/sim-onboarding.json [--send]
//
// Default is DRY RUN (prints the signed request shape, sends nothing). --send posts to the webhook.
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : []).filter(x => x.length));
const base = String(args.base ?? '');
const send = args.send === true;
const secret = process.env.WHATSAPP_APP_SECRET ?? '';
const DENY = /(^|\.)(udc-production|updowncircle\.(com|site))$|prod/i;
// Synthetic numbers: the reserved fictional 555-01xx range, e.g. 15555550101 only. Never a real customer or the owner's own number.
const SYNTHETIC = /^1\d{3}55501\d{2}$/;

function fail(msg) { console.error(`sim: ${msg}`); process.exit(2); }
if (!base) fail('--base is required');
const host = new URL(base).hostname;
if (DENY.test(host)) fail(`refusing to target ${host} (looks like production)`);
if (send && !host.includes('staging') && host !== 'localhost' && host !== '127.0.0.1') fail(`refusing --send to ${host}: only staging or localhost`);
if (send && secret.length < 16) fail('WHATSAPP_APP_SECRET is not set (or too short); not sending');
if (!args.script) fail('--script is required');

const script = JSON.parse(await readFile(args.script, 'utf8'));
let failures = 0;
for (const [i, step] of script.steps.entries()) {
  const from = String(step.from);
  if (!SYNTHETIC.test(from)) fail(`step ${i + 1}: "from" must be a synthetic fictional number like 15555550101`);
  const message = { id: step.id ?? `wamid.SIM-${randomUUID()}`, from, timestamp: String(Math.floor(Date.now() / 1000)),
    ...(step.interactive ? { type: 'interactive', interactive: step.interactive } : { type: 'text', text: { body: String(step.text ?? '') } }) };
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'SIM', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', contacts: [{ profile: { name: step.name ?? 'UDC Sim' }, wa_id: from }], messages: [message] } }] }] });
  const sig = secret ? `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` : 'sha256=<no secret: dry run>';
  if (!send) { console.log(`DRY ${i + 1}: POST ${base}/api/webhooks/whatsapp from=${from} text=${JSON.stringify(step.text ?? step.interactive?.type)}`); continue; }
  const res = await fetch(`${base}/api/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body });
  const ok = res.status === (step.expectStatus ?? 200);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${i + 1}: HTTP ${res.status} (expected ${step.expectStatus ?? 200}) ${step.label ?? ''}`);
  await new Promise(r => setTimeout(r, step.waitMs ?? 1500));
}
if (send) console.log(failures ? `${failures} step(s) failed` : 'all steps returned the expected status');
console.log('Note: HTTP 200 only proves the webhook accepted the message. Check replies/DB with the staging checklist.');
process.exit(failures ? 1 : 0);
