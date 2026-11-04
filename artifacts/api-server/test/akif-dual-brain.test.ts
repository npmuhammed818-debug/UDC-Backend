import test from 'node:test';
import assert from 'node:assert/strict';
import { isDualBrainEnabled, runDualBrainReply } from '../src/akif/intelligence/dualBrain.ts';
import { isGeminiConfigured, runGeminiChat, geminiModel } from '../src/akif/intelligence/geminiClient.ts';

async function withEnv(patch: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) { saved[key] = process.env[key]; if (patch[key] === undefined) delete process.env[key]; else process.env[key] = patch[key]; }
  try { await fn(); } finally { for (const key of Object.keys(patch)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
}

test('dual brain is off by default and on only for an explicit flag', () => {
  withEnv({ AKIF_DUAL_BRAIN: undefined }, () => assert.equal(isDualBrainEnabled(), false));
  withEnv({ AKIF_DUAL_BRAIN: 'off' }, () => assert.equal(isDualBrainEnabled(), false));
  withEnv({ AKIF_DUAL_BRAIN: 'on' }, () => assert.equal(isDualBrainEnabled(), true));
});

test('easy turn: a valid fast draft goes out, the deep brain is never called', async () => {
  let deepCalls = 0;
  const out = await runDualBrainReply('m', 's', { hardTurn: false, timeoutMs: 5000, validate: () => true }, {
    fast: async () => ({ content: 'fast draft' }),
    deep: async () => { deepCalls += 1; return { content: 'deep answer' }; },
  });
  assert.equal(out.content, 'fast draft');
  assert.equal(out.brain, 'fast');
  assert.equal(out.deepChecked, false);
  assert.equal(deepCalls, 0);
});

test('easy turn with a bad draft: deep writes a lesson, fast retries once with it', async () => {
  const fastSystems: Array<string | undefined> = [];
  let fastCalls = 0;
  const out = await runDualBrainReply('m', 'rules', { hardTurn: false, timeoutMs: 5000, validate: (r) => r.includes('good') }, {
    fast: async (_m, system) => { fastCalls += 1; fastSystems.push(system); return { content: fastCalls === 1 ? 'bad draft' : 'good retry' }; },
    deep: async () => ({ content: '{"ok":false,"lesson":"be warmer"}' }),
  });
  assert.equal(out.content, 'good retry');
  assert.equal(out.brain, 'fast-retry');
  assert.equal(out.deepChecked, true);
  assert.equal(out.lesson, 'be warmer');
  assert.equal(fastCalls, 2);
  assert.match(fastSystems[1] ?? '', /Lesson: be warmer/);
});

test('easy turn with a bad draft and a bad retry: the deep brain answers', async () => {
  const out = await runDualBrainReply('m', 's', { hardTurn: false, timeoutMs: 5000, validate: () => false }, {
    fast: async () => ({ content: 'bad' }),
    deep: async () => ({ content: 'deep answer' }),
  });
  assert.equal(out.content, 'deep answer');
  assert.equal(out.brain, 'deep');
  assert.equal(out.deepChecked, true);
});

test('a checker that answers prose still yields a lesson; a checker failure yields none', async () => {
  const prose = await runDualBrainReply('m', 's', { hardTurn: false, timeoutMs: 5000, validate: (r) => r === 'good' }, {
    fast: (() => { let n = 0; return async () => ({ content: ++n === 1 ? 'bad' : 'good' }); })(),
    deep: async () => ({ content: 'add a condolence first' }),
  });
  assert.equal(prose.lesson, 'add a condolence first');
  const failing = await runDualBrainReply('m', 's', { hardTurn: false, timeoutMs: 5000, validate: (r) => r === 'good' }, {
    fast: (() => { let n = 0; return async () => ({ content: ++n === 1 ? 'bad' : 'good' }); })(),
    deep: async () => { throw new Error('checker down'); },
  });
  assert.equal(failing.lesson, null);
  assert.equal(failing.brain, 'fast-retry');
});

test('hard turn: both brains run from the same moment and the deep answer wins', async () => {
  const order: string[] = [];
  const out = await runDualBrainReply('m', 's', { hardTurn: true, timeoutMs: 5000 }, {
    fast: async () => { order.push('fast-start'); await new Promise((r) => setTimeout(r, 30)); order.push('fast-end'); return { content: 'fast draft' }; },
    deep: async () => { order.push('deep-start'); await new Promise((r) => setTimeout(r, 5)); order.push('deep-end'); return { content: 'deep answer' }; },
  });
  assert.equal(out.content, 'deep answer');
  assert.equal(out.brain, 'deep');
  assert.deepEqual(order.slice(0, 2), ['fast-start', 'deep-start']);
});

test('hard turn: deep failure falls back to the fast draft; both failing throws', async () => {
  const fallback = await runDualBrainReply('m', 's', { hardTurn: true, timeoutMs: 5000 }, {
    fast: async () => ({ content: 'fast draft' }),
    deep: async () => { throw new Error('deep down'); },
  });
  assert.equal(fallback.content, 'fast draft');
  assert.equal(fallback.brain, 'fast');
  await assert.rejects(() => runDualBrainReply('m', 's', { hardTurn: true, timeoutMs: 5000 }, {
    fast: async () => { throw new Error('fast down'); },
    deep: async () => { throw new Error('deep down'); },
  }));
});

test('Gemini is inert without a key; config selects the model name', () => {
  withEnv({ GEMINI_API_KEY: undefined }, () => assert.equal(isGeminiConfigured(), false));
  withEnv({ GEMINI_API_KEY: 'synthetic', GEMINI_MODEL: undefined }, () => {
    assert.equal(isGeminiConfigured(), true);
    assert.equal(geminiModel(), 'gemini-2.5-flash');
  });
});

test('Gemini request shape: generateContent with api-key header (mocked fetch)', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return Response.json({ candidates: [{ content: { parts: [{ text: ' synthetic gemini reply' }] } }] });
  }) as typeof fetch;
  try {
    await withEnv({ GEMINI_API_KEY: 'synthetic', GEMINI_BASE_URL: 'https://gemini.test/v1beta' }, async () => {
      const result = await runGeminiChat('hello', 'rules', 5000);
      assert.equal(result.content, 'synthetic gemini reply');
      assert.equal(calls[0].url, 'https://gemini.test/v1beta/models/gemini-2.5-flash:generateContent');
      const headers = calls[0].init.headers as Record<string, string>;
      assert.equal(headers['x-goog-api-key'], 'synthetic');
      const body = JSON.parse(String(calls[0].init.body));
      assert.equal(body.systemInstruction.parts[0].text, 'rules');
      assert.equal(body.contents[0].parts[0].text, 'hello');
    });
  } finally { globalThis.fetch = original; }
});
