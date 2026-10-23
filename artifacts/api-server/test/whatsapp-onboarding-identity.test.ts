import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { guidedChatPhoneHash } from '../src/whatsapp/phoneFingerprint.ts';

test('guided registration and one-time WhatsApp resets use one identical session hash', async () => {
  const previousSecret = process.env.WHATSAPP_APP_SECRET;
  process.env.WHATSAPP_APP_SECRET = 'synthetic-app-secret-for-unit-testing';
  try {
    const phone = '919999999997';
    const expected = createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
      .update('UDC_GUIDED_CHAT_V1\0' + phone)
      .digest('hex');
    assert.equal(guidedChatPhoneHash(phone), expected);
    assert.notEqual(guidedChatPhoneHash('919999999996'), expected);
    assert.notEqual(guidedChatPhoneHash(phone), createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
      .update('UDC_GUIDED_CHAT_V1\\0' + phone)
      .digest('hex'), 'a literal backslash-zero leaves stale registration sessions');
    const guided = await readFile(new URL('../src/whatsapp/guidedChat.ts', import.meta.url), 'utf8');
    const privacy = await readFile(new URL('../src/privacy/whatsappPrivacyGate.ts', import.meta.url), 'utf8');
    assert.match(guided, /phoneHash = guidedChatPhoneHash/);
    assert.match(privacy, /guidedChatHash = guidedChatPhoneHash\(phone\)/);
  } finally {
    if (previousSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = previousSecret;
  }
});

test('guided session fingerprints require a configured strong key', () => {
  const previousSecret = process.env.WHATSAPP_APP_SECRET;
  try {
    delete process.env.WHATSAPP_APP_SECRET;
    assert.throws(() => guidedChatPhoneHash('919999999997'), /chat_draft_signing_unavailable/);
    process.env.WHATSAPP_APP_SECRET = 'short';
    assert.throws(() => guidedChatPhoneHash('919999999997'), /chat_draft_signing_unavailable/);
  } finally {
    if (previousSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = previousSecret;
  }
});
