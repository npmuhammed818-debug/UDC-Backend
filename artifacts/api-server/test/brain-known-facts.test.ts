import test from 'node:test';
import assert from 'node:assert/strict';
import { captureBareAnswer, knownFactsBlock } from '../src/akif/knownFacts.ts';

test('bare reply after a company question is saved as the company', () => {
  const f: Record<string, string> = {};
  const hist = [{ role: 'assistant', content: 'What is your company name?' }];
  assert.equal(captureBareAnswer(hist, 'Siman Ltd', f), 'company_name');
  assert.equal(f.company_name, 'Siman Ltd');
});
test('bare reply after a name question is saved as full name, yes/no is not', () => {
  const f: Record<string, string> = {};
  const hist = [{ role: 'assistant', content: 'The only step left is a quick registration. May I have your full name for it?' }];
  assert.equal(captureBareAnswer(hist, 'yes', f), null);
  assert.equal(captureBareAnswer(hist, 'Aleksandar Ivanov', f), 'full_name');
});
test('known facts block lists saved fields and a typed email, never re-ask', () => {
  const b = knownFactsBlock({ product: 'TSP', _x: 'hidden' }, [{ role: 'user', content: 'mail me at aleksandar.ivanov@siman.bg' }], 'ok', null);
  assert.match(b, /KNOWN FACTS/); assert.match(b, /TSP/); assert.match(b, /siman\.bg/); assert.doesNotMatch(b, /hidden/);
});

test('bare reply that is a request is never stored as company or country', () => {
  const f: Record<string, string> = {};
  const hist = [{ role: 'assistant', content: 'What is your registered company name?' }];
  assert.equal(captureBareAnswer(hist, 'Pls explain in Malayalam', f), null);
  assert.equal(f.company_name, undefined);
  assert.equal(captureBareAnswer(hist, 'Siman Ltd', f), 'company_name');
  const g: Record<string, string> = {};
  const hist2 = [{ role: 'assistant', content: 'Which country are you based in?' }];
  assert.equal(captureBareAnswer(hist2, 'Tell me my status', g), null);
  assert.equal(g.country, undefined);
});
