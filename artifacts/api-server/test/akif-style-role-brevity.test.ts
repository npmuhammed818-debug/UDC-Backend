import test from 'node:test';
import assert from 'node:assert/strict';
import { isBrevityRequest, isDetailRequest, trimToBrief } from '../src/whatsapp/brevity.ts';
import { udcHandbook, udcHandbookForRole, trustedGuidanceAnswer, buyerDocumentsAnswer, sellerDocumentsAnswer, agentVerificationAnswer } from '../src/akif/udcHandbook.ts';

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

test('text is always English; voice language and the no-dates-no-money voice rule are fixed policy', () => {
  assert.match(udcHandbook, /TEXT LANGUAGE: text replies are always in English/);
  assert.match(udcHandbook, /ask once, early, which language they are most comfortable in/);
  assert.match(udcHandbook, /voice may be in the customer’s own language or English/);
  assert.match(udcHandbook, /Voice never carries dates, deadlines, prices, amounts or payment details/);
  assert.doesNotMatch(udcHandbook, /LANGUAGE LOCK/);
});

test('problem behaviour rules are fixed policy', () => {
  assert.match(udcHandbook, /BEHAVIOUR IN PROBLEMS/);
  assert.match(udcHandbook, /Never guess dates, times, prices or outcomes/);
  assert.match(udcHandbook, /never decide who is right; pass each side’s exact words/);
  assert.match(udcHandbook, /Never agree prices, dates or money terms/);
  assert.match(udcHandbook, /keep payment on hold/);
  assert.match(udcHandbook, /seller does not ship until the Letter of Credit is in place/);
  assert.match(udcHandbook, /UDC checks the referral record and will confirm/);
});

test('document checklists are worldwide, role-aware and country-dependent', () => {
  assert.match(udcHandbook, /DOCUMENT CHECKLISTS \(worldwide\)/);
  assert.match(udcHandbook, /import licence, only if their country requires one/);
  assert.match(udcHandbook, /export licence or exporter ID, only if their country has one/);
  assert.match(udcHandbook, /Bank proof from both sides is asked only later, before signing the SPA/);
  assert.match(udcHandbook, /ask which country their company is registered in first/);
  assert.match(udcHandbook, /entering a deal always needs documents uploaded and verified/);
  assert.match(udcHandbook, /buyers may post requirements and see offers/);
  const docsQ = 'What documents do I need for verification?';
  assert.equal(trustedGuidanceAnswer(docsQ, 'buyer'), buyerDocumentsAnswer);
  assert.equal(trustedGuidanceAnswer(docsQ, 'seller'), sellerDocumentsAnswer);
  assert.equal(trustedGuidanceAnswer(docsQ, 'agent'), agentVerificationAnswer);
  const anyRole = trustedGuidanceAnswer(docsQ) ?? '';
  assert.match(anyRole, /Buyers: company registration or trade licence/);
  assert.match(anyRole, /Sellers: company registration certificate/);
  assert.match(buyerDocumentsAnswer, /Bank proof is only needed later, before signing the SPA/);
  assert.match(sellerDocumentsAnswer, /past export invoices or photos of your factory or products/);
});
