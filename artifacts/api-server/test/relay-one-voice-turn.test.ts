import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueHumanRelay, claimHumanRelay, answerClaimedHumanRelayItem,
  relayReplyCooldownActive, noteHumanRelayReplySent, relayClaimStillValid, relayReplyResetsConversation, recentRelayRepliesFor,
  isAcknowledgementText, relayThreadFor, markHumanRelayAnswered, __clearRelayMemoryForTests,
  stickyWorkerFor,
} from '../src/akif/humanRelay.ts';

const PHONE = '919999777666';

test('one claim covers the whole customer turn, one reply closes it, cooldown keeps one voice', () => {
  enqueueHumanRelay({ phone: PHONE, kind: 'voice', text: 'first voice note', draft: null });
  enqueueHumanRelay({ phone: PHONE, kind: 'voice', text: 'second voice note', draft: null });
  enqueueHumanRelay({ phone: PHONE, kind: 'text', text: 'Waiting', draft: null });
  // Voice items belong to the voice lane (workers 1 and 2) only.
  assert.equal(claimHumanRelay('worker-a'), null, 'a text worker never sees voice items');
  const claim = claimHumanRelay('1');
  assert.ok(claim, 'a claim is returned');
  assert.equal(claim!.phone, PHONE);
  assert.equal((claim!.claimedItemIds ?? []).length, 2, 'the voice messages join the one voice claim');
  // A second worker gets nothing for this phone while the turn is claimed.
  const other = claimHumanRelay('worker-b');
  assert.ok(!other || other.phone !== PHONE, 'no overlapping worker on the same customer');
  // One reply answers the whole turn.
  const answered = answerClaimedHumanRelayItem(claim!.id, '1');
  assert.ok(answered, 'the claimed item answers');
  assert.equal(claimHumanRelay('worker-b'), null, 'nothing left for this phone');
  // A different sender is inside the cooldown; the same worker may multi-bubble.
  assert.equal(relayReplyCooldownActive(PHONE, 'worker-b'), true);
  assert.equal(relayReplyCooldownActive(PHONE, '1'), false);
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

test('acks like "I see" are acknowledgements, not questions', () => {
  for (const a of ['I see', 'I see.', 'understood', 'makes sense', 'right', 'sounds good', 'ah ok']) {
    assert.equal(isAcknowledgementText(a), true, a);
  }
  assert.equal(isAcknowledgementText('Tell me more about the commission'), false);
});

test('meaning-level restatement of recent answers is blocked (9:52-9:55 sequence)', () => {
  __clearRelayMemoryForTests();
  const phone = '919999111222';
  // The two answers that actually went out at 9:53 and 9:54.
  noteHumanRelayReplySent(phone, 'worker-1', 'On commission, we only earn when a deal actually closes. The exact rates are not fixed yet. If you want, I can have the team confirm the current terms with you before anything moves forward.');
  noteHumanRelayReplySent(phone, 'worker-1', 'About dealing directly: yes, buyer and seller deal directly. We just introduce them and help with the paperwork. An agent only comes in if they brought one of the two to us. Which part should I explain more?');
  // The 9:55 restatement after "I see" must be rejected.
  assert.equal(relayReplyResetsConversation(phone, 'On commission, we only earn when a deal closes. Rates are not fixed yet. Buyer and seller deal directly, we just introduce them and help with the paperwork. An agent only comes in if they brought one of the two to us.'), true, 'restatement blocked');
  // A short moving-on follow-up and a genuinely new answer pass.
  assert.equal(relayReplyResetsConversation(phone, 'Great. Ping me whenever you want more details.'), false, 'moving-on ack allowed');
  assert.equal(relayReplyResetsConversation(phone, 'The registration fee comes back to you if the deal falls through.'), false, 'new answer allowed');
});

test('phone-only sends hold other workers for the whole claim window', () => {
  __clearRelayMemoryForTests();
  const phone = '919999333444';
  noteHumanRelayReplySent(phone, 'worker-1', 'First answer');
  assert.equal(relayReplyCooldownActive(phone, 'worker-1', Date.now(), true), false, 'same worker may multi-bubble');
  assert.equal(relayReplyCooldownActive(phone, 'worker-2', Date.now() + 25_000, true), true, 'second worker blocked past the short window');
  assert.equal(relayReplyCooldownActive(phone, 'worker-2', Date.now() + 25_000, false), false, 'item-based replies keep the short window');
  assert.equal(relayReplyCooldownActive(phone, 'worker-2', Date.now() + 95_000, true), false, 'window ends');
});

test('claim and thread carry the full conversation, oldest first', () => {
  __clearRelayMemoryForTests();
  const phone = '919999555666';
  enqueueHumanRelay({ phone, kind: 'text', text: 'hello, I want to join', draft: null });
  const first = claimHumanRelay('worker-8')!;
  answerClaimedHumanRelayItem(first.id, 'worker-8', 'Happy to help you join. Are you an agent, buyer or seller?');
  enqueueHumanRelay({ phone, kind: 'text', text: 'agent only', draft: null });
  enqueueHumanRelay({ phone, kind: 'text', text: 'what documents do you need', draft: null });
  const claim = claimHumanRelay('worker-8')!;
  assert.equal((claim.claimedItemIds ?? []).length, 2, 'both new messages join the claim');
  const thread = claim.thread ?? [];
  assert.equal(thread.length, 4, 'full thread: question, answer, both new messages');
  assert.equal(thread[0].from, 'customer');
  assert.equal(thread[0].text, 'hello, I want to join');
  assert.equal(thread[1].from, 'akif');
  assert.equal(thread[2].from, 'customer');
  assert.equal(thread[2].text, 'agent only');
  assert.equal(thread[3].from, 'customer');
  assert.equal(thread[3].text, 'what documents do you need');
  assert.equal(relayThreadFor(phone).length, 4);
});

test('sticky worker: the answering worker keeps the customer until idle', () => {
  __clearRelayMemoryForTests();
  const phoneA = '919999000111';
  const phoneB = '919999000222';
  // Intake lane (3-5) answers customer A's first turn.
  enqueueHumanRelay({ phone: phoneA, kind: 'text', text: 'hi, tell me about joining', draft: null });
  assert.equal(claimHumanRelay('6'), null, 'the ongoing lane never takes a first message');
  const claimA = claimHumanRelay('3')!;
  answerClaimedHumanRelayItem(claimA.id, '3', 'Happy to help. Are you an agent, buyer or seller?');
  // Customer A replies: the chat is ongoing now, so the ongoing lane owns it.
  enqueueHumanRelay({ phone: phoneA, kind: 'text', text: 'agent only', draft: null });
  assert.equal(claimHumanRelay('3'), null, 'the intake lane leaves ongoing chats');
  const again = claimHumanRelay('6')!;
  assert.equal(again.phone, phoneA, 'the ongoing lane picks up the continuing chat');
  answerClaimedHumanRelayItem(again.id, '6', 'Great, agents are welcome.');
  assert.equal(stickyWorkerFor(phoneA), '6', 'worker 6 owns customer A now');
  // Customer A replies again: only the sticky worker may take it.
  enqueueHumanRelay({ phone: phoneA, kind: 'text', text: 'how do I start', draft: null });
  assert.equal(claimHumanRelay('7'), null, 'worker 7 cannot take a sticky customer');
  const kept = claimHumanRelay('6')!;
  assert.equal(kept.phone, phoneA, 'worker 6 keeps customer A');
  // Parallel chats: worker 7 is free to own customer B (B already has a recent reply).
  noteHumanRelayReplySent(phoneB, '7', 'earlier reply');
  enqueueHumanRelay({ phone: phoneB, kind: 'text', text: 'I want to sell cashew', draft: null });
  assert.equal(claimHumanRelay('6'), null, 'worker 6 cannot take a sticky customer');
  const claimB = claimHumanRelay('7')!;
  assert.equal(claimB.phone, phoneB, 'worker 7 keeps their own customer');
  // After the sticky worker goes idle, anyone may pick the customer up.
  const idleFuture = Date.now() + 11 * 60 * 1000;
  assert.equal(stickyWorkerFor(phoneA, idleFuture), undefined, 'stickiness expires when idle');
});
