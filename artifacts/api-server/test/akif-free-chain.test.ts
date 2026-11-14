import test from 'node:test';
import assert from 'node:assert/strict';
import { runFreeChain, configuredFreeProviders, resetFreeChainBreakers } from '../src/akif/intelligence/freeProviderChain.ts';

const KEYS = ['CLOUDFLARE_AI_TOKEN', 'CLOUDFLARE_AI_ACCOUNT_ID', 'CEREBRAS_API_KEY', 'SAMBANOVA_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY'];
function clean() { for (const k of KEYS) delete process.env[k]; resetFreeChainBreakers(); }

test('free chain is inert without keys', async () => {
  clean();
  assert.equal(configuredFreeProviders().length, 0);
  assert.equal(await runFreeChain('hi', undefined, () => 1000), null);
});

test('free chain fails over in rank order and opens a breaker', async () => {
  clean();
  process.env.CEREBRAS_API_KEY = 'k1'; process.env.SAMBANOVA_API_KEY = 'k2';
  const original = globalThis.fetch;
  const hits: string[] = [];
  globalThis.fetch = (async (url: any) => {
    hits.push(String(url));
    if (String(url).includes('cerebras')) return new Response('rate', { status: 429 });
    return Response.json({ choices: [{ message: { content: ' ok ' } }] });
  }) as typeof fetch;
  try {
    const a = await runFreeChain('hi', 'sys', () => 5000);
    assert.equal(a?.provider, 'sambanova'); assert.equal(a?.content, 'ok');
    await runFreeChain('hi', 'sys', () => 5000);
    assert.equal(configuredFreeProviders().map(p => p.id).join(), 'sambanova');
    const before = hits.length;
    await runFreeChain('hi', 'sys', () => 5000);
    assert.equal(hits.length - before, 1);
  } finally { globalThis.fetch = original; clean(); }
});

test('cloudflare slot needs both token and account id and builds the account url', async () => {
  clean();
  process.env.CLOUDFLARE_AI_TOKEN = 't';
  assert.equal(configuredFreeProviders().length, 0);
  process.env.CLOUDFLARE_AI_ACCOUNT_ID = 'acct123';
  const original = globalThis.fetch; let seen = '';
  globalThis.fetch = (async (url: any) => { seen = String(url); return Response.json({ choices: [{ message: { content: 'hi' } }] }); }) as typeof fetch;
  try {
    const r = await runFreeChain('x', undefined, () => 5000);
    assert.equal(r?.provider, 'cloudflare');
    assert.equal(seen, 'https://api.cloudflare.com/client/v4/accounts/acct123/ai/v1/chat/completions');
  } finally { globalThis.fetch = original; clean(); }
});
