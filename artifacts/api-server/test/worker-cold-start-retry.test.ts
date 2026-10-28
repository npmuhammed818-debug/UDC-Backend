import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribeAkifAudioDetailed, synthesizeAkifSpeechTimed } from '../src/akif/intelligence/workerClient.ts';

function withEnv(patch: Record<string, string | undefined>, fn: () => unknown) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) { saved[key] = process.env[key]; if (patch[key] === undefined) delete process.env[key]; else process.env[key] = patch[key]; }
  try { return fn(); } finally { for (const key of Object.keys(patch)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
}

const WORKER_ENV = { AKIF_WORKER_URL: 'https://worker.test', AKIF_WORKER_TOKEN: 'synthetic-token', AKIF_WORKER_MEDIA_ENABLED: 'true' };

function withFetch(fn: (url: string, init: RequestInit) => Promise<Response>, run: () => Promise<unknown>, timeouts: number[]) {
  const original = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = ((ms: number) => { timeouts.push(ms); return originalTimeout.call(AbortSignal, ms); }) as typeof AbortSignal.timeout;
  globalThis.fetch = (async (url: any, init: any) => fn(String(url), init)) as typeof fetch;
  return run().finally(() => { globalThis.fetch = original; AbortSignal.timeout = originalTimeout; });
}

const timeoutError = () => new DOMException('synthetic cold start', 'TimeoutError');
const audio = { bytes: new Uint8Array([1, 2, 3]), mimeType: 'audio/ogg' };

test('a cold-start timeout on transcription is retried once with a longer budget', async () => {
  let calls = 0; const timeouts: number[] = [];
  await withEnv(WORKER_ENV, () => withFetch(async () => {
    calls++;
    if (calls === 1) throw timeoutError();
    return new Response(JSON.stringify({ text: 'synthetic transcript', language: 'eng' }), { status: 200 });
  }, async () => {
    const heard = await transcribeAkifAudioDetailed(audio);
    assert.deepEqual(heard, { text: 'synthetic transcript', language: 'eng' });
  }, timeouts));
  assert.equal(calls, 2);
  assert.deepEqual(timeouts, [25_000, 60_000], 'short first budget, long cold-start retry');
});

test('a worker 503 (provider not configured) is never retried', async () => {
  let calls = 0;
  await withEnv(WORKER_ENV, () => withFetch(async () => {
    calls++;
    return new Response('groq_not_configured', { status: 503 });
  }, async () => {
    await assert.rejects(() => transcribeAkifAudioDetailed(audio), /akif_audio_http_503/);
  }, []));
  assert.equal(calls, 1, 'configuration failures surface immediately');
});

test('two cold-start timeouts in a row still fail honestly', async () => {
  let calls = 0;
  await withEnv(WORKER_ENV, () => withFetch(async () => { calls++; throw timeoutError(); }, async () => {
    await assert.rejects(() => transcribeAkifAudioDetailed(audio), /cold start/);
  }, []));
  assert.equal(calls, 2);
});

test('speech synthesis gets the same single cold-start retry', async () => {
  let calls = 0; const timeouts: number[] = [];
  await withEnv({ AKIF_WORKER_URL: 'https://worker.test', AKIF_WORKER_TOKEN: 'synthetic-token' }, () => withFetch(async () => {
    calls++;
    if (calls === 1) throw new TypeError('synthetic socket reset');
    return new Response(new Uint8Array([9, 9, 9]), { status: 200, headers: { 'x-audio-seconds': '2' } });
  }, async () => {
    const spoken = await synthesizeAkifSpeechTimed('hello', false);
    assert.equal(spoken.bytes.length, 3);
    assert.equal(spoken.seconds, 2);
  }, timeouts));
  assert.equal(calls, 2);
  assert.deepEqual(timeouts, [30_000, 60_000]);
});
