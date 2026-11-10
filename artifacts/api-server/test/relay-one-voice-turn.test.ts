import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueHumanRelay, claimHumanRelay, answerClaimedHumanRelayItem,
  relayReplyCooldownActive, noteHumanRelayReplySent,
} from '../src/akif/humanRelay.ts';

const PHONE = '919999777666';

test('one claim covers the whole customer turn, one reply closes it, cooldown keeps one voice', () => {
  enqueueHumanRelay({ phone: PHONE, kind: 'voice', text: 'first voice note', draft: null });
  enqueueHumanRelay({ phone: PHONE, kind: 'voice', text: 'second voice note', draft: null });
  enqueueHumanRelay({ phone: PHONE, kind: 'text', text: 'Waiting', draft: null });
  const claim = claimHumanRelay('worker-a');
  assert.ok(claim, 'a claim is returned');
  assert.equal(claim!.phone, PHONE);
  assert.equal((claim!.claimedItemIds ?? []).length, 3, 'all three messages join the one claim');
  // A second worker gets nothing for this phone while the turn is claimed.
  const other = claimHumanRelay('worker-b');
  assert.ok(!other || other.phone !== PHONE, 'no overlapping worker on the same customer');
  // One reply answers the whole turn.
  const answered = answerClaimedHumanRelayItem(claim!.id, 'worker-a');
  assert.ok(answered, 'the claimed item answers');
  assert.equal(claimHumanRelay('worker-b'), null, 'nothing left for this phone');
  // A different sender is inside the cooldown; the same worker may multi-bubble.
  assert.equal(relayReplyCooldownActive(PHONE, 'worker-b'), true);
  assert.equal(relayReplyCooldownActive(PHONE, 'worker-a'), false);
});

test('cooldown expires and same-worker bubbles are allowed inside it', () => {
  noteHumanRelayReplySent(PHONE, 'worker-a');
  assert.equal(relayReplyCooldownActive(PHONE, 'worker-c'), true);
  assert.equal(relayReplyCooldownActive(PHONE, 'worker-a'), false);
  assert.equal(relayReplyCooldownActive(PHONE, 'worker-c', Date.now() + 21_000), false);
});
