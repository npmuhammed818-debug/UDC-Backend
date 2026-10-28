import test from 'node:test';
import assert from 'node:assert/strict';
import { isAnthropicStrongModelEnabled, anthropicStrongModel, runAnthropicChat } from '../src/akif/intelligence/anthropicClient.ts';
import { strongModelName, runStrongModelChat } from '../src/akif/intelligence/strongModel.ts';

function withEnv(patch: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) { saved[key] = process.env[key]; if (patch[key] === undefined) delete process.env[key]; else process.env[key] = patch[key]; }
  try { fn(); } finally { for (const key of Object.keys(patch)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
}

test('strong model defaults to the existing chain; Anthropic needs provider + key', () => {
  withEnv({ AKIF_BRAIN_MODEL_PROVIDER: undefined, ANTHROPIC_API_KEY: undefined }, () => {
    assert.equal(isAnthropicStrongModelEnabled(), false);
    assert.equal(strongModelName(), 'default-chain');
  });
  withEnv({ AKIF_BRAIN_MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: undefined }, () => {
    assert.equal(isAnthropicStrongModelEnabled(), false, 'no key means no traffic and no spend');
  });
  withEnv({ AKIF_BRAIN_MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-synthetic', ANTHROPIC_STRONG_MODEL: undefined }, () => {
    assert.equal(isAnthropicStrongModelEnabled(), true);
    assert.equal(anthropicStrongModel(), 'claude-sonnet-4-5');
    assert.equal(strongModelName(), 'claude-sonnet-4-5');
  });
});

test('Anthropic request shape is the messages API with the configured model (mocked fetch)', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: ' synthetic note ' }] }), { status: 200 });
  }) as typeof fetch;
  try {
    await new Promise<void>((resolve, reject) => {
      withEnv({ AKIF_BRAIN_MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-synthetic', ANTHROPIC_BASE_URL: 'https://anthropic.test' }, () => {
        runAnthropicChat('profile facts', 'system rules', 5000).then((result) => {
          try {
            assert.equal(result.content, 'synthetic note');
            assert.equal(calls.length, 1);
            assert.equal(calls[0].url, 'https://anthropic.test/v1/messages');
            const headers = calls[0].init.headers as Record<string, string>;
            assert.equal(headers['x-api-key'], 'sk-ant-synthetic');
            assert.equal(headers['anthropic-version'], '2023-06-01');
            const body = JSON.parse(String(calls[0].init.body));
            assert.equal(body.model, 'claude-sonnet-4-5');
            assert.equal(body.system, 'system rules');
            assert.deepEqual(body.messages, [{ role: 'user', content: 'profile facts' }]);
            resolve();
          } catch (error) { reject(error); }
        }, reject);
      });
    });
  } finally { globalThis.fetch = original; }
});

test('strong-model slot uses Anthropic when enabled, default chain otherwise, fallback on failure', async () => {
  const original = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => { fetchCalls++; throw new Error('synthetic provider down'); }) as typeof fetch;
  try {
    await withEnvAsync({ AKIF_BRAIN_MODEL_PROVIDER: undefined }, async () => {
      const result = await runStrongModelChat('m', 's', 5000, async () => ({ content: 'chain answer' }));
      assert.equal(result.content, 'chain answer');
      assert.equal(fetchCalls, 0, 'default chain must not call Anthropic');
    });
    await withEnvAsync({ AKIF_BRAIN_MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-synthetic' }, async () => {
      const result = await runStrongModelChat('m', 's', 5000, async () => ({ content: 'fallback answer' }));
      assert.equal(result.content, 'fallback answer', 'failed Anthropic call falls back');
      assert.equal(fetchCalls, 1);
    });
  } finally { globalThis.fetch = original; }
});

async function withEnvAsync(patch: Record<string, string | undefined>, fn: () => Promise<void>) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) { saved[key] = process.env[key]; if (patch[key] === undefined) delete process.env[key]; else process.env[key] = patch[key]; }
  try { await fn(); } finally { for (const key of Object.keys(patch)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
}
