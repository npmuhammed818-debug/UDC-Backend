import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteOnlyOn, isAllowedPhone, HOLDING_REPLY } from '../src/whatsapp/inviteRules.ts';
import { inviteGateHandles } from '../src/whatsapp/inviteGate.ts';

const log = { warn: () => {} };
function fake() {
  const store = new Set<string>(); const sent: Array<[string, string]> = [];
  return { sent, deps: { seen: async (k: string) => store.has(k), mark: async (k: string) => { store.add(k); }, send: async (p: string, t: string) => { sent.push([p, t]); } } };
}
const env = { UDC_INVITE_ONLY: 'on', UDC_ALLOWED_PHONES: '917994133604' } as any;

test('rules', () => {
  assert.equal(inviteOnlyOn(env), true);
  assert.equal(inviteOnlyOn({} as any), false);
  assert.equal(isAllowedPhone('+91 79941 33604', env), true);
  assert.equal(isAllowedPhone('359888804562', env), false);
  assert.doesNotMatch(HOLDING_REPLY, /[-\u2013\u2014]/);
  assert.equal(HOLDING_REPLY, 'The server is busy right now. Access is currently invite only.');
});
test('stranger gets exactly one holding reply, then silence, across repeats', async () => {
  const { sent, deps } = fake();
  for (let i = 0; i < 4; i++) assert.equal(await inviteGateHandles('+4915112345678', log, deps, env), true);
  assert.equal(sent.length, 1); assert.equal(sent[0][1], HOLDING_REPLY);
});
test('allowlisted owner number passes through untouched', async () => {
  const { sent, deps } = fake();
  assert.equal(await inviteGateHandles('917994133604', log, deps, env), false);
  assert.equal(sent.length, 0);
});
test('gate off means nothing is intercepted', async () => {
  const { sent, deps } = fake();
  assert.equal(await inviteGateHandles('4915112345678', log, deps, {} as any), false);
  assert.equal(sent.length, 0);
});
test('muted number gets no holding reply even when invite gate is on', async () => {
  process.env.UDC_MUTED_PHONES = '359888804562';
  const { sent, deps } = fake();
  assert.equal(await inviteGateHandles('359888804562', log, deps, env), true);
  assert.equal(sent.length, 0);
  delete process.env.UDC_MUTED_PHONES;
});
test('format variants of a number cannot bypass the hold or the one-time guard', async () => {
  const { sent, deps } = fake();
  for (const v of ['+49 151 1234 5678', '4915112345678', '(49)15112345678']) assert.equal(await inviteGateHandles(v, log, deps, env), true);
  assert.equal(sent.length, 1);
});
test('state failure stays silent rather than sending or letting through', async () => {
  const sent: string[] = [];
  const deps = { seen: async () => { throw new Error('db'); }, mark: async () => {}, send: async (_p: string, t: string) => { sent.push(t); } };
  assert.equal(await inviteGateHandles('4915112345678', log, deps as any, env), true);
  assert.equal(sent.length, 0);
});
