import test from 'node:test';
import assert from 'node:assert/strict';
import { emailRecipientAllowed, assertEmailFreeze } from '../src/channels/emailFreeze.ts';
import { sendRelayEmail, buildRelayEmailPayload } from '../src/channels/emailOutbound.ts';
import { sendEmailRelayAnswer } from '../src/channels/emailRelaySend.ts';
import { sendRelayHeldAlert } from '../src/akif/relayAlertEmail.ts';
import { createResendAuthSender } from '../src/auth/resendAuthProvider.ts';

test('only the owner mailbox and its plus aliases pass', () => {
  for (const a of ['npmuhammed818@gmail.com', 'NPMuhammed818+wa1@gmail.com']) assert.equal(emailRecipientAllowed(a), true);
  for (const a of ['', null, undefined, 'a@b.com', 'npmuhammed818@gmail.com.evil.com', 'x+npmuhammed818@gmail.com', 'npmuhammed818@gmail.co', 'npmuhammed818+a@gmail.com,b@c.com', 'aleksandar.ivanov@siman.bg']) assert.equal(emailRecipientAllowed(a as any), false);
  assert.throws(() => assertEmailFreeze(['npmuhammed818@gmail.com', 'c@d.com']), /email_freeze/);
  assert.throws(() => assertEmailFreeze([]), /email_freeze/);
});
test('real transport refuses a customer before any network call', async () => {
  let called = 0;
  const fetchImpl = (async () => { called++; return new Response('{}'); }) as any;
  const payload = buildRelayEmailPayload({ to: 'customer@example.com', text: 'hi' }, {});
  for (const deps of [{ config: null, resendApiKey: 're_abcdefghij', fetchImpl }, { config: { host: 'h', port: 465, secure: true, user: 'u', pass: 'p' } }]) {
    await assert.rejects(sendRelayEmail(payload, deps as any), /email_freeze_recipient_blocked/);
  }
  assert.equal(called, 0);
});
test('answer to a customer becomes a draft, never a send', async () => {
  const drafts: any[] = []; let sent = 0;
  const ports = { findLatestLiveThread: async () => ({ subject: 's' }), recordSent: async () => { sent++; }, recordDraft: async (d: any) => { drafts.push(d); } };
  const r = await sendEmailRelayAnswer({ to: 'customer@example.com', text: 'x' }, ports as any, { config: null, resendApiKey: 're_abcdefghij' });
  assert.equal(r.delivered, true); assert.equal(sent, 0); assert.equal(drafts.length, 1);
});
test('held alert only to the owner mailbox', async () => {
  const env = { AKIF_RELAY_ALERT_EMAIL: 'x@customer.com', RESEND_API_KEY: 're_abcdefghij', UDC_AUTH_EMAIL_FROM: 'a@b.com' } as any;
  const orig = globalThis.fetch; let called = 0; globalThis.fetch = (async () => { called++; return new Response('{}'); }) as any;
  try { assert.equal(await sendRelayHeldAlert({ phone: '1', kind: 'text', text: 't' }, env), false); assert.equal(called, 0); } finally { globalThis.fetch = orig; }
});
test('auth OTP email to a customer is refused on the real transport', async () => {
  const orig = globalThis.fetch; let called = 0; globalThis.fetch = (async () => { called++; return new Response('{}'); }) as any;
  try {
    const send = createResendAuthSender({ apiKey: 're_abcdefghij1234', from: 'UDC <no-reply@updowncircle.site>', verifiedDomain: 'updowncircle.site', idempotencySecret: 'x'.repeat(40) } as any);
    await assert.rejects(send({ to: 'customer@example.com', code: '123456', purpose: 'verify_email' as any, expiresAt: new Date(Date.now() + 600000) }, new AbortController().signal));
    assert.equal(called, 0);
  } finally { globalThis.fetch = orig; }
});
