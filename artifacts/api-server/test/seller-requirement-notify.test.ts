import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  asksForOpenRequirements, formatQuantity, openRequirementsReply, requirementNotifyText,
  REQUIREMENT_INTEREST_RECORDED, REQUIREMENT_INTEREST_REPEAT, REQUIREMENT_PASS_REPLY,
} from '../src/marketplace/sellerRequirementText.ts';

test('seller notification carries the requirement only, never buyer identity', () => {
  const text = requirementNotifyText(
    { quantity: '25000.000000', unit: 'MT', destination: 'Jebel Ali', preferredIncoterm: 'CIF' },
    'Copper cathode',
  );
  assert.equal(text, 'A buyer wants Copper cathode: 25,000 MT to Jebel Ali, CIF. Interested?');
  assert.doesNotMatch(text, /buyer@|Ltd|LLC|company|name/i);
  assert.equal(requirementNotifyText({ quantity: '100', unit: 'MT' }, 'Urea'), 'A buyer wants Urea: 100 MT. Interested?');
});

test('formatQuantity handles drizzle numeric strings and junk', () => {
  assert.equal(formatQuantity('5900.50'), '5,900.5');
  assert.equal(formatQuantity('not-a-number'), 'not-a-number');
});

test('open-requirements phrasing is detected narrowly', () => {
  for (const text of ['Any buyers for my product?', 'are there buyers for my products', 'any buyers?', 'Any open requirements for me?']) {
    assert.equal(asksForOpenRequirements(text), true, text);
  }
  for (const text of ['What is CIF?', 'I want to buy copper', 'show me buyers list with names', null, '']) {
    assert.equal(asksForOpenRequirements(text), false, String(text));
  }
});

test('open-requirements replies never name buyers', () => {
  assert.match(openRequirementsReply(0), /No open buyer requirements/);
  assert.match(openRequirementsReply(1), /1 open buyer requirement matches/);
  assert.match(openRequirementsReply(3), /3 open buyer requirements match/);
  assert.match(openRequirementsReply(3), /UDC reviews each one/);
});

test('seller replies use the approved wording', () => {
  assert.match(REQUIREMENT_INTEREST_RECORDED, /UDC reviews this match/);
  assert.match(REQUIREMENT_INTEREST_RECORDED, /documents must be verified before a deal starts/);
  assert.match(REQUIREMENT_INTEREST_REPEAT, /already showed interest/);
  assert.match(REQUIREMENT_PASS_REPLY, /No problem/);
});

test('wiring: sweep notifies sellers and chat handles the Interested buttons', () => {
  const sweep = readFileSync(new URL('../src/marketplace/automaticMatching.ts', import.meta.url), 'utf8');
  assert.match(sweep, /notifyMatchingSellers\(request\.id\)/);
  const chat = readFileSync(new URL('../src/whatsapp/chatUi.ts', import.meta.url), 'utf8');
  assert.match(chat, /udc:req:\(interested\|pass\)/);
  assert.match(chat, /respondToRequirementInterest/);
  assert.match(chat, /asksForOpenRequirements/);
});
