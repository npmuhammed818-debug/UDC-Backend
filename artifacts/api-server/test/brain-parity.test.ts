import test from 'node:test';
import assert from 'node:assert/strict';
import { brainBurstMs, brainAckReactionsEnabled, brainBusyWaitEnabled, brainSlowNudgeEnabled, brainVoiceEnabled, collectBurst, stripDashBreaks, sanitizeRelayReplyText, resetHumanRelay } from '../src/akif/humanRelay.ts';

const env = (over: Record<string, string>): NodeJS.ProcessEnv => ({ ...process.env, ...over });

test('parity flags default off and parse env', () => {
  const clean: NodeJS.ProcessEnv = { ...process.env };
  delete clean.AKIF_BRAIN_BURST_MS; delete clean.AKIF_BRAIN_ACK_REACTIONS;
  delete clean.AKIF_BRAIN_BUSY_WAIT; delete clean.AKIF_BRAIN_SLOW_NUDGE; delete clean.AKIF_BRAIN_VOICE;
  assert.equal(brainBurstMs(clean), 0);
  assert.equal(brainAckReactionsEnabled(clean), false);
  assert.equal(brainBusyWaitEnabled(clean), false);
  assert.equal(brainSlowNudgeEnabled(clean), false);
  assert.equal(brainVoiceEnabled(clean), false);
  assert.equal(brainBurstMs(env({ AKIF_BRAIN_BURST_MS: '3000' })), 3000);
  assert.equal(brainAckReactionsEnabled(env({ AKIF_BRAIN_ACK_REACTIONS: 'on' })), true);
  assert.equal(brainBusyWaitEnabled(env({ AKIF_BRAIN_BUSY_WAIT: 'on' })), true);
  assert.equal(brainSlowNudgeEnabled(env({ AKIF_BRAIN_SLOW_NUDGE: 'on' })), true);
  assert.equal(brainVoiceEnabled(env({ AKIF_BRAIN_VOICE: 'on' })), true);
});

test('stripDashBreaks rewrites dash sentence-breaks only', () => {
  assert.equal(stripDashBreaks('Hi - how are you'), 'Hi, how are you');
  assert.equal(stripDashBreaks('Sorry, I missed that for a moment - could you say it again?'), 'Sorry, I missed that for a moment, could you say it again?');
  assert.equal(stripDashBreaks('price is 100 - 200 rupees'), 'price is 100 - 200 rupees'); // digit after dash stays
  assert.equal(stripDashBreaks('no dashes here'), 'no dashes here');
  assert.equal(sanitizeRelayReplyText('yes -  no'), 'yes, no');
});

test('collectBurst: newest bubble takes the turn with all texts', async () => {
  resetHumanRelay();
  const first = collectBurst('p-burst-1', 'one', 30);
  const second = collectBurst('p-burst-1', 'two', 30);
  assert.equal(await first, null); // superseded bubble sends nothing
  assert.equal(await second, 'one\ntwo'); // newest sees the whole burst
});

test('collectBurst: a lone bubble proceeds with its own text', async () => {
  resetHumanRelay();
  assert.equal(await collectBurst('p-burst-2', 'hello', 5), 'hello');
});

test('collectBurst: resetHumanRelay clears pending bursts', async () => {
  resetHumanRelay();
  const pending = collectBurst('p-burst-3', 'stuck', 60);
  resetHumanRelay(); // the pending bubble's entry is gone, so it drops
  assert.equal(await pending, null);
  assert.equal(await collectBurst('p-burst-3', 'fresh', 5), 'fresh');
});

test('relay-for-everyone: allowlist supports "all"', async () => {
  const { humanRelayActiveFor, relayFallbackMs, relayAlertMode } = await import('../src/akif/humanRelay.ts');
  const env = (over: Record<string, string>): NodeJS.ProcessEnv => ({ ...process.env, AKIF_HUMAN_RELAY_ENABLED: 'true', ...over });
  assert.equal(humanRelayActiveFor('919999988888', env({ AKIF_HUMAN_RELAY_NUMBERS: 'all' })), true);
  assert.equal(humanRelayActiveFor('919999988888', env({ AKIF_HUMAN_RELAY_NUMBERS: '*' })), true);
  assert.equal(humanRelayActiveFor('919999988888', env({ AKIF_HUMAN_RELAY_NUMBERS: '917022032531' })), false);
  assert.equal(humanRelayActiveFor('917022032531', env({ AKIF_HUMAN_RELAY_NUMBERS: '917022032531' })), true);
  assert.equal(humanRelayActiveFor('919999988888', env({ AKIF_HUMAN_RELAY_NUMBERS: 'all', AKIF_HUMAN_RELAY_ENABLED: 'false' })), false);
  // One-voice launch (owner direction, 10 Nov): the fallback timer is off entirely, whatever the env says.
  assert.equal(relayFallbackMs(env({ AKIF_RELAY_FALLBACK_MS: '120000' })), 0);
  assert.equal(relayFallbackMs(env({})), 0);
  assert.equal(relayAlertMode(env({})), 'all');
  assert.equal(relayAlertMode(env({ AKIF_RELAY_ALERT_MODE: 'holds' })), 'holds');
});

test('relay fallback: safe replies auto-send only while unanswered', async () => {
  const { enqueueHumanRelay, relayFallbackReplySafe, scheduleRelayFallback, resetHumanRelay } = await import('../src/akif/humanRelay.ts');
  resetHumanRelay();
  assert.equal(relayFallbackReplySafe('Hi', 'Hello! How can I help?', []), true);
  assert.equal(relayFallbackReplySafe('menu', 'Here is what I can do.', []), true);
  assert.equal(relayFallbackReplySafe('where is my order?', 'Deal UDC-12345 shipped.', ['track_shipment']), true);
  assert.equal(relayFallbackReplySafe('where is my order?', 'Deal UDC-12345 shipped.', []), false); // tool-backed text without tools
  assert.equal(relayFallbackReplySafe('what is the price?', 'It costs 50000 rupees.', []), false);
  const held = enqueueHumanRelay({ phone: '919999988887', kind: 'text', text: 'Hi', draft: 'Hello! How can I help?' });
  let deliveredTo: string | null = null;
  scheduleRelayFallback(held, async (phone, reply) => { deliveredTo = phone + ':' + reply; return { delivered: true }; }, 20);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(deliveredTo, '919999988887:Hello! How can I help?');
  assert.ok(held.answeredAt, 'item marked answered after fallback send');
  const held2 = enqueueHumanRelay({ phone: '919999988886', kind: 'text', text: 'Hi', draft: 'Hello! How can I help?', autoAnswered: true });
  let fired = false;
  scheduleRelayFallback(held2, async () => { fired = true; return { delivered: true }; }, 20);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(fired, false, 'no fallback for already-answered items');
  resetHumanRelay();
});

test('consent notice v6 discloses team review and log hygiene', async () => {
  const { buildConsentNotice, consentVersion, CONSENT_VERSION_SUFFIX } = await import('../src/privacy/consentNotice.ts');
  const notice = buildConsentNotice('help@updowncircle.site');
  assert.equal(CONSENT_VERSION_SUFFIX, 'consent-v6');
  assert.ok(consentVersion('v0.2').endsWith('consent-v6'));
  assert.ok(notice.includes('UDC team may read chats'), 'notice discloses team review');
  assert.ok(notice.includes('never written to system logs'), 'notice discloses log hygiene');
  assert.ok(notice.includes('private vault link'), 'notice keeps the document promise');
});
