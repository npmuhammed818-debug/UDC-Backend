import test from 'node:test';
import assert from 'node:assert/strict';
import { brainTrackingReply, trackingReplyViolatesRules } from '../src/akif/shipmentTrackingReply.ts';
import { interpretTrackingAsk } from '../src/akif/trackingIntent.ts';
import { clearLiveTrackingCache, liveTrackingReply } from '../src/whatsapp/liveTracking.ts';
import type { ShipmentTracker } from '../src/tracking/seventeenTrack.ts';

const events = [
  { time: '2026-10-30T14:20:00Z', description: 'Departed from origin port', location: 'Mundra' },
  { time: '2026-10-28T09:05:00Z', description: 'Loaded on vessel', location: 'Mundra' },
];

const chatReturning = (content: string) => async (_m: string, _s: string) => ({ content });

test('brain words are used when the brain answers well', async () => {
  const reply = await brainTrackingReply(
    { number: 'SYN123', events },
    { chat: chatReturning('{"reply":"Your shipment SYN123 left Mundra port on 30 Oct, the carrier reports. We have not verified this ourselves."}') },
  );
  assert.match(reply!, /left Mundra port/);
});

test('no events means no brain call and no answer', async () => {
  let called = false;
  const reply = await brainTrackingReply({ number: 'SYN123', events: [] }, { chat: async () => { called = true; return { content: '{}' }; } });
  assert.equal(reply, null);
  assert.equal(called, false);
});

test('a delivery-date promise is rejected and falls back', async () => {
  for (const bad of [
    '{"reply":"It will arrive on 5 November."}',
    '{"reply":"Expected delivery tomorrow."}',
    '{"reply":"ETA is 3 days away."}',
  ]) {
    assert.equal(await brainTrackingReply({ number: 'SYN123', events }, { chat: chatReturning(bad) }), null);
  }
});

test('a delivered claim without a delivered carrier event is rejected', async () => {
  const reply = await brainTrackingReply(
    { number: 'SYN123', events },
    { chat: chatReturning('{"reply":"Good news, your package was delivered."}') },
  );
  assert.equal(reply, null);
  assert.equal(trackingReplyViolatesRules('Good news, your package was delivered.', events), true);
  const deliveredEvents = [{ time: '2026-10-31T10:00:00Z', description: 'Delivered, signed by RAVI', location: 'Kochi' }];
  assert.equal(trackingReplyViolatesRules('Good news, your package was delivered.', deliveredEvents), false);
});

test('placeholders, app talk and oversized replies are rejected', async () => {
  assert.equal(trackingReplyViolatesRules('Check <link1> for updates.', events), true);
  assert.equal(trackingReplyViolatesRules('Open the UDC app to track it.', events), true);
  assert.equal(trackingReplyViolatesRules('x'.repeat(700), events), true);
});

test('brain failure or garbage output falls back, never reaches the customer', async () => {
  assert.equal(await brainTrackingReply({ number: 'SYN123', events }, { chat: async () => { throw new Error('provider down'); } }), null);
  assert.equal(await brainTrackingReply({ number: 'SYN123', events }, { chat: chatReturning('not json at all') }), null);
});

test('live lookup answers in brain words and falls back to the template', async () => {
  clearLiveTrackingCache();
  const tracker: ShipmentTracker = { name: 'fake', async fetchEvents() { return events; } };
  const brainReply = await liveTrackingReply('SYN321', {
    tracker, configured: true,
    brain: async () => 'Carrier says SYN321 departed Mundra on 30 Oct. UDC has not verified this.',
  });
  assert.match(brainReply, /departed Mundra/);
  clearLiveTrackingCache();
  const templateReply = await liveTrackingReply('SYN321', { tracker, configured: true, brain: async () => null });
  assert.match(templateReply, /Latest carrier update for SYN321/);
  clearLiveTrackingCache();
  const noBrain = await liveTrackingReply('SYN321', { tracker, configured: true, brain: null });
  assert.match(noBrain, /Latest carrier update for SYN321/);
});

test('brain intent pulls the number from natural mixed-language asks', async () => {
  const chat = chatReturning('{"trackingNumber":"1Z999AA10123456784"}');
  assert.equal(await interpretTrackingAsk('ente container 1Z999AA10123456784 evide ethi?', { chat }), '1Z999AA10123456784');
  assert.equal(await interpretTrackingAsk('where is my shipment 1Z999AA10123456784', { chat }), '1Z999AA10123456784');
});

test('brain intent stays out of messages without digits and non-tracking messages', async () => {
  let called = false;
  const chat = async () => { called = true; return { content: '{"trackingNumber":null}' }; };
  assert.equal(await interpretTrackingAsk('where is my shipment', { chat }), null);
  assert.equal(called, false, 'no digit, no brain call');
  assert.equal(await interpretTrackingAsk('please check invoice 4521 attached', { chat }), null);
});

test('a malformed brain-proposed number never reaches the lookup', async () => {
  assert.equal(await interpretTrackingAsk('track my box 12', { chat: chatReturning('{"trackingNumber":"12"}') }), null);
  assert.equal(await interpretTrackingAsk('track ABC123', { chat: chatReturning('{"trackingNumber":"<script>"}') }), null);
  assert.equal(await interpretTrackingAsk('track ABC123', { chat: async () => { throw new Error('down'); } }), null);
});

test('invalid and future carrier data never reaches tracking brain or status claim',async()=>{
 for(const time of ['2026-02-30T12:00:00Z','2099-01-01T12:00:00Z']){
  const bad=[{time,description:'Delivered'}];let called=false;
  assert.equal(await brainTrackingReply({number:'SYN123',events:bad},{chat:async()=>{called=true;return {content:'{"reply":"The shipment was delivered."}'};}}),null);
  assert.equal(called,false,'invalid feed is not model input');
  assert.equal(trackingReplyViolatesRules('The shipment was delivered.',bad),true);
 }
});
test('latest timestamp, not feed order, controls tracking brain support',()=>{
 const rows=[{time:'2026-10-28T12:00:00Z',description:'Delivered'},{time:'2026-10-30T12:00:00Z',description:'Customs hold'}];
 assert.equal(trackingReplyViolatesRules('The shipment was delivered.',rows),true);
 assert.equal(trackingReplyViolatesRules('The carrier reports it is delayed.',rows),false);
});
