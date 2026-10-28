import test from 'node:test';
import assert from 'node:assert/strict';
import { isGroqConfigured, runGroqChat, groqModel } from '../src/akif/intelligence/groqClient.ts';
import { cheapModelName, runCheapModelChat } from '../src/akif/intelligence/cheapModel.ts';

async function withEnv(patch: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) { saved[key] = process.env[key]; if (patch[key] === undefined) delete process.env[key]; else process.env[key] = patch[key]; }
  try { await fn(); } finally { for (const key of Object.keys(patch)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
}

test('Groq is inert without a key; config selects model name', () => {
  withEnv({ GROQ_API_KEY: undefined }, () => assert.equal(isGroqConfigured(), false));
  withEnv({ GROQ_API_KEY: 'gsk_synthetic', GROQ_MODEL: undefined }, () => {
    assert.equal(isGroqConfigured(), true);
    assert.equal(groqModel(), 'llama-3.3-70b-versatile');
  });
});

test('Groq request shape is OpenAI-compatible with a bearer token (mocked fetch)', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return Response.json({ choices: [{ message: { content: ' synthetic groq reply' } }] });
  }) as typeof fetch;
  try {
    await withEnv({ GROQ_API_KEY: 'gsk_synthetic', GROQ_BASE_URL: 'https://groq.test/v1' }, async () => {
      const result = await runGroqChat('hello', 'rules', 5000);
      assert.equal(result.content, 'synthetic groq reply');
      assert.equal(calls[0].url, 'https://groq.test/v1/chat/completions');
      const headers = calls[0].init.headers as Record<string, string>;
      assert.equal(headers.authorization, 'Bearer gsk_synthetic');
      const body = JSON.parse(String(calls[0].init.body));
      assert.equal(body.model, 'llama-3.3-70b-versatile');
      assert.deepEqual(body.messages, [{ role: 'system', content: 'rules' }, { role: 'user', content: 'hello' }]);
    });
  } finally { globalThis.fetch = original; }
});

test('cheap slot order: Haiku first, Groq backup, existing chain last; all env-gated', async () => {
  // No keys: straight to the existing chain.
  await withEnv({ AKIF_BRAIN_MODEL_PROVIDER: undefined, ANTHROPIC_API_KEY: undefined, GROQ_API_KEY: undefined }, async () => {
    const result = await runCheapModelChat('m', 's', 5000, async () => ({ content: 'chain' }));
    assert.equal(result.content, 'chain');
    assert.equal(cheapModelName(), 'default-chain');
  });
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: any) => {
    urls.push(String(url));
    if (String(url).includes('anthropic')) throw new Error('synthetic haiku down');
    return Response.json({ choices: [{ message: { content: 'groq backup reply' } }] });
  }) as typeof fetch;
  try {
    // Anthropic down -> Groq answers.
    await withEnv({ AKIF_BRAIN_MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-synthetic', GROQ_API_KEY: 'gsk_synthetic', GROQ_BASE_URL: 'https://groq.test/v1', ANTHROPIC_BASE_URL: 'https://anthropic.test' }, async () => {
      const result = await runCheapModelChat('m', 's', 5000, async () => ({ content: 'chain' }));
      assert.equal(result.content, 'groq backup reply');
      assert.equal(cheapModelName(), 'claude-haiku-4-5');
      assert.deepEqual(urls, ['https://anthropic.test/v1/messages', 'https://groq.test/v1/chat/completions']);
    });
    // Both down -> existing chain.
    urls.length = 0;
    globalThis.fetch = (async () => { urls.push('x'); throw new Error('all down'); }) as typeof fetch;
    await withEnv({ AKIF_BRAIN_MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-synthetic', GROQ_API_KEY: 'gsk_synthetic' }, async () => {
      const result = await runCheapModelChat('m', 's', 5000, async () => ({ content: 'chain last resort' }));
      assert.equal(result.content, 'chain last resort');
    });
  } finally { globalThis.fetch = original; }
});
