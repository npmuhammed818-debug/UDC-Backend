import test from 'node:test';
import assert from 'node:assert/strict';
import { isBrevityRequest, isDetailRequest, trimToBrief } from '../src/whatsapp/brevity.ts';
import { udcHandbook, udcHandbookForRole } from '../src/akif/udcHandbook.ts';

test('brevity requests are detected with typos, without catching real questions', () => {
  for (const text of ['summary', 'Summary please', 'Need summery', 'summery', 'summarise', 'summarized', 'too long', 'It is too long', 'this is too much', 'too much text', 'be brief', 'shorter', 'short please', 'keep it short', 'in short', 'in brief', 'tldr', 'tl;dr', 'less text', 'make it shorter', "I don't want u to text too much"]) {
    assert.equal(isBrevityRequest(text), true, text);
  }
  for (const text of ['What is DLC?', 'Can you make it shorter for my offer?', 'How short is the delivery time?', '100 MT copper at 5900', 'Explain export insurance?', '', 'summary '.repeat(12)]) {
    assert.equal(isBrevityRequest(text), false, text);
  }
});

test('detail requests are detected and do not look like brevity requests', () => {
  for (const text of ['more detail', 'more details please', 'explain more', 'explain in detail', 'in detail', 'full answer', 'longer explanation', 'elaborate']) {
    assert.equal(isDetailRequest(text), true, text);
    assert.equal(isBrevityRequest(text), false, text);
  }
  for (const text of ['summary', 'What is DLC?', 'tell me more about CIF']) assert.equal(isDetailRequest(text), false, text);
});

test('trimToBrief keeps short replies and trims long ones to two sentences', () => {
  assert.equal(trimToBrief('Short reply.'), 'Short reply.');
  const long = 'First sentence here. Second sentence here. ' + 'word '.repeat(70);
  assert.equal(trimToBrief(long), 'First sentence here. Second sentence here.');
  const hugeSentences = 'w '.repeat(40).trim() + '. ' + 'x '.repeat(40).trim() + '.';
  const trimmed = trimToBrief(hugeSentences);
  assert.ok(trimmed.endsWith('…'));
  assert.ok(trimmed.split(/\s+/).length <= 60);
});

test('handbook carries the approved WHAT UDC IS block with confirmed claims only', () => {
  assert.match(udcHandbook, /WHAT UDC IS: UDC \(UpDownCircle\) is a WhatsApp-first trade platform/);
  assert.match(udcHandbook, /not a listing marketplace/);
  assert.match(udcHandbook, /Agents register with their name and any email and refer buyers and sellers with their invite link/);
  assert.match(udcHandbook, /Agents never see prices, payments or private documents/);
  assert.match(udcHandbook, /Contact details stay private until the right agreements and UDC approval are in place/);
  assert.match(udcHandbook, /trade questions and learning, registration, offers and requirements, matches, deals and tracking, documents, agent invites and referrals/);
  // Unconfirmed claims stay out until the owner answers: match pre-review and agent deal-status tracking.
  assert.doesNotMatch(udcHandbook, /reviews matches/);
  assert.doesNotMatch(udcHandbook, /matches UDC has reviewed/);
  assert.doesNotMatch(udcHandbook, /LOI sent|FCO sent|SPA signed/);
});

test('handbook carries the approved style rules', () => {
  assert.match(udcHandbook, /ANSWER FIRST: the first line answers the question asked/);
  assert.match(udcHandbook, /LANGUAGE LOCK: answer in the language of the user/);
  assert.match(udcHandbook, /Never mix two languages inside one answer/);
  assert.match(udcHandbook, /NO REPEATED MENUS: never end replies with a Menu hint/);
  assert.match(udcHandbook, /VOICE NOTES: if the user/);
  assert.match(udcHandbook, /never compare UDC to Alibaba or any other marketplace/);
  assert.match(udcHandbook, /LOGISTICS AWARE/);
  assert.match(udcHandbook, /I am not sure, UDC will confirm/);
});

test('role split: agents never see buyer/seller document steps, buyers never see the agent paragraph', () => {
  const agent = udcHandbookForRole('agent');
  assert.match(agent, /ACTUAL REGISTRATION WORKFLOW for this AGENT user/);
  assert.match(agent, /personal or business email, followed by manual UDC review/);
  assert.doesNotMatch(agent, /trade-license PDF/);
  assert.match(agent, /do not point agents to the Documents menu/);
  const buyer = udcHandbookForRole('buyer');
  assert.match(buyer, /ACTUAL REGISTRATION WORKFLOW for this BUYER user/);
  assert.match(buyer, /trade-license PDF/);
  assert.doesNotMatch(buyer, /personal or business email, followed by manual UDC review/);
  const seller = udcHandbookForRole('seller');
  assert.match(seller, /ACTUAL REGISTRATION WORKFLOW for this SELLER user/);
  // Unknown role keeps both paragraphs.
  assert.match(udcHandbook, /Buyers and sellers: /);
  assert.match(udcHandbook, /Agents: /);
});
