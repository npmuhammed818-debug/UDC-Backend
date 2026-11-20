import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGroqToolChat } from '../src/akif/intelligence/groqClient.ts';

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

async function withEnv(fn: () => Promise<void>) {
  const saved = { g: process.env.GROQ_API_KEY, n: process.env.NVIDIA_API_KEY, f: globalThis.fetch };
  process.env.GROQ_API_KEY = 'synthetic-groq';
  process.env.UDC_CUSTOMER_BACKUP_ROUTES = 'nvidia,openrouter';
  try { await fn(); } finally {
    if (saved.g === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = saved.g;
    if (saved.n === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = saved.n;
    globalThis.fetch = saved.f;
  }
}

test('Groq capped on both models falls to NVIDIA when its key is set', async () => {
  await withEnv(async () => {
    process.env.NVIDIA_API_KEY = 'synthetic-nvidia';
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => { urls.push(String(url)); return String(url).includes('nvidia') ? ok('backup reply') : new Response('limit', { status: 429 }); }) as typeof fetch;
    const out = await runGroqToolChat([{ role: 'user', content: 'hi' }], [], 2000);
    assert.equal(out.content, 'backup reply');
    assert.equal(urls.filter((u) => u.includes('groq')).length, 2);
    assert.equal(urls.filter((u) => u.includes('nvidia')).length, 1);
  });
});

test('no NVIDIA key: the Groq error still surfaces', async () => {
  await withEnv(async () => {
    delete process.env.NVIDIA_API_KEY;
    globalThis.fetch = (async () => new Response('limit', { status: 429 })) as typeof fetch;
    await assert.rejects(runGroqToolChat([{ role: 'user', content: 'hi' }], [], 2000), /Groq returned HTTP 429/);
  });
});

test('Groq 400 does not go to NVIDIA', async () => {
  await withEnv(async () => {
    process.env.NVIDIA_API_KEY = 'synthetic-nvidia';
    let n = 0;
    globalThis.fetch = (async (url: string) => { if (String(url).includes('nvidia')) n++; return new Response('bad', { status: 400 }); }) as typeof fetch;
    await assert.rejects(runGroqToolChat([{ role: 'user', content: 'hi' }], [], 2000), /HTTP 400/);
    assert.equal(n, 0);
  });
});
