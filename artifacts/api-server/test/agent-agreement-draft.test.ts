import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentAgreementDraft } from '../src/deals/agentAgreementDraft.ts';
import { generateWhatsAppDraft, mayPrepareWhatsAppDraft, requestedWhatsAppDraft } from '../src/deals/whatsappDraft.ts';
import { buildDraftModel } from '../src/deals/draftModel.ts';
import { contactsUnlocked } from '../src/deals/contactSharing.ts';
import { UDC_DRAFT_WARNING_BOTTOM, UDC_DRAFT_WARNING_TOP } from '../src/deals/draftWarning.ts';

test('agent agreement draft stays a marked placeholder draft with the timing rule', () => {
  const draft = createAgentAgreementDraft({ dealNumber: 'UDC-TEST', date: '28 October 2026', agentName: 'Synthetic Agent' });
  assert.ok(draft.startsWith(UDC_DRAFT_WARNING_TOP));
  assert.ok(draft.endsWith(UDC_DRAFT_WARNING_BOTTOM));
  assert.match(draft, /signed only after the sale and purchase agreement/);
  assert.match(draft, /\[OWNER TO SET\]/);
  assert.match(draft, /\[LAWYER TO SET\]/);
  assert.match(draft, /creates no fee/);
  assert.match(draft, /Synthetic Agent/);
});

test('chat commands reach the agent agreement draft only by explicit request', () => {
  assert.deepEqual(requestedWhatsAppDraft('prepare agent agreement draft'), { type: 'AGENT_AGREEMENT', confirmed: false });
  assert.deepEqual(requestedWhatsAppDraft('CONFIRM DRAFT AGENT_AGREEMENT'), { type: 'AGENT_AGREEMENT', confirmed: true });
  assert.equal(requestedWhatsAppDraft('when do agents sign?'), null);
});

test('the agreement generates through the shared pipeline and renders as a model', () => {
  const terms = { dealNumber: 'UDC-TEST', date: '28 October 2026', productName: 'Copper', quantity: '100', unit: 'MT', agreedPrice: '5900', currency: 'USD', agentName: 'Synthetic Agent' };
  const draft = generateWhatsAppDraft('AGENT_AGREEMENT', terms);
  assert.match(draft, /AGENT AGREEMENT/);
  const model = buildDraftModel('AGENT_AGREEMENT', terms);
  assert.equal(model.title, 'Agent Agreement');
  assert.match(JSON.stringify(model.blocks), /signed only after the sale and purchase agreement/);
  assert.equal(mayPrepareWhatsAppDraft('AGENT_AGREEMENT', true), true, 'party side does not gate it; the webhook gates role and stage');
});

test('the stage gate mirrors the SPA-signed rule', () => {
  assert.equal(contactsUnlocked('fco_sco'), false);
  assert.equal(contactsUnlocked('contract'), true);
});
