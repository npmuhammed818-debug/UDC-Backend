import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crisisSafetyReply } from '../src/akif/crisisSafety.ts';

test('English crisis expressions get safety support, never trade or a model answer', () => {
  for (const text of ['I want to die', 'I want to kill myself', 'how to kill yourself', 'I am suicidal', 'self-harm', "I don't want to live", 'I am cutting myself', 'I took an overdose', 'everyone is better off without me']) {
    const reply = crisisSafetyReply(text, 'staging');
    assert.ok(reply, text);
    assert.match(reply, /immediate danger/); assert.match(reply, /emergency/);
    assert.match(reply, /someone you trust/); assert.match(reply, /cannot send/);
    assert.doesNotMatch(reply, /trade|buyer|seller|Menu|guarantee|secret/);
  }
});
test('Malayalam and transliterated expressions get Malayalam support', () => {
  for (const text of ['എനിക്ക് മരിക്കണം', 'ആത്മഹത്യ ചെയ്യാൻ തോന്നുന്നു', 'എനിക്ക് ജീവിക്കാൻ തോന്നുന്നില്ല', 'ജീവിതം അവസാനിപ്പിക്കാൻ തോന്നുന്നു', 'enikku jeevikkan vayya', 'enikku marikkanam']) {
    const reply = crisisSafetyReply(text, 'staging'); assert.ok(reply, text);
    assert.match(reply, /അടിയന്തര/); assert.match(reply, /കഴിയില്ല/);
  }
});
test('concern for another person is not falsely attributed to the sender', () => {
  assert.match(crisisSafetyReply('my friend wants to kill himself', 'staging')!, /that person/);
  assert.match(crisisSafetyReply('എന്റെ സുഹൃത്ത് ആത്മഹത്യ ചെയ്യുമെന്ന് പറഞ്ഞു', 'staging')!, /ആ വ്യക്തി/);
});
test('ordinary trade, sadness, idioms and historic/educational mentions', () => {
  for (const text of ['This deal is killing me', 'The battery is dead', 'I am sad', 'Shipment failed', 'എനിക്ക് സങ്കടമുണ്ട്']) assert.equal(crisisSafetyReply(text, 'staging'), null);
  // Conservative safe support for historical/educational mentions, no harmful details.
  assert.ok(crisisSafetyReply('What is suicide prevention?', 'staging'));
});
test('production is untouched, unknown environment fails off', () => {
  for (const env of ['production', '', 'test']) assert.equal(crisisSafetyReply('I want to die', env), null);
});
test('actual webhook routes text/captions before consent and audio before reactions/AI', () => {
  const source = readFileSync(new URL('../src/routes/whatsappWebhook.ts', import.meta.url), 'utf8');
  assert.ok(source.indexOf('const crisis =') < source.indexOf('const privacyReply ='));
  const at = source.indexOf('const transcript = heard.text;');
  assert.ok(source.indexOf('const voiceCrisis =', at) < source.indexOf('reactByMeaning', at));
  assert.ok(source.indexOf('const voiceCrisis =', at) < source.indexOf('handleChatUi', at));
  assert.match(source, /deliverWhatsAppReply\(message.from, voiceCrisis, false\)/);
});
