import test from 'node:test';
import assert from 'node:assert/strict';
import { createSellerContractDraft } from '../src/deals/sellerContractDraft.ts';
import { mayPrepareWhatsAppDraft, requestedWhatsAppDraft } from '../src/deals/whatsappDraft.ts';

test('seller contract carries the 28 Oct decisions with placeholders only', () => {
  const draft = createSellerContractDraft({ dealNumber: 'UDC-TEST-1', date: '2026-10-28', sellerName: 'Synthetic Seller LLC' });
  assert.match(draft, /SELLER PLATFORM CONTRACT/);
  assert.match(draft, /including any later direct transaction with that buyer/);
  assert.match(draft, /\[OWNER TO SET\]/);
  assert.match(draft, /\[LAWYER TO SET\]/);
  assert.match(draft, /revealed only after the SPA .* signed and UDC has approved/i);
  assert.match(draft, /only after the SPA is signed/);
  assert.match(draft, /NOT LEGAL ADVICE/);
  assert.match(draft, /creates no fee until those terms are completed and signed/);
  assert.match(draft, /Synthetic Seller LLC/);
  assert.match(draft, /\[BUYER LEGAL NAME - REVEALED ONLY AFTER SPA SIGNING AND UDC APPROVAL\]/);
});

test('seller contract is seller-only and needs an explicit command', () => {
  assert.equal(mayPrepareWhatsAppDraft('SELLER_CONTRACT', false), true);
  assert.equal(mayPrepareWhatsAppDraft('SELLER_CONTRACT', true), false);
  assert.deepEqual(requestedWhatsAppDraft('create a SELLER_CONTRACT draft'), { type: 'SELLER_CONTRACT', confirmed: false });
  assert.deepEqual(requestedWhatsAppDraft('confirm draft SELLER_CONTRACT'), { type: 'SELLER_CONTRACT', confirmed: true });
  assert.equal(requestedWhatsAppDraft('what is a seller contract?'), null);
});
