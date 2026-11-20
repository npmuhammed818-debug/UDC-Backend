import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVoiceLanguage, pickVoiceLanguage } from '../src/akif/voiceLanguage.ts';
import { chooseChannel, detectUpset, voiceAutopickEnabled, voiceMomentFor } from '../src/akif/voiceMoments.ts';
import { spokenTextFor, translatedSpeechOk } from '../src/akif/voiceScript.ts';

const ON = { AKIF_VOICE_REPLIES: 'on', AKIF_VOICE_AUTOPICK: 'on' } as Record<string, string>;

test('language pick: their main language, else the voice note language, else English', () => {
  assert.equal(normalizeVoiceLanguage('Malayalam'), 'malayalam');
  assert.equal(normalizeVoiceLanguage('hin'), 'hindi');
  assert.equal(normalizeVoiceLanguage('kannada'), null);
  assert.equal(normalizeVoiceLanguage(undefined), null);
  assert.equal(pickVoiceLanguage({ mainLanguage: 'malayalam', heardLanguage: 'hindi' }), 'malayalam');
  assert.equal(pickVoiceLanguage({ mainLanguage: '', heardLanguage: 'arabic' }), 'arabic');
  assert.equal(pickVoiceLanguage({ mainLanguage: null, heardLanguage: 'eng' }), 'english');
  assert.equal(pickVoiceLanguage({}), 'english', 'unsure means English');
});

test('autopick is off by default and needs both switches', () => {
  assert.equal(voiceAutopickEnabled({}), false);
  assert.equal(voiceAutopickEnabled({ AKIF_VOICE_REPLIES: 'on' }), false);
  assert.equal(voiceAutopickEnabled({ AKIF_VOICE_AUTOPICK: 'on' }), false);
  assert.equal(voiceAutopickEnabled(ON), true);
});

test('upset detection is conservative', () => {
  assert.ok(detectUpset('I am very upset, this is the third time'));
  assert.ok(detectUpset('This is ridiculous, nobody answers'));
  assert.ok(detectUpset('What a waste of time'));
  assert.ok(!detectUpset('When will my shipment arrive?'));
  assert.ok(!detectUpset('I am not sure about the payment terms'));
  assert.ok(!detectUpset(undefined));
});

test('AKIF picks voice only for the Master Plan moments, never dates or money', () => {
  const warm = 'I completely understand, and I am right here with you. Let us sort this out together, one step at a time.';
  assert.equal(voiceMomentFor({ userText: 'I am furious about this delay', reply: warm, env: ON }), 'calming');
  const long = 'A letter of credit means the buyer bank pays the seller only when every document matches what was agreed, so both sides stay protected while the goods move from the loading port all the way to the arrival port, through inspection, paperwork and final handover at destination.';
  assert.equal(voiceMomentFor({ userText: 'what is a letter of credit', reply: long, env: ON }), 'long_explanation');
  assert.equal(voiceMomentFor({ userText: 'what is a letter of credit', reply: 'It is a bank payment guarantee.', env: ON }), null, 'short answers stay text');
  assert.equal(voiceMomentFor({ userText: 'I am furious', reply: warm, env: { AKIF_VOICE_REPLIES: 'on' } }), null, 'autopick off without the switch');
  const money = 'Your payment of 4200 USD is due on 12 November per the contract terms.';
  assert.equal(voiceMomentFor({ userText: 'I am furious about this', reply: money, env: ON }), null, 'money or dates never spoken');
  const link = 'Please open updowncircle.site to continue.';
  assert.equal(voiceMomentFor({ userText: 'I am furious', reply: link, env: ON }), null, 'links never spoken');
});

test('channel choice: mirror and explicit stay voice; autopick only adds the two moments', () => {
  assert.deepEqual(chooseChannel({ wantsVoice: true, reply: 'hi' }).channel, 'voice');
  assert.equal(chooseChannel({ wantsVoice: false, userText: 'normal question', reply: 'Short answer.', env: ON }).channel, 'text');
  assert.equal(chooseChannel({ wantsVoice: false, userText: 'this is unacceptable', reply: 'I hear you, and I will stay with this until it is fixed.', env: ON }).channel, 'voice');
});

test('translated speech checks: scripts, links, long numbers, money symbols', () => {
  assert.ok(translatedSpeechOk('നമസ്കാരം, ഞാൻ നിങ്ങളെ സഹായിക്കാം.'));
  assert.ok(!translatedSpeechOk('Call 9876543210 now'));
  assert.ok(!translatedSpeechOk('വിളിക്കൂ 9876543210'), 'Malayalam-script sentence with Latin digits blocked');
  assert.ok(!translatedSpeechOk('open updowncircle.site'));
  assert.ok(!translatedSpeechOk('pay ₹4200 today'));
  assert.ok(!translatedSpeechOk('x'.repeat(601)));
  assert.ok(!translatedSpeechOk(''));
  assert.ok(!translatedSpeechOk(null));
});

test('spoken text: English as-is; translated only when it passes; any doubt falls back to English', async () => {
  const reply = 'I hear you, and I will stay with this until it is fixed.';
  assert.deepEqual(await spokenTextFor(reply, 'english'), { text: reply, language: 'english' });
  const good = await spokenTextFor(reply, 'malayalam', async () => 'ഞാൻ കേൾക്കുന്നു, ഇത് ശരിയാക്കുന്നത് വരെ ഞാൻ ഒപ്പം ഉണ്ടാകും.');
  assert.equal(good.language, 'malayalam');
  const leaked = await spokenTextFor(reply, 'malayalam', async () => 'വിളിക്കൂ 9876543210');
  assert.deepEqual(leaked, { text: reply, language: 'english' }, 'an unsafe translation is never spoken');
  const failing = await spokenTextFor(reply, 'malayalam', async () => { throw new Error('brain down'); });
  assert.deepEqual(failing, { text: reply, language: 'english' }, 'translator failure falls back to English');
  const noTranslator = await spokenTextFor(reply, 'malayalam');
  assert.deepEqual(noTranslator, { text: reply, language: 'english' });
});
