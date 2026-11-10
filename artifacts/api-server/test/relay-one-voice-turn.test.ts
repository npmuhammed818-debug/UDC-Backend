import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueHumanRelay, claimHumanRelay, answerClaimedHumanRelayItem,
  relayReplyCooldownActive, noteHumanRelayReplySent, relayClaimStillValid, relayReplyResetsConversation, recentRelayRepliesFor,
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

test('per-message replies: answering one item keeps the rest of the bundle with the same worker', () => {
  const PH2 = '919999777555';
  enqueueHumanRelay({ phone: PH2, kind: 'text', text: 'first question', draft: null });
  enqueueHumanRelay({ phone: PH2, kind: 'text', text: 'second question', draft: null });
  const claim = claimHumanRelay('worker-v');
  assert.ok(claim);
  const ids = claim!.claimedItemIds ?? [];
  assert.equal(ids.length, 2);
  assert.ok(answerClaimedHumanRelayItem(ids[0], 'worker-v', 'answer one'), 'first answer lands');
  // The sibling is still this worker's live claim: per-message bubbles work.
  assert.equal(relayClaimStillValid(ids[1], 'worker-v'), true);
  assert.equal(relayClaimStillValid(ids[1], 'worker-x'), false, 'another worker cannot send for it');
  assert.ok(answerClaimedHumanRelayItem(ids[1], 'worker-v', 'answer two'), 'second bubble lands');
  assert.equal(relayClaimStillValid(ids[1], 'worker-v'), false, 'answered items cannot send again');
});

test('reset guard: no repeated lines, no generic restarts mid-thread', () => {
  const PH3 = '919999777444';
  assert.equal(relayReplyResetsConversation(PH3, 'Hey! Good to hear from you.'), false, 'first contact may greet');
  noteHumanRelayReplySent(PH3, 'worker-a', 'Your offer is under review, I will update you soon.');
  assert.equal(relayReplyResetsConversation(PH3, 'Your offer is under review, I will update you soon.'), true, 'exact repeat blocked');
  assert.equal(relayReplyResetsConversation(PH3, 'Hey! Good to hear from you. What can I help you with today?'), true, 'generic restart blocked');
  assert.equal(relayReplyResetsConversation(PH3, 'Hey'), true, 'bare greeting mid-thread blocked');
  assert.equal(relayReplyResetsConversation(PH3, 'The review is done, your offer is live now.'), false, 'real continuation allowed');
  assert.ok(recentRelayRepliesFor(PH3).length > 0, 'workers see what was already said');
});
