import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTracker, createSeventeenTrackClient, createStubTracker, isSeventeenTrackConfigured } from '../src/tracking/seventeenTrack.ts';
import { createServer } from 'node:http';

function withEnv(patch: Record<string, string | undefined>, fn: () => unknown) {
  const saved: Record<string, string | undefined> = {};
  const restore = () => { for (const key of Object.keys(patch)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } };
  for (const key of Object.keys(patch)) { saved[key] = process.env[key]; if (patch[key] === undefined) delete process.env[key]; else process.env[key] = patch[key]; }
  try {
    const result = fn();
    return result instanceof Promise ? result.finally(restore) : (restore(), result);
  } catch (error) {
    restore();
    throw error;
  }
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

test('live client registers first, then asks for the latest event (mocked fetch)', async () => {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const register = String(url).endsWith('/register');
    return new Response(JSON.stringify(register
      ? { code: 0, data: { accepted: [{ number: 'ABCDE12345', carrier: 3011 }], rejected: [] } }
      : { code: 0, data: { accepted: [{ number:'ABCDE12345',track_info: { latest_event: { time_iso: '2026-10-28T09:30:00Z', description: 'Arrived at port', location: 'Jebel Ali' } } }] } }), { status: 200 });
  }) as typeof fetch;
  try {
    await withEnv({ SEVENTEEN_TRACK_API_KEY: 'synthetic-key', SEVENTEEN_TRACK_BASE_URL: 'https://track.test' }, async () => {
      const events = await createSeventeenTrackClient().fetchEvents('ABCDE12345');
      assert.deepEqual(events, [{ time: '2026-10-28T09:30:00Z', description: 'Arrived at port', location: 'Jebel Ali' }]);
      assert.deepEqual(calls.map((call) => call.url), [
        'https://track.test/track/v2.2/register',
        'https://track.test/track/v2.2/gettrackinfo',
      ]);
      for (const call of calls) {
        const headers = call.init.headers as Record<string, string>;
        assert.equal(headers['17token'], 'synthetic-key');
        assert.deepEqual(JSON.parse(String(call.init.body)), [{ number: 'ABCDE12345' }]);
      }
    });
  } finally { globalThis.fetch = original; }
});

test('an already-registered provider response still allows the lookup', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: any) => {
    urls.push(String(url));
    const register = String(url).endsWith('/register');
    return new Response(JSON.stringify(register
      ? { code: 0, data: { accepted: [], rejected: [{ number: 'SYN-OLD-1', error: { code: -18019901, message: 'already registered' } }] } }
      : { code: 0, data: { accepted: [] } }), { status: 200 });
  }) as typeof fetch;
  try {
    await withEnv({ SEVENTEEN_TRACK_API_KEY: 'synthetic-key', SEVENTEEN_TRACK_BASE_URL: 'https://track.test' }, async () => {
      assert.deepEqual(await createSeventeenTrackClient().fetchEvents('SYN-OLD-1'), []);
    });
    assert.equal(urls.length, 2);
  } finally { globalThis.fetch = original; }
});

test('a top-level already-registered provider code still allows the lookup', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: any) => {
    urls.push(String(url));
    const register = String(url).endsWith('/register');
    return new Response(JSON.stringify(register
      ? { code: -18019901, data: { accepted: [], rejected: [] } }
      : { code: 0, data: { accepted: [] } }), { status: 200 });
  }) as typeof fetch;
  try {
    await withEnv({ SEVENTEEN_TRACK_API_KEY: 'synthetic-key', SEVENTEEN_TRACK_BASE_URL: 'https://track.test' }, async () => {
      assert.deepEqual(await createSeventeenTrackClient().fetchEvents('SYN-OLD-2'), []);
    });
    assert.equal(urls.length, 2);
  } finally { globalThis.fetch = original; }
});

test('registration refusal stops before the tracking lookup', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: any) => {
    urls.push(String(url));
    return new Response(JSON.stringify({
      code: 0,
      data: { accepted: [], rejected: [{ number: 'SYN-BAD-1', error: { code: -18019903, message: 'carrier cannot be detected' } }] },
    }), { status: 200 });
  }) as typeof fetch;
  try {
    await withEnv({ SEVENTEEN_TRACK_API_KEY: 'synthetic-key', SEVENTEEN_TRACK_BASE_URL: 'https://track.test' }, async () => {
      await assert.rejects(() => createSeventeenTrackClient().fetchEvents('SYN-BAD-1'), /registration failed/);
    });
    assert.deepEqual(urls, ['https://track.test/track/v2.2/register']);
  } finally { globalThis.fetch = original; }
});

test('provider error codes are rejected, not mistaken for empty tracking data', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ code: -18019908, data: { accepted: [] } }), { status: 200 })) as typeof fetch;
  try {
    await withEnv({ SEVENTEEN_TRACK_API_KEY: 'synthetic-key', SEVENTEEN_TRACK_BASE_URL: 'https://track.test' }, async () => {
      await assert.rejects(() => createSeventeenTrackClient().fetchEvents('SYN-QUOTA-1'), /rejected/);
    });
  } finally { globalThis.fetch = original; }
});

test('live client against a real local fake 17TRACK server (socket-level)', async () => {
  const seen: Array<{ url: string | undefined; token: string | undefined; body: string }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      seen.push({ url: req.url, token: req.headers['17token'] as string | undefined, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(req.url === '/track/v2.2/register'
        ? { code: 0, data: { accepted: [{ number: 'SYN777', carrier: 3011 }], rejected: [] } }
        : { code: 0, data: { accepted: [{ number:'SYN777',track_info: { latest_event: { time_iso: '2026-10-28T11:00:00Z', description: 'Departed origin port', location: 'Mundra' } } }] } }));
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
    assert.deepEqual(seen.map((call) => call.url), ['/track/v2.2/register', '/track/v2.2/gettrackinfo']);
    assert.ok(seen.every((call) => call.token === 'synthetic-key'));
    assert.ok(seen.every((call) => JSON.parse(call.body)[0].number === 'SYN777'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('tracking client binds events to exact requested number, never first returned record',async()=>{
 const original=globalThis.fetch,saved=process.env.SEVENTEEN_TRACK_API_KEY;process.env.SEVENTEEN_TRACK_API_KEY='synthetic';
 const event={time_iso:'2026-10-28T09:30:00Z',description:'Delivered'};let records:any[]=[];
 globalThis.fetch=(async(url:any)=>Response.json({code:0,data:{accepted:String(url).endsWith('/register')?[{number:'SYN-BOUND'}]:records}})) as typeof fetch;
 try{const client=createSeventeenTrackClient();records=[{number:'OTHER',track_info:{latest_event:event}}];assert.deepEqual(await client.fetchEvents('SYN-BOUND'),[]);records=[{number:'OTHER',track_info:{latest_event:event}},{number:'SYN-BOUND',track_info:{latest_event:{...event,description:'Departed'}}}];assert.equal((await client.fetchEvents('SYN-BOUND'))[0].description,'Departed');records=[{number:'SYN-BOUND',track_info:{latest_event:{...event,time_iso:'invalid'}}}];assert.deepEqual(await client.fetchEvents('SYN-BOUND'),[]);records=[{number:'SYN-BOUND',track_info:{latest_event:event}},{number:'SYN-BOUND',track_info:{latest_event:event}}];await assert.rejects(client.fetchEvents('SYN-BOUND'),/ambiguous/);
 }finally{globalThis.fetch=original;if(saved===undefined)delete process.env.SEVENTEEN_TRACK_API_KEY;else process.env.SEVENTEEN_TRACK_API_KEY=saved;}
});
