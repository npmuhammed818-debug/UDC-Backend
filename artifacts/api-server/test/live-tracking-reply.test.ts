import test from 'node:test';
import assert from 'node:assert/strict';
import { clearLiveTrackingCache, formatLiveStatus, liveTrackingReply } from '../src/whatsapp/liveTracking.ts';
import type { ShipmentTracker } from '../src/tracking/seventeenTrack.ts';

const trackerWith = (events: Record<string, { time: string; description: string; location?: string }[]>): ShipmentTracker & { calls: string[] } => {
  const calls: string[] = [];
  return { name: 'fake', calls, async fetchEvents(n: string) { calls.push(n); return events[n] ?? []; } };
};

test('invalid numbers get guidance and never reach the tracker', async () => {
  const tracker = trackerWith({});
  assert.match(await liveTrackingReply('abc', { tracker, configured: true }), /does not look like a tracking number/);
  assert.match(await liveTrackingReply('NODIGITSHERE', { tracker, configured: true }), /does not look like a tracking number/);
  assert.deepEqual(tracker.calls, []);
});

test('without a configured key the reply says honestly that live tracking is off', async () => {
  const tracker = trackerWith({ SYN1: [{ time: '2026-10-28T08:00:00Z', description: 'Departed' }] });
  const reply = await liveTrackingReply('SYN1001', { tracker, configured: false });
  assert.match(reply, /not switched on yet/);
  assert.match(reply, /UDC-recorded update/);
  assert.deepEqual(tracker.calls, [], 'no provider call when live tracking is off');
});

test('a configured lookup answers in plain words with the latest carrier event', async () => {
  clearLiveTrackingCache();
  const tracker = trackerWith({ SYN123: [{ time: '2026-10-28T09:30:00Z', description: 'Arrived at port', location: 'Jebel Ali' }] });
  const reply = await liveTrackingReply('syn123', { tracker, configured: true });
  assert.deepEqual(tracker.calls, ['SYN123']);
  assert.match(reply, /Latest carrier update for SYN123/);
  assert.match(reply, /Arrived at port in Jebel Ali · 2026-10-28 09:30 UTC/);
  assert.match(reply, /UDC has not verified this update/);
});

test('no events means an honest empty answer, never an invented status', async () => {
  clearLiveTrackingCache();
  const tracker = trackerWith({});
  const reply = await liveTrackingReply('SYN404', { tracker, configured: true });
  assert.match(reply, /No carrier updates found for SYN404 yet/);
});

test('provider failure gives a calm retry message without leaking internals', async () => {
  clearLiveTrackingCache();
  const failing: ShipmentTracker = { name: 'fake', async fetchEvents() { throw new Error('synthetic provider down, key=secret'); } };
  const reply = await liveTrackingReply('SYN500', { tracker: failing, configured: true });
  assert.match(reply, /unreachable right now/);
  assert.doesNotMatch(reply, /secret|synthetic provider/);
});

test('repeated lookups within 6 hours reuse the cached answer (quota guard)', async () => {
  clearLiveTrackingCache();
  const tracker = trackerWith({ SYN900: [{ time: '2026-10-28T10:00:00Z', description: 'In transit' }] });
  const t0 = Date.now();
  await liveTrackingReply('SYN900', { tracker, configured: true, now: t0 });
  await liveTrackingReply('SYN900', { tracker, configured: true, now: t0 + 60_000 });
  assert.equal(tracker.calls.length, 1, 'second lookup inside TTL served from cache');
  await liveTrackingReply('SYN900', { tracker, configured: true, now: t0 + 7 * 60 * 60 * 1000 });
  assert.equal(tracker.calls.length, 2, 'after TTL the carrier is asked again');
});

test('formatLiveStatus clips oversized carrier fields and labels the source', () => {
  const reply = formatLiveStatus('N1', [{ time: 'not-a-date', description: 'x'.repeat(500), location: 'y'.repeat(300) }]);
  const lines = reply.split('\n');
  assert.ok(lines[1].length < 450, 'oversized carrier text is clipped');
  assert.match(lines[2], /via 17TRACK/);
});
