import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTracker, createSeventeenTrackClient, createStubTracker, isSeventeenTrackConfigured } from '../src/tracking/seventeenTrack.ts';
import { createServer } from 'node:http';

function withEnv(patch: Record<string, string | undefined>, fn: () => unknown) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) { saved[key] = process.env[key]; if (patch[key] === undefined) delete process.env[key]; else process.env[key] = patch[key]; }
  try { return fn(); } finally { for (const key of Object.keys(patch)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
}

test('stub is the default; no key means no live calls, no spend', () => {
  withEnv({ SEVENTEEN_TRACK_API_KEY: undefined }, () => {
    assert.equal(isSeventeenTrackConfigured(), false);
    assert.equal(activeTracker().name, 'stub');
  });
  withEnv({ SEVENTEEN_TRACK_API_KEY: 'synthetic-key' }, () => {
    assert.equal(isSeventeenTrackConfigured(), true);
    assert.equal(activeTracker().name, '17track');
  });
});

test('stub returns only synthetic events it was given', async () => {
  const stub = createStubTracker({ 'SYN123': [{ time: '2026-10-28T08:00:00Z', description: 'Synthetic departure', location: 'Test Port' }] });
  assert.deepEqual(await stub.fetchEvents('SYN123'), [{ time: '2026-10-28T08:00:00Z', description: 'Synthetic departure', location: 'Test Port' }]);
  assert.deepEqual(await stub.fetchEvents('UNKNOWN'), []);
});

test('unconfigured live client refuses before any network call', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error('must not be called'); }) as typeof fetch;
  try {
    await withEnv({ SEVENTEEN_TRACK_API_KEY: undefined }, async () => {
      await assert.rejects(() => createSeventeenTrackClient().fetchEvents('X'), /not configured/);
    });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('live client request shape uses the 17token header and parses the latest event (mocked fetch)', async () => {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ data: { accepted: [{ track_info: { latest_event: { time_iso: '2026-10-28T09:30:00Z', description: 'Arrived at port', location: 'Jebel Ali' } } }] } }), { status: 200 });
  }) as typeof fetch;
  try {
    await withEnv({ SEVENTEEN_TRACK_API_KEY: 'synthetic-key', SEVENTEEN_TRACK_BASE_URL: 'https://track.test' }, async () => {
      const events = await createSeventeenTrackClient().fetchEvents('ABCDE12345');
      assert.deepEqual(events, [{ time: '2026-10-28T09:30:00Z', description: 'Arrived at port', location: 'Jebel Ali' }]);
      assert.equal(calls[0].url, 'https://track.test/track/v2.2/gettrackinfo');
      const headers = calls[0].init.headers as Record<string, string>;
      assert.equal(headers['17token'], 'synthetic-key');
      assert.deepEqual(JSON.parse(String(calls[0].init.body)), [{ number: 'ABCDE12345' }]);
    });
  } finally { globalThis.fetch = original; }
});

test('live client against a real local fake 17TRACK server (socket-level)', async () => {
  const seen: Array<{ token: string | undefined; body: string }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      seen.push({ token: req.headers['17token'] as string | undefined, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { accepted: [{ track_info: { latest_event: { time_iso: '2026-10-28T11:00:00Z', description: 'Departed origin port', location: 'Mundra' } } }] } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await withEnv({ SEVENTEEN_TRACK_API_KEY: 'synthetic-key', SEVENTEEN_TRACK_BASE_URL: `http://127.0.0.1:${port}` }, async () => {
      const events = await createSeventeenTrackClient().fetchEvents('SYN777');
      assert.deepEqual(events, [{ time: '2026-10-28T11:00:00Z', description: 'Departed origin port', location: 'Mundra' }]);
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].token, 'synthetic-key');
    assert.deepEqual(JSON.parse(seen[0].body), [{ number: 'SYN777' }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
