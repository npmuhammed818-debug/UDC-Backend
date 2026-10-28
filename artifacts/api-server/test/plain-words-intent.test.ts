import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainWordsAction } from '../src/whatsapp/plainWordsIntent.ts';

test('plain words map to the same actions as the menu buttons', () => {
  // Every menu item, reachable by just saying it.
  assert.equal(plainWordsAction('my deals'), 'deals');
  assert.equal(plainWordsAction('My deals!'), 'deals');
  assert.equal(plainWordsAction('show me my deals'), 'deals');
  assert.equal(plainWordsAction('assigned deals'), 'deals');
  assert.equal(plainWordsAction('new requirement'), 'requirement');
  assert.equal(plainWordsAction('I want to buy copper'), 'requirement');
  assert.equal(plainWordsAction('buy products'), 'requirement');
  assert.equal(plainWordsAction('new offer'), 'offer');
  assert.equal(plainWordsAction('I wanna sell my rice'), 'offer');
  assert.equal(plainWordsAction('add product'), 'offer');
  assert.equal(plainWordsAction('request a meeting'), 'meeting');
  assert.equal(plainWordsAction('my profile'), 'profile');
  assert.equal(plainWordsAction('edit my details'), 'edit_profile');
  assert.equal(plainWordsAction('change my role'), 'change_role');
  assert.equal(plainWordsAction('verification status'), 'verification');
  assert.equal(plainWordsAction('am i verified?'), 'verification');
  assert.equal(plainWordsAction('track my shipment'), 'track');
  assert.equal(plainWordsAction('where is my order?'), 'track');
  // A tracking number after "track" goes to the live carrier lookup.
  assert.equal(plainWordsAction('track 1Z999AA10123456784'), 'tracknum:1Z999AA10123456784');
  assert.equal(plainWordsAction('track shipment rr123456789in'), 'tracknum:RR123456789IN');
  assert.equal(plainWordsAction('track my order 1234567890'), 'tracknum:1234567890');
  assert.equal(plainWordsAction('tracking number AB-123-456CD'), 'tracknum:AB-123-456CD');
  // Number-less tracking phrases and plain words keep their old meaning.
  assert.equal(plainWordsAction('track orders'), null);
  assert.equal(plainWordsAction('track status'), null);
  assert.equal(plainWordsAction('my documents'), 'documents');
  assert.equal(plainWordsAction('document status'), 'documents');
  assert.equal(plainWordsAction('my invite link'), 'invite');
  assert.equal(plainWordsAction('my referrals'), 'referrals');
  assert.equal(plainWordsAction('my commissions'), 'commissions');
  assert.equal(plainWordsAction('my earnings'), 'commissions');
  assert.equal(plainWordsAction('ask akif'), 'ask');
});

test('upload asks send a private link right away - named document or all missing', () => {
  assert.equal(plainWordsAction('upload my tax id'), 'doc:upload:tax_id');
  assert.equal(plainWordsAction('I want to upload my trade licence'), 'doc:upload:company_registration');
  assert.equal(plainWordsAction('send my gst certificate'), 'doc:upload:tax_id');
  assert.equal(plainWordsAction('upload import licence'), 'doc:upload:import_licence');
  assert.equal(plainWordsAction('I wanna upload docs'), 'doc:upload:all');
  assert.equal(plainWordsAction('I want to upload my documents'), 'doc:upload:all');
  assert.equal(plainWordsAction('how do I upload my documents?'), 'doc:upload:all');
  assert.equal(plainWordsAction('upload link'), 'doc:upload:all');
  assert.equal(plainWordsAction('I want to upload'), 'doc:upload:all');
});

test('ordinary chat, questions and deal references are never hijacked', () => {
  assert.equal(plainWordsAction('Hello'), null);
  assert.equal(plainWordsAction('I would like to learn about UDC'), null);
  assert.equal(plainWordsAction('what documents do I need for importing rice?'), null);
  assert.equal(plainWordsAction('tell me about my deals options'), null);
  assert.equal(plainWordsAction('deal UDC-2026-0001'), null);
  assert.equal(plainWordsAction('100 MT copper'), null);
  assert.equal(plainWordsAction('send me the invoice when you can'), null);
  assert.equal(plainWordsAction('2'), null);
  assert.equal(plainWordsAction('ok'), null);
  assert.equal(plainWordsAction(undefined), null);
  assert.equal(plainWordsAction(''), null);
});
