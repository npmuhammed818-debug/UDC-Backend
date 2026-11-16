import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGroqToolChat } from '../src/akif/intelligence/groqClient.ts';

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

async function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const keys = ['GROQ_API_KEY', 'NVIDIA_API_KEY', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const f = globalThis.fetch;
  for (const k of keys) delete process.env[k];
  process.env.GROQ_API_KEY = 'synthetic-groq';
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { await fn(); } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    globalThis.fetch = f;
  }
}

test('Groq and NVIDIA both fail: free OpenRouter model answers', async () => {
  await withEnv({ NVIDIA_API_KEY: 'synthetic-n', OPENROUTER_API_KEY: 'synthetic-o' }, async () => {
    const bodies: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).includes('openrouter')) { bodies.push(String(init?.body)); return ok('or reply'); }
      return new Response('limit', { status: 429 });
    }) as typeof fetch;
    const out = await runGroqToolChat([{ role: 'user', content: 'hi' }], [], 2000);
    assert.equal(out.content, 'or reply');
    assert.match(bodies[0], /:free/);
  });
});

test('a non-free OpenRouter model is never called', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'synthetic-o', OPENROUTER_MODEL: 'openai/gpt-4o' }, async () => {
    let called = 0;
    globalThis.fetch = (async (url: string) => { if (String(url).includes('openrouter')) called++; return new Response('limit', { status: 429 }); }) as typeof fetch;
    await assert.rejects(runGroqToolChat([{ role: 'user', content: 'hi' }], [], 2000), /Groq returned HTTP 429/);
    assert.equal(called, 0);
  });
});

test('no OpenRouter key: nothing is sent to OpenRouter', async () => {
  await withEnv({}, async () => {
    let called = 0;
    globalThis.fetch = (async (url: string) => { if (String(url).includes('openrouter')) called++; return new Response('limit', { status: 503 }); }) as typeof fetch;
    await assert.rejects(runGroqToolChat([{ role: 'user', content: 'hi' }], [], 2000), /HTTP 503/);
    assert.equal(called, 0);
  });
});
