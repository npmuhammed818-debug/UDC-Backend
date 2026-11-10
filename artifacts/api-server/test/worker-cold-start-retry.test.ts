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

test('a worker 429 falls back to direct Groq STT immediately when configured', async () => {
  // Env must stay patched across awaits (withEnv restores when the promise is
  // created), so set and restore it by hand here.
  const keys = ['AKIF_WORKER_URL', 'AKIF_WORKER_TOKEN', 'AKIF_WORKER_MEDIA_ENABLED', 'GROQ_API_KEY', 'ELEVENLABS_API_KEY', 'AKIF_AUDIO_DIRECT_STT'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.AKIF_WORKER_URL = 'https://worker.test'; process.env.AKIF_WORKER_TOKEN = 'synthetic-token';
  process.env.AKIF_WORKER_MEDIA_ENABLED = 'true'; process.env.GROQ_API_KEY = 'synthetic-groq-key';
  delete process.env.ELEVENLABS_API_KEY; delete process.env.AKIF_AUDIO_DIRECT_STT;
  let workerCalls = 0; let groqCalls = 0;
  try {
    await withFetch(async (url) => {
      if (url.includes('worker.test')) { workerCalls++; return new Response('rate limited', { status: 429 }); }
      if (url.includes('api.groq.com')) { groqCalls++; return new Response(JSON.stringify({ text: 'synthetic direct transcript', language: 'ml' }), { status: 200 }); }
      throw new Error('unexpected url ' + url);
    }, async () => {
      const heard = await transcribeAkifAudioDetailed(audio);
      assert.deepEqual(heard, { text: 'synthetic direct transcript', language: 'mal' }, 'Groq 639-1 language maps to 639-3');
    }, []);
    assert.equal(workerCalls, 1, 'no 15-second 429 waits when the direct fallback exists');
    assert.equal(groqCalls, 1);
  } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});

test('without direct STT keys the original worker error still surfaces', async () => {
  await withEnv({ ...WORKER_ENV, GROQ_API_KEY: undefined, ELEVENLABS_API_KEY: undefined }, () => withFetch(async () => {
    return new Response('down', { status: 500 });
  }, async () => {
    await assert.rejects(() => transcribeAkifAudioDetailed(audio), /akif_audio_http_500/);
  }, []));
});

test('direct fallback can be switched off with AKIF_AUDIO_DIRECT_STT=false', async () => {
  const keys = ['AKIF_WORKER_URL', 'AKIF_WORKER_TOKEN', 'AKIF_WORKER_MEDIA_ENABLED', 'GROQ_API_KEY', 'AKIF_AUDIO_DIRECT_STT'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.AKIF_WORKER_URL = 'https://worker.test'; process.env.AKIF_WORKER_TOKEN = 'synthetic-token';
  process.env.AKIF_WORKER_MEDIA_ENABLED = 'true'; process.env.GROQ_API_KEY = 'synthetic-groq-key'; process.env.AKIF_AUDIO_DIRECT_STT = 'false';
  try {
    await withFetch(async () => new Response('down', { status: 500 }), async () => {
      await assert.rejects(() => transcribeAkifAudioDetailed(audio), /akif_audio_http_500/);
    }, []);
  } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});
