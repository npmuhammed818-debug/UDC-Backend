import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDocumentPick } from '../src/whatsapp/docUploadIntent.ts';

test('explicit upload wording picks documents without any context', () => {
  assert.deepEqual(parseDocumentPick('upload 1', 3, false), { kind: 'some', indexes: [1] });
  assert.deepEqual(parseDocumentPick('1. I wanna upload 1', 3, false), { kind: 'some', indexes: [1] });
  assert.deepEqual(parseDocumentPick('upload 1 and 3', 3, false), { kind: 'some', indexes: [1, 3] });
  assert.deepEqual(parseDocumentPick('1 , 2 and 3 I wanna upload all of it', 3, false), { kind: 'all' });
  assert.deepEqual(parseDocumentPick('upload all', 5, false), { kind: 'all' });
  assert.deepEqual(parseDocumentPick('send me the link for all', 3, false), { kind: 'all' });
});

test('bare numbers and "all" need the list context (recent list or quoted reply)', () => {
  assert.deepEqual(parseDocumentPick('1.2.3', 3, true), { kind: 'some', indexes: [1, 2, 3] });
  assert.deepEqual(parseDocumentPick('1, 2 and 3', 3, true), { kind: 'some', indexes: [1, 2, 3] });
  assert.deepEqual(parseDocumentPick('2', 3, true), { kind: 'some', indexes: [2] });
  assert.deepEqual(parseDocumentPick('all', 3, true), { kind: 'all' });
  assert.equal(parseDocumentPick('1.2.3', 3, false), null);
  assert.equal(parseDocumentPick('2', 3, false), null);
  assert.equal(parseDocumentPick('all', 3, false), null);
});

test('non-picks and out-of-range numbers fall through to normal handling', () => {
  assert.equal(parseDocumentPick('9', 3, true), null);
  assert.equal(parseDocumentPick('see you at 5', 3, false), null);
  assert.equal(parseDocumentPick('100 MT copper', 5, false), null);
  assert.equal(parseDocumentPick('', 3, true), null);
  assert.equal(parseDocumentPick(null, 3, true), null);
});
