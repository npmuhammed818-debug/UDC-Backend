import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { guardOutboundText, hasUnresolvedPlaceholder } from '../src/akif/outboundGuard.ts';
import { parseVoiceRequest } from '../src/akif/voiceConsent.ts';
import { AI_FALLBACK_REPLY } from '../src/akif/conversationPolicy.ts';

test('placeholder markers never reach a customer', () => {
  for (const bad of [
    '1 - Company Registration: <link1> 2 - Tax ID: <link2>',
    'Open <link> to upload',
    'Here is your file: [link]',
    'Upload at [url1] please',
    'See {link} for details',
    '1 - Company Registration: [Upload Link]',
    'Click [Upload link] to continue',
    'Open <your link here> now',
    'Use [document link] please',
    'The code is [code]',
  ]) assert.ok(hasUnresolvedPlaceholder(bad), bad);
  for (const ok of [
    'Sure, a DLC is a bank payment guarantee.',
    'I am here with you, let us fix this together.',
    'Costs 450 USD per MT as a rough example.',
    'You wrote <3 and that is fine',
    'Send "Menu" any time.',
    'DLC means the bank pays when documents match.',
  ]) assert.ok(!hasUnresolvedPlaceholder(ok), ok);
});

test('a guarded reply becomes the honest fallback, marked for a safe log', () => {
  const guarded = guardOutboundText('1 - Company Registration: <link1>');
  assert.equal(guarded.replaced, true);
  assert.equal(guarded.text, AI_FALLBACK_REPLY);
  assert.ok(!hasUnresolvedPlaceholder(guarded.text));
  const clean = guardOutboundText('A normal helpful reply.');
  assert.deepEqual(clean, { text: 'A normal helpful reply.', replaced: false });
});

test('explicit voice requests cover the phrases a real user types', () => {
  for (const yes of [
    'send me a voice msg', 'Send me a voice message', 'send me a voice note',
    'can you send me a voice msg', 'Could you send me a voice note',
    'send me a voice', 'reply in voice', 'answer with a voice message',
  ]) assert.ok(parseVoiceRequest(yes), yes);
  for (const no of [
    'what is a voice message?', 'send me a voice msg about prices',
    'voice messages are not working', 'please send me the document',
  ]) assert.ok(!parseVoiceRequest(no), no);
});

test('the guard is wired into the one outbound helper, and the brain knows it can speak', async () => {
  const w = await readFile(new URL('../src/routes/whatsappWebhook.ts', import.meta.url), 'utf8');
  assert.ok(w.includes('guardOutboundText(body)'), 'every outbound text passes the placeholder guard');
  const g = await readFile(new URL('../src/whatsapp/guidance.ts', import.meta.url), 'utf8');
  assert.ok(g.includes('CAN send voice replies'), 'the brain never claims it cannot send voice');
  assert.ok(g.includes('Never invent links'), 'the brain is told not to invent placeholders');
  assert.ok(w.includes('explicitVoice'), 'a broken voice promise is explained honestly in text');
  assert.ok(w.includes('Voice is not working just now'), 'technical voice failure is named');
  assert.ok(w.includes('must stay in writing'), 'privacy-blocked voice is named');
});
