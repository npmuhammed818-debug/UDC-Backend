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
