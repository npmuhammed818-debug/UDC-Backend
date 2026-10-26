import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessageAcknowledgement } from '../src/whatsapp/messageAcknowledgement.ts';
import { sendWhatsAppText, sendWhatsAppDocument, sendWhatsAppInteractive, sendWhatsAppReaction, sendWhatsAppVoiceNote } from '../src/whatsapp/client.ts';
import { sendWhatsAppNotification } from '../src/whatsapp/notificationTransport.ts';
import { build } from 'esbuild';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AI_FALLBACK_REPLY } from '../src/akif/conversationPolicy.ts';

const unknown = { delivered: false, reason: 'provider_outcome_unknown' };
const malformed: unknown[] = [null, [], {}, { success: true }, { messages: [] },
  ...[undefined, null, 12, false, {}, [], '', ' ', 'bad\nid', 'x'.repeat(256)].map(id => ({ messages: [{ id }] })),
  { error: { code: 1 }, messages: [{ id: 'wamid.valid' }] }, { messages: [{ id: 'wamid.one' }, { id: 'wamid.two' }] }];
test('success-looking, missing, malformed and contradictory acknowledgements never prove acceptance', () => {
  for (const payload of malformed) assert.deepEqual(parseMessageAcknowledgement(payload), unknown);
  for (const id of ['wamid.synthetic', 'wamid.opaque+/=='])
    assert.deepEqual(parseMessageAcknowledgement({ messages: [{ id }] }), { delivered: true, messageId: id });
});
test('all shared Meta message clients reject successful HTTP responses without usable IDs', async t => {
  const original = globalThis.fetch, token = process.env.WHATSAPP_ACCESS_TOKEN, sender = process.env.WHATSAPP_PHONE_NUMBER_ID;
  t.after(() => { globalThis.fetch = original; for (const [k, v] of [['WHATSAPP_ACCESS_TOKEN', token], ['WHATSAPP_PHONE_NUMBER_ID', sender]]) {
    if (v === undefined) delete process.env[k!]; else process.env[k!] = v;
  } });
  process.env.WHATSAPP_ACCESS_TOKEN = 'synthetic'; process.env.WHATSAPP_PHONE_NUMBER_ID = '12345678';
  let posts = 0;
  for (const payload of malformed) {
    globalThis.fetch = async url => {
      if (String(url).endsWith('/media')) return Response.json({ id: 'synthetic-media' });
      posts++; return Response.json(payload);
    };
    const operations = [() => sendWhatsAppText('10000000001', 'synthetic'),
      () => sendWhatsAppDocument('10000000001', 'https://signed.example.invalid/file', 'synthetic.pdf'),
      () => sendWhatsAppInteractive('10000000001', { type: 'button', body: { text: 'synthetic' }, action: { buttons: [{ type: 'reply', reply: { id: 'x', title: 'Test' } }] } }),
      () => sendWhatsAppReaction('10000000001', 'wamid.inbound', '✅'),
      () => sendWhatsAppVoiceNote('10000000001', new Uint8Array([1, 2, 3]))];
    for (const operation of operations) assert.deepEqual(await operation(), unknown);
  }
  assert.equal(posts, malformed.length * 5, 'each explicit call attempts once; no hidden fallback/retry');
});
test('notification adapter explicitly returns unknown instead of delivered for malformed 2xx', async () => {
  const env = { UDC_SHIPMENT_WHATSAPP_SEND_ENABLED: 'true', WHATSAPP_ACCESS_TOKEN: 'synthetic', WHATSAPP_PHONE_NUMBER_ID: '12345678' };
  for (const payload of malformed) {
    let calls = 0;
    const result = await sendWhatsAppNotification({ phone: '10000000001', body: 'synthetic', freeForm: true }, {
      env, transport: async () => { calls++; return Response.json(payload); },
    });
    assert.deepEqual(result, unknown); assert.equal(calls, 1);
  }
});
test('legacy message transport quarantines network/5xx ambiguity instead of provoking exception-based fallback', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const token = process.env.WHATSAPP_ACCESS_TOKEN, sender = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_ACCESS_TOKEN = 'synthetic'; process.env.WHATSAPP_PHONE_NUMBER_ID = '12345678';
  t.after(() => { if (token === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN; else process.env.WHATSAPP_ACCESS_TOKEN = token;
    if (sender === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID; else process.env.WHATSAPP_PHONE_NUMBER_ID = sender; });
  for (const fail of ['timeout', 'server']) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; if (fail === 'timeout') throw Error('synthetic network loss'); return Response.json({}, { status: 503 }); };
    assert.deepEqual(await sendWhatsAppText('10000000001', 'synthetic'), unknown); assert.equal(calls, 1);
  }
});
test('ambiguous voice submission suppresses automatic text fallback without claiming delivery', async t => {
  const previous = { token: process.env.WHATSAPP_ACCESS_TOKEN, sender: process.env.WHATSAPP_PHONE_NUMBER_ID, voice: process.env.AKIF_VOICE_REPLIES, fetch: globalThis.fetch };
  process.env.WHATSAPP_ACCESS_TOKEN = 'synthetic'; process.env.WHATSAPP_PHONE_NUMBER_ID = '12345678'; process.env.AKIF_VOICE_REPLIES = 'on';
  await mkdir(new URL('../tmp/', import.meta.url), { recursive: true });
  const directory = await mkdtemp(fileURLToPath(new URL('../tmp/ack-voice-', import.meta.url)));
  t.after(async () => { globalThis.fetch = previous.fetch; await rm(directory, { recursive: true, force: true });
    for (const [key, value] of [['WHATSAPP_ACCESS_TOKEN', previous.token], ['WHATSAPP_PHONE_NUMBER_ID', previous.sender], ['AKIF_VOICE_REPLIES', previous.voice]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  });
  const output = await build({ stdin: { contents: "export {trySpeakReply} from './src/whatsapp/voiceSend';", resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
    bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'synthetic-tts', setup(b) {
      b.onResolve({ filter: /intelligence\/workerClient$/ }, () => ({ path: 'worker', namespace: 'synthetic' }));
      b.onResolve({ filter: /voicePreference$/ }, () => ({ path: 'prefs', namespace: 'synthetic' }));
      b.onLoad({ filter: /.*/, namespace: 'synthetic' }, a => ({ contents: a.path === 'prefs' ? "export const getVoiceState=async()=>'voice';export const recordNotice=async()=>true;export const VOICE_NOTICE='n';" : 'export const synthesizeAkifSpeechTimed=async()=>({bytes:new Uint8Array([1,2,3]),seconds:5});' }));
    } }] });
  await writeFile(directory + '/voice.mjs', output.outputFiles[0].text);
  let posts = 0;
  globalThis.fetch = async url => { if (String(url).endsWith('/media')) return Response.json({ id: 'synthetic-media' }); posts++; return Response.json({}); };
  const { trySpeakReply } = await import(directory + '/voice.mjs');
  assert.equal(await trySpeakReply('10000000001', AI_FALLBACK_REPLY), 'uncertain');
  assert.equal(posts, 1);
});
