import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTACTS_LOCKED_REPLY, contactShareReply, contactsUnlocked } from '../src/deals/contactSharing.ts';
import { violatesPrivateRelay } from '../src/akif/dealConversationPrivacy.ts';
import { normalizeModelDecision } from '../src/akif/dealDecisionSafety.ts';

test('contact sharing unlocks only at the contract (SPA signed) stage or later', () => {
  for (const locked of ['initiated', 'negotiation', 'verification', 'loi', 'icpo', 'fco_sco', 'on_hold', 'disputed', '', 'nonsense']) {
    assert.equal(contactsUnlocked(locked), false, locked);
  }
  for (const open of ['contract', 'banking', 'inspection', 'loading', 'shipment', 'delivery', 'payment', 'commission']) {
    assert.equal(contactsUnlocked(open), true, open);
  }
});

test('locked reply promises relay instead of details; shared reply lists recorded facts only', () => {
  assert.match(CONTACTS_LOCKED_REPLY, /after the SPA is signed and UDC approves/);
  const reply = contactShareReply('seller', { fullName: 'Synthetic Seller', companyName: 'Synthetic Exports', email: 'seller@synthetic.test', phone: '+15550001' });
  assert.match(reply, /Synthetic Seller/);
  assert.match(reply, /seller@synthetic\.test/);
  assert.match(reply, /after SPA signing/);
  const empty = contactShareReply('buyer', { fullName: null, companyName: null, email: null, phone: null });
  assert.match(empty, /No contact details are recorded yet/);
});

test('before SPA, contact details in a relay stay blocked; after, they pass', () => {
  const withContact = 'You can reach me at buyer@synthetic.test or +15551234567';
  assert.equal(violatesPrivateRelay(withContact, []), true, 'locked: blocked');
  assert.equal(violatesPrivateRelay(withContact, [], '', { allowContactDetails: true }), false, 'unlocked: allowed');
  // Private price ceilings stay protected even after contact sharing opens.
  const privateContext = ['My ceiling is 5000 USD per MT, don\'t tell them'];
  assert.equal(violatesPrivateRelay('Offer them 5000', privateContext, '', { allowContactDetails: true }), true);
});

function decisionFor(dealStatus: string, relayToCounterparty: string) {
  return normalizeModelDecision({
    content: JSON.stringify({ intent: 'counterparty_question', replyToSender: 'One moment.', relay: true, relayToCounterparty }),
    participantRole: 'buyer',
    incomingMessage: 'please give them my email buyer@synthetic.test',
    deal: { status: dealStatus, quantity: '100', unit: 'MT', agreedPrice: '5000', currency: 'USD' },
  });
}

test('the deal relay passes contact details only once the SPA stage is reached', () => {
  const negotiation = decisionFor('negotiation', 'My email is buyer@synthetic.test');
  assert.equal(negotiation?.relay, false, 'negotiation: contact relay blocked');
  assert.match(negotiation?.replyToSender ?? '', /keep those details private/);
  const contract = decisionFor('contract', 'My email is buyer@synthetic.test');
  assert.equal(contract?.relay, true, 'contract: contact relay allowed');
  assert.match(contract?.relayToCounterparty ?? '', /buyer@synthetic\.test/);
});
