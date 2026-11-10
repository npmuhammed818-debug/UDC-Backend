import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

process.env.SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL || 'postgres://synthetic:synthetic@127.0.0.1:1/synthetic'; // lazy pool; never connected
import { randomUUID } from 'node:crypto';

// Owner feedback 10 Nov: reply delay is the problem. These cover the three
// machine-side fixes: no dead draft retry wait while the orchestrator is off,
// wake-on-arrival claiming, and quoted-line context for the workers.

async function bundle(globalName: string, stdinContents: string, fixtures: Record<string, string>, mapExtra: Array<[RegExp, string]> = []) {
  const state: any = {};
  (globalThis as any)[globalName] = state;
  const output = fileURLToPath(new URL(`./lat-${randomUUID()}.mjs`, import.meta.url));
  const map: Array<[RegExp, string]> = [...mapExtra];
  const out = await build({
    stdin: { contents: stdinContents, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
    plugins: [{ name: 'lat-fixture', setup(b) {
      for (const [filter, path] of map) b.onResolve({ filter }, () => ({ path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => {
        if (!(args.path in fixtures)) throw new Error('unstubbed module: ' + args.path);
        return { contents: fixtures[args.path] };
      });
    } }],
  });
  await writeFile(output, out.outputFiles[0].text);
  return { state, output };
}

test('draft retry returns instantly while the orchestrator is off (no dead 5s wait)', async () => {
  const dbNames = 'akifCustomerMemoriesTable akifEmotionalStatesTable akifResearchRunsTable akifSharedLessonsTable akifTasksTable auditLogsTable authSessionsTable buyerPoolAllocationsTable buyerPoolsTable buyerRequestsTable commissionsTable companiesTable companyVerificationDocumentsTable customsClearanceTable dealCasesTable dealConversationEventsTable dealFeedbackTable dealFinancialsTable dealMeetingsTable dealParticipantsTable dealsTable documentAccessTable documentExtractionsTable documentsTable inspectionsTable matchesTable messagesTable notificationPreferencesTable notificationsTable productsTable referralsTable sellerListingsTable shipmentCargoUnitsTable shipmentTrackingEventsTable shipmentWatchesTable shipmentsTable userRoleChangeRequestsTable usersTable vaultAccessLogTable whatsappChatSessionsTable whatsappInboundDedupTable whatsappIntakeDraftsTable whatsappMessageContextsTable whatsappShipmentOutboxTable whatsappUserContextsTable whatsappVoicePreferencesTable whatsappWebhookInboxTable dealIntelligenceSnapshotsTable whatsappSigninChallengesTable vaultDeletionRequestsTable vaultUploadLinksTable'.split(' ');
  const dbStub = dbNames.map(n => `export const ${n}=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});`).join('')
    + "export const pool={};export const db={execute:async()=>({rows:[]}),transaction:async(f)=>f({execute:async()=>({rows:[]})}),select:()=>({from:()=>({where:()=>({limit:async()=>[]})})}),insert:()=>({values:()=>({returning:async()=>[],onConflictDoNothing:()=>({returning:async()=>[]})})}),update:()=>({set:()=>({where:()=>({returning:async()=>[]})})}),delete:()=>({where:async()=>[]})};"
    + "export const typeAkifTaskStep={};export const typeWhatsAppIntakeDraftPayload={};";
  const { output } = await bundle('__latDraft', "export { buildHumanRelayDraftWithRetry } from '../src/routes/whatsappWebhook';", {
    db: dbStub,
    brain: "export const isBrainOrchestratorEnabled=()=>false;export const runBrainTurn=async()=>null;export const BRAIN_TOOLS=[];export const BRAIN_BUSY_REPLY='busy';",
  }, [
    [/^@workspace\/db$/, 'db'],
    [/akif\/brainOrchestrator(\.ts)?$/, 'brain'],
  ]);
  try {
    const m = await import(output);
    const started = Date.now();
    const draft = await m.buildHumanRelayDraftWithRetry('10000000001', 'hello there');
    assert.equal(draft, null);
    assert.ok(Date.now() - started < 1000, `draft path took ${Date.now() - started}ms with the orchestrator off`);
  } finally { await unlink(output); }
});

test('wake-on-arrival claim returns as soon as an item lands', async () => {
  const { output } = await bundle('__latClaim', "export { claimHumanRelayWithWait, enqueueHumanRelay, claimHumanRelay } from '../src/akif/humanRelay';", {
    db: "export const db={execute:async()=>({rows:[]})};",
    orm: "export const sql=(parts,...values)=>({parts,values});",
  }, [
    [/^@workspace\/db$/, 'db'],
    [/^drizzle-orm$/, 'orm'],
  ]);
  try {
    const m = await import(output);
    const started = Date.now();
    const waiting = m.claimHumanRelayWithWait('worker-8', 5000);
    setTimeout(() => m.enqueueHumanRelay({ phone: '10000000002', kind: 'text', text: 'is my order on the way' }), 300);
    const item = await waiting;
    assert.ok(item, 'the waiting claim picked the item up');
    assert.equal(item.claimedBy, 'worker-8');
    const waited = Date.now() - started;
    assert.ok(waited < 2000, `pickup took ${waited}ms, expected well under a poll interval`);

    // Nothing pending: the wait expires on its own, quickly and cleanly.
    const none = await m.claimHumanRelayWithWait('worker-9', 600);
    assert.equal(none, null);
  } finally { await unlink(output); }
});

test('a quoted bot line travels from the outbound log into the claim payload', async () => {
  const { output } = await bundle('__latQuote', `
    export { recordOutboundMessage, quotedOutboundFor } from '../src/whatsapp/outboundLog';
    export { enqueueHumanRelay, claimHumanRelay } from '../src/akif/humanRelay';
  `, {
    db: "export const db={execute:async()=>({rows:[]})};",
    orm: "export const sql=(parts,...values)=>({parts,values});",
  }, [
    [/^@workspace\/db$/, 'db'],
    [/^drizzle-orm$/, 'orm'],
  ]);
  try {
    const m = await import(output);
    m.recordOutboundMessage('wamid.synthetic1', '10000000003', 'Your shipment leaves Kochi on Friday.');
    assert.equal(m.quotedOutboundFor('wamid.synthetic1', '10000000003'), 'Your shipment leaves Kochi on Friday.');
    // Another phone never sees it.
    assert.equal(m.quotedOutboundFor('wamid.synthetic1', '10000000099'), undefined);
    assert.equal(m.quotedOutboundFor(undefined, '10000000003'), undefined);

    const quoted = m.quotedOutboundFor('wamid.synthetic1', '10000000003');
    m.enqueueHumanRelay({ phone: '10000000003', kind: 'text', text: 'which Friday exactly', quotedText: quoted });
    const claim = m.claimHumanRelay('worker-3');
    assert.equal(claim.quotedText, 'Your shipment leaves Kochi on Friday.');
  } finally { await unlink(output); }
});

test('voice items are claimable only by voice-capable workers, and stale items never get a late answer', async () => {
  const { output } = await bundle('__latVoice', `
    export { enqueueHumanRelay, claimHumanRelay, answerClaimedHumanRelayItem, relayClaimStillValid } from '../src/akif/humanRelay';
  `, {
    db: "export const db={execute:async()=>({rows:[]})};",
    orm: "export const sql=(parts,...values)=>({parts,values});",
  }, [
    [/^@workspace\/db$/, 'db'],
    [/^drizzle-orm$/, 'orm'],
  ]);
  try {
    const m = await import(output);
    const voice = m.enqueueHumanRelay({ phone: '10000000010', kind: 'voice', text: '[voice note]' });
    // A text-only worker cannot see the voice item at all.
    assert.equal(m.claimHumanRelay('6'), null);
    // A voice-capable worker picks it up.
    const claim = m.claimHumanRelay('1');
    assert.equal(claim?.id, voice.id);
    // Inside the TTL the claim is exclusive, even for the other voice worker.
    assert.equal(m.claimHumanRelay('2', Date.now()), null, 'worker 1 still holds the claim inside the TTL');
    // Backdate worker-1's claim by claiming again as if 21s ago is not possible; instead
    // verify via a fresh phone: claim at t-21s, then confirm another worker can take it now.
    const v2 = m.enqueueHumanRelay({ phone: '10000000012', kind: 'text', text: 'price for 50 units' });
    const old = m.claimHumanRelay('8', Date.now() - 21_000);
    assert.equal(old?.id, v2.id);
    const regrabbed = m.claimHumanRelay('9', Date.now());
    assert.equal(regrabbed?.id, v2.id, 'expired claim must return to the pool');

    // Stale coverage: a newer message answered first covers the older open one.
    const older = m.enqueueHumanRelay({ phone: '10000000011', kind: 'text', text: 'do you beat their price' });
    await new Promise((r) => setTimeout(r, 5));
    const newer = m.enqueueHumanRelay({ phone: '10000000011', kind: 'text', text: 'good night, talk tomorrow' });
    const c2 = m.claimHumanRelay('3');
    assert.ok(c2, 'claim for phone 011');
    assert.ok(c2.claimedItemIds.includes(older.id) && c2.claimedItemIds.includes(newer.id), 'bundle owns the whole turn');
    // Answer the NEWER one first (bundle order: oldest first, so answer by id).
    const answered = m.answerClaimedHumanRelayItem(newer.id, '3', 'sleep well, we talk in the morning');
    assert.ok(answered, 'newer item answered');
    // The older item is now covered: claim and answer both refuse it.
    assert.equal(m.relayClaimStillValid(older.id, '3'), false);
    assert.equal(m.answerClaimedHumanRelayItem(older.id, '3', 'late reply'), null);
    assert.equal(m.claimHumanRelay('4'), null, 'no stale item returns to the pool');
  } finally { await unlink(output); }
});

test('skip releases items back to the pool; nothing is silently dropped', async () => {
  const { output } = await bundle('__latSkip', `
    export { enqueueHumanRelay, claimHumanRelay, releaseHumanRelayClaim, pendingHumanRelay } from '../src/akif/humanRelay';
  `, {
    db: "export const db={execute:async()=>({rows:[]})};",
    orm: "export const sql=(parts,...values)=>({parts,values});",
  }, [
    [/^@workspace\/db$/, 'db'],
    [/^drizzle-orm$/, 'orm'],
  ]);
  try {
    const m = await import(output);
    const voice = m.enqueueHumanRelay({ phone: '10000000020', kind: 'voice', text: '[voice note]' });
    // Voice lane claims, then skips: the item goes straight back to the pool.
    const claim = m.claimHumanRelay('1');
    assert.equal(claim?.id, voice.id);
    assert.equal(m.releaseHumanRelayClaim('10000000020'), 1, 'one claim released');
    assert.equal(m.claimHumanRelay('2')?.id, voice.id, 'the skipped item is claimable again');
    assert.equal(m.pendingHumanRelay().some((i) => i.id === voice.id && !i.answeredAt), true, 'never marked answered');
  } finally { await unlink(output); }
});

test('real worker ids (akif-worker-N) match their lanes by number', async () => {
  const { output } = await bundle('__latIds', `
    export { enqueueHumanRelay, claimHumanRelay } from '../src/akif/humanRelay';
  `, {
    db: "export const db={execute:async()=>({rows:[]})};",
    orm: "export const sql=(parts,...values)=>({parts,values});",
  }, [
    [/^@workspace\/db$/, 'db'],
    [/^drizzle-orm$/, 'orm'],
  ]);
  try {
    const m = await import(output);
    const voice = m.enqueueHumanRelay({ phone: '10000000030', kind: 'voice', text: '[voice note]' });
    assert.equal(m.claimHumanRelay('akif-worker-6'), null, 'text worker 6 never sees voice');
    assert.equal(m.claimHumanRelay('akif-worker-1')?.id, voice.id, 'voice worker 1 claims voice');
    const text = m.enqueueHumanRelay({ phone: '10000000031', kind: 'text', text: 'how do I join' });
    assert.equal(m.claimHumanRelay('akif-worker-1'), null, 'voice worker 1 never takes text');
    assert.equal(m.claimHumanRelay('akif-worker-7'), null, 'ongoing lane skips first contact');
    assert.equal(m.claimHumanRelay('akif-worker-4')?.id, text.id, 'intake worker 4 takes first contact');
  } finally { await unlink(output); }
});

test('a voice item older than 20s overflows to any text worker', async () => {
  const { output } = await bundle('__latOverflow', `
    export { enqueueHumanRelay, claimHumanRelay } from '../src/akif/humanRelay';
  `, {
    db: "export const db={execute:async()=>({rows:[]})};",
    orm: "export const sql=(parts,...values)=>({parts,values});",
  }, [
    [/^@workspace\/db$/, 'db'],
    [/^drizzle-orm$/, 'orm'],
  ]);
  try {
    const m = await import(output);
    const voice = m.enqueueHumanRelay({ phone: '10000000040', kind: 'voice', text: '[voice note]' });
    const t0 = Date.now();
    assert.equal(m.claimHumanRelay('akif-worker-6', t0), null, 'fresh voice stays with the voice lane');
    const later = t0 + 21_000;
    assert.equal(m.claimHumanRelay('akif-worker-6', later)?.id, voice.id, 'after 20s any text worker can take it');
  } finally { await unlink(output); }
});

test('a stale-covered oldest item never jams the phone queue behind it', async () => {
  const { output } = await bundle('__latJam', `
    export { enqueueHumanRelay, claimHumanRelay, answerClaimedHumanRelayItem } from '../src/akif/humanRelay';
  `, {
    db: "export const db={execute:async()=>({rows:[]})};",
    orm: "export const sql=(parts,...values)=>({parts,values});",
  }, [
    [/^@workspace\/db$/, 'db'],
    [/^drizzle-orm$/, 'orm'],
  ]);
  try {
    const m = await import(output);
    const t0 = Date.now();
    const old = m.enqueueHumanRelay({ phone: '10000000050', kind: 'text', text: 'old question' });
    old.at = new Date(t0 - 60_000).toISOString();
    const mid = m.enqueueHumanRelay({ phone: '10000000050', kind: 'text', text: 'newer question' });
    mid.at = new Date(t0 - 30_000).toISOString();
    // The newer one gets answered first: the oldest becomes stale-covered.
    const c = m.claimHumanRelay('worker-8');
    m.answerClaimedHumanRelayItem(mid.id, 'worker-8', 'answer to the newer one');
    assert.equal(m.claimHumanRelay('worker-8', t0 + 500), null, 'the stale oldest is not claimable');
    // A fresh message afterwards must still be claimable (no jam).
    const fresh = m.enqueueHumanRelay({ phone: '10000000050', kind: 'text', text: 'and one more thing' });
    assert.equal(m.claimHumanRelay('worker-8', t0 + 1000)?.id, fresh.id, 'queue is not jammed behind the stale item');
  } finally { await unlink(output); }
});
