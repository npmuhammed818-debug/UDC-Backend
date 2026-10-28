import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plainWordsAction } from '../src/whatsapp/plainWordsIntent.ts';
import { requiredDocuments } from '../src/whatsapp/documentChecklist.ts';

test('bank proof is never a checklist document and never a chat collect', () => {
  for (const role of ['buyer', 'seller']) {
    assert.equal(requiredDocuments(role).some((d) => /bank/i.test(d.key + d.label)), false, role);
  }
});

test('asking about bank details gets the fixed timing reply action', () => {
  assert.equal(plainWordsAction('bank details'), 'bank_info');
  assert.equal(plainWordsAction('bank proof'), 'bank_info');
  assert.equal(plainWordsAction('how do i give my bank details'), 'bank_info');
  assert.equal(plainWordsAction('when do i send bank proof?'), 'bank_info');
});

test("AKIF's fixed rules carry the bank-proof timing", () => {
  const handbook = readFileSync(new URL('../src/akif/udcHandbook.ts', import.meta.url), 'utf8');
  assert.match(handbook, /Bank proof is requested only just before SPA signing/);
  assert.match(handbook, /never send bank details|never ask for or accept bank details/i);
});
