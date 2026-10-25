// Real routes, queue, SQL transactions and signed receipts. Only Meta is simulated.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const url = new URL(process.env.UDC_DELIVERY_QA_DATABASE_URL ?? 'http://missing.invalid');
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '5432');
assert.match(url.pathname, /^\/udc_qa_delivery_[a-z0-9_]+$/);
assert.deepEqual([...url.searchParams.keys()], ['sslmode']); assert.equal(url.searchParams.get('sslmode'), 'disable');
for (const key of Object.keys(process.env)) if (/^(SUPABASE_|WHATSAPP_|UDC_|AKIF_|NVIDIA_|OPENAI_|HERMES_|SESSION_SECRET)/.test(key)) delete process.env[key];
const secret = randomBytes(32).toString('hex');
Object.assign(process.env, { NODE_ENV: 'test', SESSION_SECRET: secret, SUPABASE_DATABASE_URL: url.href,
  WHATSAPP_APP_SECRET: secret, WHATSAPP_PHONE_NUMBER_ID: '12345678', WHATSAPP_BUSINESS_ACCOUNT_ID: '23456789',
  WHATSAPP_ACCESS_TOKEN: 'synthetic-provider-token', UDC_SHIPMENT_WHATSAPP_TEMPLATE_NAME: 'udc_deal_update',
  UDC_SHIPMENT_WHATSAPP_TEMPLATE_LANGUAGE: 'en' });
await mkdir(new URL('../../tmp/', import.meta.url), { recursive: true });
const directory = await mkdtemp(fileURLToPath(new URL('../../tmp/qa-delivery-', import.meta.url)));
let ackPayload={};
let pool, server, origin, mode = 'ok', approved = true, calls = [], serial = 0, checks = 0;
const phones = new Set();
const originalFetch = globalThis.fetch;
const pass = label => { checks++; console.log('PASSED: ' + label); };
globalThis.fetch = async (input, init) => {
  const target = new URL(String(input));
  if (target.origin === origin) return originalFetch(input, init);
  assert.equal(target.origin, 'https://graph.facebook.com', 'no unapproved network destination');
  if (init?.method !== 'POST') return Response.json({ data: [{ name: 'udc_deal_update', language: 'en',
    status: approved ? 'APPROVED' : 'PAUSED', category: 'UTILITY', components: [{ type: 'BODY', text: mod.GENERIC_NOTIFICATION_TEMPLATE_BODY }] }] });
  const payload = JSON.parse(init.body);
  assert.ok(phones.has(payload.to), 'fictional recipients only');
  assert.ok(!JSON.stringify(payload).match(/BANK-SECRET|PASSPORT-SECRET|private\.invalid|99999/), 'never forward private in-app content');
  calls.push(payload);
  if (mode === 'ack') return Response.json(ackPayload);
  if (mode === 'timeout') throw Error('synthetic timeout');
  if (mode === 'rate') return Response.json({ error: { code: 130429 } }, { status: 429 });
  if (mode === 'error') return Response.json({ error: { code: 1 } }, { status: 503 });
  const id = 'wamid.synthetic.' + (++serial);
  if (mode === 'early') await mod.recordSignedShipmentStatuses([{ id, status: 'delivered', recipient_id: payload.to,
    timestamp: String(Math.floor(Date.now() / 1000)) }]);
  return Response.json({ messages: [{ id }] });
};
let mod;
try {
  await build({ stdin: { contents: `
    import express from 'express'; import cookieParser from 'cookie-parser';
    import admin from './src/routes/admin'; import webhook from './src/routes/whatsappWebhook';
    import {loadAuth} from './src/auth/middleware';
    export {pool,db} from '@workspace/db'; export {createSession} from './src/auth/sessions';
    export {dispatchShipmentNotifications} from './src/notifications/shipmentDispatcher';
    export {enqueueShipmentWhatsApp} from './src/notifications/shipmentOutbox';export {replayVerificationWhatsAppNotifications,replayDealStatusWhatsAppNotification,replayDealSummaryWhatsAppNotification} from './src/whatsapp/replayVerificationNotifications';
    export {recordSignedCustomerInbound} from './src/whatsapp/customerServiceWindow';
    export {recordSignedShipmentStatuses} from './src/whatsapp/shipmentDeliveryReceipts';
    export {GENERIC_NOTIFICATION_TEMPLATE_BODY} from './src/notifications/deliveryContent';
    export {POLICY_VERSION} from './src/privacy/policies'; export {consentVersion} from './src/privacy/consentNotice';
    const app=express();app.use(express.json({verify(req,res,buffer){req.rawBody=buffer;}}));app.use(cookieParser());
    app.use((req,res,next)=>{req.log={info(){},warn(){},error(){}};next();});app.use(loadAuth);app.use(admin);app.use(webhook);export default app;
  `, resolveDir: fileURLToPath(new URL('../../', import.meta.url)) }, outfile: directory + '/app.mjs', bundle: true,
    platform: 'node', format: 'esm', external: ['pg-native'], logLevel: 'silent',
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" } });
  mod = await import(directory + '/app.mjs'); pool = mod.pool;
  for (const name of ['20261024_whatsapp_shipment_outbox.sql', '20261024_whatsapp_shipment_receipts.sql', '20261024_whatsapp_customer_windows.sql'])
    await pool.query(await readFile(new URL('../../../../lib/db/migrations/' + name, import.meta.url), 'utf8'));
  server = mod.default.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  origin = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body, token, method = 'POST') => {
    const res = await fetch(origin + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: res.status, body: await res.json() };
  };
  async function user(role, status = 'verified') {
    const phone = '1000000' + String(phones.size + 1000); phones.add(phone);
    const id = (await pool.query("INSERT INTO users(email,password_hash,phone,role,status) VALUES($1,'synthetic',$2,$3,$4) RETURNING id", [randomUUID() + '@example.invalid', phone, role, status])).rows[0].id;
    await pool.query('INSERT INTO notification_preferences(user_id,optional_whatsapp,reminders) VALUES($1,true,true)', [id]);
    const fingerprint = createHmac('sha256', secret).update(phone).digest('hex');
    await pool.query("INSERT INTO audit_logs(action,entity_type,metadata) VALUES('whatsapp_consent_recorded','whatsapp_consent',$1)",
      [JSON.stringify({ fingerprint, status: 'accepted', policyVersion: mod.consentVersion(mod.POLICY_VERSION) })]);
    await mod.recordSignedCustomerInbound({ phone, providerMessageId: 'wamid.in.' + randomUUID(), timestamp: String(Math.floor(Date.now() / 1000)) });
    return { id, phone, token: (await mod.createSession(id)).token };
  }
  const buyer = await user('buyer'), seller = await user('seller'), agent = await user('agent'), outsider = await user('buyer'), admin = await user('admin', 'active');
  const product = (await pool.query("INSERT INTO products(name) VALUES('Fictional commodity') RETURNING id")).rows[0].id;
  const deal = (await pool.query("INSERT INTO deals(buyer_user_id,seller_user_id,product_id,quantity,unit,agreed_price) VALUES($1,$2,$3,1,'MT',1) RETURNING id", [buyer.id, seller.id, product])).rows[0].id;
  await pool.query("INSERT INTO deal_participants(deal_id,user_id,participant_role,status) VALUES($1,$2,'agent','active')", [deal, agent.id]);
  const shipment = (await pool.query('INSERT INTO shipments(deal_id) VALUES($1) RETURNING id', [deal])).rows[0].id;
  async function queue(recipient, type = 'shipment_milestone') {
    const id = (await pool.query("INSERT INTO notifications(user_id,type,title,body) VALUES($1,$2,'Fictional','BANK-SECRET PASSPORT-SECRET https://private.invalid 99999') RETURNING id", [recipient.id, type])).rows[0].id;
    assert.equal(await mod.enqueueShipmentWhatsApp(mod.db, { notificationId: id, recipientUserId: recipient.id, dealId: deal }), true);
    assert.equal(await mod.enqueueShipmentWhatsApp(mod.db, { notificationId: id, recipientUserId: recipient.id, dealId: deal }), false);
    return id;
  }
  const state = async id => (await pool.query('SELECT * FROM whatsapp_shipment_outbox WHERE notification_id=$1', [id])).rows[0];
  const dispatch = async extra => {
    // PostgreSQL stores microseconds; JS dates have milliseconds. Make newly
    // queued fixture rows due without depending on the two clocks' rounding.
    await pool.query("UPDATE whatsapp_shipment_outbox SET next_attempt_at=now()-interval '1 second' WHERE status='pending'");
    return mod.dispatchShipmentNotifications(extra);
  };
  await queue(buyer); assert.equal((await dispatch()).enabled, false); assert.equal(calls.length, 0);
  process.env.UDC_SHIPMENT_WHATSAPP_SEND_ENABLED = 'true';
  assert.equal((await dispatch()).accepted, 1); assert.equal((await dispatch()).claimed, 0);
  pass('disabled by default; enabling uses current signed window and sends each durable intent once, never the private body');
  const event = { idempotencyKey: randomUUID(), kind: 'departed', occurredAt: new Date().toISOString() };
  assert.equal((await call(`/admin/shipments/${shipment}/events`, event, buyer.token)).status, 403);
  assert.equal((await call(`/admin/shipments/${shipment}/events`, event, admin.token)).status, 201);
  assert.equal((await call(`/admin/shipments/${shipment}/events`, event, admin.token)).status, 200);
  const before = calls.length;
  await Promise.all([dispatch(), dispatch()]);
  assert.equal(calls.length - before, 3, 'one recipient each buyer, seller, active agent; no duplicate across workers');
  assert.match(calls.find(p => p.to === agent.phone).text.body, /assigned/);
  pass('end-to-end actual admin milestone route → SQL outbox → simulated Meta; idempotent source and concurrent workers');
  const retryEvent={...event,idempotencyKey:randomUUID(),kind:'in_transit'};
  await pool.query("CREATE FUNCTION qa_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic queue outage'; END $$");
  await pool.query("CREATE TRIGGER qa_reject_outbox BEFORE INSERT ON whatsapp_shipment_outbox FOR EACH ROW EXECUTE FUNCTION qa_reject_outbox()");
  assert.equal((await call(`/admin/shipments/${shipment}/events`,retryEvent,admin.token)).status,500);
  assert.equal(Number((await pool.query('SELECT count(*) FROM shipment_tracking_events WHERE idempotency_key=$1',[retryEvent.idempotencyKey])).rows[0].count),0);
  await pool.query('DROP TRIGGER qa_reject_outbox ON whatsapp_shipment_outbox');await pool.query('DROP FUNCTION qa_reject_outbox()');
  assert.equal((await call(`/admin/shipments/${shipment}/events`,retryEvent,admin.token)).status,201);
  const beforeRetry=calls.length;await dispatch();assert.equal(calls.length-beforeRetry,3);
  pass('queue outage rolls back the source milestone; retrying the same event safely commits one notification per recipient');
  const cargo = (await pool.query("INSERT INTO shipment_cargo_units(shipment_id,deal_id,transport_mode,unit_reference,status) VALUES($1,$2,'sea','FICTIONAL','in_transit') RETURNING id", [shipment,deal])).rows[0].id;
  const eta = {status:'in_transit',estimatedArrival:new Date(Date.now()+86400_000).toISOString()};
  const beforeEta=calls.length;
  assert.equal((await call(`/admin/cargo-units/${cargo}`,eta,admin.token,'PATCH')).status,200);
  assert.equal((await call(`/admin/cargo-units/${cargo}`,eta,admin.token,'PATCH')).status,200);
  await dispatch();assert.equal(calls.length-beforeEta,3,'ETA-only change queues once per authorized recipient; unchanged retry queues nothing');
  pass('ETA-only edits notify buyer/seller/agent without inventing physical arrival or duplicating unchanged updates');
  const denied = [];
  denied.push(await queue(outsider));
  denied.push(await queue(agent, 'document_reviewed'));
  const opted = await queue(buyer); denied.push(opted);
  await pool.query('UPDATE notification_preferences SET optional_whatsapp=false WHERE user_id=$1', [buyer.id]);
  const removed = await queue(agent); denied.push(removed);
  await pool.query("UPDATE deal_participants SET status='removed' WHERE user_id=$1", [agent.id]);
  const at = calls.length; await dispatch(); assert.equal(calls.length, at);
  for (const id of denied) assert.equal((await state(id)).status, 'cancelled');
  await pool.query('UPDATE notification_preferences SET optional_whatsapp=true WHERE user_id=$1', [buyer.id]);
  pass('outsider, removed agent, agent document updates and STOP preferences cause zero provider calls');
  let gated=await queue(buyer);
  await pool.query("UPDATE users SET status='suspended' WHERE id=$1",[buyer.id]);
  const beforeGated=calls.length;await dispatch();assert.equal((await state(gated)).status,'cancelled');
  await pool.query("UPDATE users SET status='verified' WHERE id=$1",[buyer.id]);
  const fingerprint=createHmac('sha256',secret).update(buyer.phone).digest('hex');
  await pool.query("INSERT INTO audit_logs(action,entity_type,metadata,created_at) VALUES('whatsapp_consent_withdrawn','whatsapp_consent',$1,clock_timestamp())",
    [JSON.stringify({fingerprint,status:'withdrawn',policyVersion:mod.consentVersion(mod.POLICY_VERSION)})]);
  gated=await queue(buyer);await dispatch();assert.equal((await state(gated)).status,'blocked');
  await pool.query("INSERT INTO audit_logs(action,entity_type,metadata,created_at) VALUES('whatsapp_consent_recorded','whatsapp_consent',$1,clock_timestamp())",
    [JSON.stringify({fingerprint,status:'accepted',policyVersion:mod.consentVersion(mod.POLICY_VERSION)})]);
  gated=await queue(buyer);await pool.query("UPDATE users SET phone='10000009999' WHERE id=$1",[buyer.id]);
  await dispatch();assert.equal((await state(gated)).status,'blocked');assert.equal(calls.length,beforeGated);
  await pool.query('UPDATE users SET phone=$2 WHERE id=$1',[buyer.id,buyer.phone]);
  pass('suspension, withdrawn consent and changed phone without fresh consent block queued delivery');
  await pool.query("UPDATE whatsapp_customer_windows SET last_inbound_at=now()-interval '25 hours' WHERE user_id=$1", [seller.id]);
  let id = await queue(seller, 'document_reviewed'); await dispatch(); assert.equal((await state(id)).status, 'accepted');
  assert.equal(calls.at(-1).type, 'template');
  approved = false; id = await queue(seller); const n = calls.length; await dispatch();
  assert.equal((await state(id)).status, 'blocked'); assert.equal(calls.length, n); approved = true;
  pass('expired window sends only exact approved utility template; paused approval blocks before POST');
  mode = 'rate'; id = await queue(buyer); await dispatch(); assert.equal((await state(id)).status, 'retry');
  for (let i = 0; i < 2; i++) { await pool.query("UPDATE whatsapp_shipment_outbox SET next_attempt_at=now()-interval '1 second' WHERE notification_id=$1", [id]); await dispatch(); }
  assert.equal((await state(id)).status, 'blocked'); assert.equal((await state(id)).attempts, 3);
  mode = 'timeout'; id = await queue(buyer); await dispatch(); assert.equal((await state(id)).status, 'uncertain');
  const neverAgain = calls.length; mode = 'ok'; await dispatch(); assert.equal(calls.length, neverAgain);
  assert.equal((await call(`/admin/notifications/whatsapp-shipment-outbox/${(await state(id)).id}/retry`, {}, admin.token)).status, 409);
  pass('confirmed rate limits back off and stop at three attempts; timeout stays uncertain and cannot be manually resent');
  const malformed=[{}, {success:true}, {messages:[{id:''}]}, {messages:[{id:'   '}]}, {messages:[{id:12}]},
    {messages:[{id:'wamid.one'},{id:'wamid.two'}]}, {error:{code:1},messages:[{id:'wamid.contradictory'}]}];
  for(const payload of malformed){
    ackPayload=payload;mode='ack';const notice=await queue(buyer);const before=calls.length;
    const outcome=await dispatch();assert.equal(outcome.accepted,0);assert.equal(outcome.uncertain,1);
    const quarantined=await state(notice);assert.equal(quarantined.status,'uncertain');assert.equal(quarantined.provider_message_id,null);
    assert.equal(quarantined.delivery_status,'unconfirmed');assert.equal(calls.length-before,1);
    await mod.recordSignedShipmentStatuses([{id:'wamid.cannot_match_missing_id',status:'delivered',recipient_id:buyer.phone,timestamp:String(Math.floor(Date.now()/1000))}]);
    assert.equal((await state(notice)).delivery_status,'unconfirmed');
    mode='ok';const once=calls.length;await dispatch();assert.equal(calls.length,once,'unknown 2xx is not resent');
    assert.equal((await call(`/admin/notifications/whatsapp-shipment-outbox/${quarantined.id}/retry`,{},admin.token)).status,409);
  }
  pass('missing/malformed/contradictory 2xx acknowledgements have no provider ID, context or delivery confirmation; receipts and admin retry cannot release them');
  mode = 'early'; id = await queue(buyer); await dispatch(); const sent = await state(id);
  assert.equal(sent.delivery_status, 'delivered'); mode = 'ok';
  assert.equal((await pool.query('SELECT recipient_user_id,deal_id FROM whatsapp_message_contexts WHERE provider_message_id=$1',[sent.provider_message_id])).rows[0].recipient_user_id,buyer.id);
  const payload = { entry: [{ changes: [{ value: { metadata: { phone_number_id: '12345678' }, statuses: [{
    id: sent.provider_message_id, status: 'read', recipient_id: buyer.phone, timestamp: String(Math.floor(Date.now() / 1000)),
  }] } }] }] };
  const postReceipt=async value=>{
    const raw=JSON.stringify(value), signature='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
    return fetch(origin+'/webhooks/whatsapp',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signature},body:raw});
  };
  const wrongSender=structuredClone(payload);wrongSender.entry[0].changes[0].value.metadata.phone_number_id='99999999';
  await postReceipt(wrongSender);assert.equal((await state(id)).delivery_status,'delivered');
  const wrongRecipient=structuredClone(payload);wrongRecipient.entry[0].changes[0].value.statuses[0].recipient_id=seller.phone;
  await postReceipt(wrongRecipient);assert.equal((await state(id)).delivery_status,'delivered');
  const raw = JSON.stringify(payload), signature = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal((await fetch(origin + '/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature }, body: raw })).status, 200);
  assert.equal((await state(id)).delivery_status, 'read');
  assert.equal((await fetch(origin + '/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=wrong' }, body: raw })).status, 401);
  pass('early receipts reconcile after acceptance; real signed callback updates delivered→read; invalid HMAC denied');
  process.env.WHATSAPP_VERIFICATION_REPLAY_USER_IDS=buyer.id;
  process.env.WHATSAPP_DEAL_STATUS_REPLAY_ID=deal;process.env.WHATSAPP_DEAL_SUMMARY_REPLAY_ID=deal;
  const beforeLegacy=calls.length;
  // Expired-window seller is excluded even when an operator supplied replay IDs.
  mode='ack';ackPayload={};
  const runs=await Promise.all([mod.replayVerificationWhatsAppNotifications(),mod.replayVerificationWhatsAppNotifications()]);
  assert.equal(runs.reduce((n,r)=>n+r.sent,0),0);assert.equal(runs.reduce((n,r)=>n+(r.uncertain??0),0),1);
  for(const replay of [mod.replayDealStatusWhatsAppNotification,mod.replayDealSummaryWhatsAppNotification]){
    const pair=await Promise.all([replay(),replay()]);assert.equal(pair.reduce((n,r)=>n+r.sent,0),0);
  }
  assert.equal(calls.length-beforeLegacy,3,'one attempt for buyer per replay family; seller window expired');
  assert.equal(Number((await pool.query("select count(*) from notifications where type in ('verification_whatsapp_sent',$1,$2)",['deal_status_whatsapp_sent_'+deal+'_initiated','deal_summary_whatsapp_sent_'+deal])).rows[0].count),0,'no false sent markers');
  const cold=await import(directory+'/app.mjs?cold-replay');
  try{
    await cold.replayVerificationWhatsAppNotifications();await cold.replayDealStatusWhatsAppNotification();await cold.replayDealSummaryWhatsAppNotification();
  }finally{await cold.pool.end();}
  assert.equal(calls.length-beforeLegacy,3,'durable pre-send markers survive module restart and block ambiguous replay');
  delete process.env.WHATSAPP_VERIFICATION_REPLAY_USER_IDS;delete process.env.WHATSAPP_DEAL_STATUS_REPLAY_ID;delete process.env.WHATSAPP_DEAL_SUMMARY_REPLAY_ID;mode='ok';
  pass('all legacy replay families persist claims before Meta, enforce consent/window/membership and cannot call missing-ID responses sent or replay them across workers/restart');
  id=await queue(buyer);
  await pool.query("UPDATE whatsapp_shipment_outbox SET status='leased',claim_token=$2,lease_until=now()-interval '1 second',attempts=1 WHERE notification_id=$1",[id,randomUUID()]);
  const beforeCrash=calls.length;await dispatch();assert.equal((await state(id)).status,'uncertain');assert.equal(calls.length,beforeCrash);
  pass('expired worker leases are quarantined and audited without another Meta submission');
  const view = await call('/admin/notifications/whatsapp-shipment-outbox', null, admin.token, 'GET');
  assert.equal(view.status, 200); assert.equal(view.body.dispatchEnabled, true);
  assert.equal((await call('/admin/notifications/whatsapp-shipment-outbox', null, buyer.token, 'GET')).status, 403);
  assert.ok(!JSON.stringify(view.body).includes(buyer.phone));
  assert.ok(Number((await pool.query("SELECT count(*) FROM audit_logs WHERE action='whatsapp_notification_outcome'")).rows[0].count) > 0);
  pass('admin sees sanitized delivery/failure metadata and audited state transitions; non-admin denied');
  console.log(`PASSED: ${checks} real PostgreSQL shipment delivery scenarios; no real messages or external calls.`);
} finally {
  globalThis.fetch = originalFetch;
  if (server) await new Promise(r => server.close(r));
  if (pool) await pool.end();
  await rm(directory, { recursive: true, force: true });
}
