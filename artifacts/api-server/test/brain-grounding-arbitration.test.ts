import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

process.env.SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL || 'postgres://synthetic:synthetic@127.0.0.1:1/synthetic';
process.env.WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || 'synthetic-test-secret-000000';
process.env.AKIF_BRAIN_ORCHESTRATOR = 'on';
process.env.AKIF_GROQ = 'on';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'synthetic-groq-key';
process.env.GROQ_MODEL = process.env.GROQ_MODEL || 'synthetic-model';
process.env.GROQ_BASE_URL = 'http://127.0.0.1:1'; // any real provider call fails fast, never reaches a network

// 17 Nov live owner test, the three demonstrated failures main listed:
//  1. fabricated price: the copper thread's user-stated "5600usd per mt"
//     reappeared in a reply about SUGAR - rejected by the new grounding guard
//  2. stale product context: the guard scopes user statements to the current
//     product thread, so old-thread prices never ground a new product's reply
//  3. cross-path duplicate outbound: a human-relay answer landing mid-turn
//     suppresses the brain's late reply (never recorded, never sent)
// Drives the REAL runBrainTurn with an injected chat (its documented seam)
// and the same fixture db semantics as the forced-429 test.

async function bundleOut(stdinContents: string, fixtures: Record<string, string>, mapExtra: Array<[RegExp, string]>) {
  const output = fileURLToPath(new URL(`./fga-${randomUUID()}.mjs`, import.meta.url));
  const out = await build({
    stdin: { contents: stdinContents, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
    plugins: [{ name: 'fga-fixture', setup(b) {
      for (const [filter, path] of mapExtra) b.onResolve({ filter }, () => ({ path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => {
        if (!(args.path in fixtures)) throw new Error('unstubbed module: ' + args.path);
        return { contents: fixtures[args.path] };
      });
    } }],
  });
  await writeFile(output, out.outputFiles[0].text);
  return output;
}

const TABLES = 'akifCustomerMemoriesTable akifEmotionalStatesTable akifResearchRunsTable akifSharedLessonsTable akifTasksTable auditLogsTable authSessionsTable buyerPoolAllocationsTable buyerPoolsTable buyerRequestsTable commissionsTable companiesTable companyVerificationDocumentsTable customsClearanceTable dealCasesTable dealConversationEventsTable dealFeedbackTable dealFinancialsTable dealMeetingsTable dealParticipantsTable dealsTable documentAccessTable documentExtractionsTable documentsTable inspectionsTable matchesTable messagesTable notificationPreferencesTable notificationsTable productsTable referralsTable sellerListingsTable shipmentCargoUnitsTable shipmentTrackingEventsTable shipmentWatchesTable shipmentsTable userRoleChangeRequestsTable usersTable vaultAccessLogTable whatsappChatSessionsTable whatsappInboundDedupTable whatsappIntakeDraftsTable whatsappMessageContextsTable whatsappShipmentOutboxTable whatsappUserContextsTable whatsappVoicePreferencesTable whatsappWebhookInboxTable dealIntelligenceSnapshotsTable whatsappSigninChallengesTable vaultDeletionRequestsTable vaultUploadLinksTable'.split(' ');

const dbFixture = `
  const g = globalThis.__fga;
  g.row = null;           // the one whatsapp_chat_sessions row
  function walk(chunks, out) {
    for (const c of chunks || []) {
      if (c === null || c === undefined) continue;
      if (typeof c !== 'object') { out.push(c); continue; }
      if (Array.isArray(c.value)) { if (c.value.some(x => typeof x !== 'string')) walk(c.value, out); continue; }
      if (c.queryChunks) { walk(c.queryChunks, out); continue; }
      if ('value' in c) out.push(c.value);
    }
    return out;
  }
  function paramsOf(q) { return walk(q.queryChunks || (q.sql && q.sql.queryChunks) || [], []); }
  function chain(rowProvider) {
    const q = {
      from: (t) => { q._t = t && t._tableName; return q; },
      where: () => q, innerJoin: () => q, orderBy: () => q, for: () => q,
      limit: () => q,
      then: (res, rej) => Promise.resolve().then(() => rowProvider(q._t)).then(res, rej),
    };
    return q;
  }
  export const db = {
    select: () => chain((t) => t === 'whatsappChatSessionsTable' ? (g.row ? [g.row] : []) : []),
    execute: async (q) => {
      const p = paramsOf(q);
      // Outbound reservation ledger (single-statement conditional append):
      // emulate it atomically - reserve all keys or none, TTL 10 minutes.
      const keysJson = p.find(v => typeof v === 'string' && v.startsWith('["'));
      const pathParam = p.find(v => v === 'brain' || v === 'relay');
      const stateParam = p.find(v => v === 'confirmed' || v === 'unknown');
      if (keysJson && pathParam) {
        if (g.failReserve) throw new Error('synthetic reservation store outage');
        // Reserve: block on ANY matching key entry, any state, any age.
        const keysArr = JSON.parse(keysJson);
        const key = p.find(v => typeof v === 'string' && /:brain1$/.test(v));
        if (!g.row || g.row.phoneHash !== key) return { rowCount: 0 };
        const brain = g.row.data.brain;
        brain.outbound = brain.outbound || [];
        const blocked = brain.outbound.some(e => keysArr.includes(e.key));
        if (blocked) return { rowCount: 0 };
        const atIso = new Date().toISOString();
        for (const k of keysArr) brain.outbound.push({ key: k, path: pathParam, state: 'pending', at: atIso });
        brain.v = (brain.v ?? 0) + 1;
        return { rowCount: 1 };
      }
      if (keysJson && !pathParam && !stateParam) {
        // clearStalePendingOutbound: delete only stale pending entries for the keys.
        const keysArr = JSON.parse(keysJson);
        const key = p.find(v => typeof v === 'string' && /:brain1$/.test(v));
        if (g.row && g.row.phoneHash === key) {
          const brain = g.row.data.brain;
          brain.outbound = (brain.outbound || []).filter(e =>
            !(keysArr.includes(e.key) && e.state === 'pending' && Date.now() - Date.parse(e.at) >= 600000));
        }
        return { rowCount: 1 };
      }
      if (keysJson && stateParam) {
        // Mark outcome: pending -> confirmed/unknown.
        const keysArr = JSON.parse(keysJson);
        const key = p.find(v => typeof v === 'string' && /:brain1$/.test(v));
        if (g.row && g.row.phoneHash === key) {
          for (const e of (g.row.data.brain.outbound || [])) {
            if (keysArr.includes(e.key) && e.state === 'pending') e.state = stateParam;
          }
        }
        return { rowCount: 1 };
      }
      // Whole-session save (saveBrainSession): replace data but keep the LIVE
      // outbound ledger, exactly like the production jsonb_set merge.
      const brainDataJson = p.find(v => typeof v === 'string' && v.startsWith('{"brain"'));
      if (brainDataJson) {
        const key = p.find(v => typeof v === 'string' && /:brain1$/.test(v));
        const data = JSON.parse(brainDataJson);
        if (g.row && g.row.phoneHash === key) {
          const liveOutbound = (g.row.data.brain && g.row.data.brain.outbound) || [];
          g.row.data = data;
          g.row.data.brain.outbound = liveOutbound;
        } else if (!g.row) {
          g.row = { phoneHash: key, purpose: 'brain_orchestrator', step: 0, data, lastMessageId: null };
        }
        return { rowCount: 1 };
      }
      const entryRaw = p.find(v => typeof v === 'string' && v.startsWith('{"role"'));
      if (entryRaw === undefined) return { rowCount: 0 };
      const entry = JSON.parse(entryRaw);
      const key = p.find(v => typeof v === 'string' && !v.startsWith('{"role"'));
      const mid = p.filter(v => typeof v === 'string' || v === null).pop() ?? null;
      if (!g.row || g.row.phoneHash !== key) return { rowCount: 0 };
      const brain = g.row.data.brain;
      if (mid != null && brain.history.some(h => h.messageId === mid)) return { rowCount: 0 };
      brain.history = [...brain.history, entry];
      brain.v = (brain.v ?? 0) + 1;
      return { rowCount: 1 };
    },
    insert: () => ({ values: (row) => {
      // The session row is the only stateful insert; other tables (inbound
      // dedup claims, audit rows) just record and report success.
      const isSession = row && typeof row === 'object' && 'purpose' in row;
      return {
        onConflictDoNothing: () => {
          let had = false;
          if (isSession) { had = !!g.row; if (!had) g.row = row; }
          else { (g.otherInserts = g.otherInserts || []).push(row); }
          const r = { returning: async () => (had ? [] : [row]) };
          r.then = (f) => Promise.resolve([]).then(f); // legacy await support
          return r;
        },
        onConflictDoUpdate: ({ set }) => {
          if (isSession) { if (g.row) Object.assign(g.row, set); else g.row = row; }
          const r = Promise.resolve([]);
          r.returning = async () => [row];
          return r;
        },
        returning: async () => [row],
      };
    } }),
    update: () => ({ set: (v) => ({ where: (cond) => ({ returning: async () => {
      const nums = paramsOf(cond).filter(v => typeof v === 'number');
      const cas = nums[nums.length - 1];
      if (!g.row || (g.row.data.brain.v ?? 0) !== cas) return [];
      g.row.data = v.data; g.row.expiresAt = v.expiresAt; g.row.updatedAt = v.updatedAt;
      return [{ phoneHash: g.row.phoneHash }];
    } }) }) }),
    delete: () => ({ where: async () => [] }),
    transaction: async (f) => f({ execute: async () => ({ rows: [] }) }),
  };
  // dbWrite mirrors the real module: run the write against the fixture db
  // (no pool eviction in the harness - alignment, not behavior under test).
  export const dbWrite = async (run) => run(db);
  export const pool = {};
  ${TABLES.map(n => `export const ${n}=new Proxy({_tableName:'${n}'},{get:(t,k)=>typeof k==='symbol'?undefined:(k==='_tableName'?t._tableName:{key:String(k)})});`).join('\n  ')}
`;

test('price grounding guard: fabricated and stale-thread prices are rejected, grounded prices pass', async () => {
  const output = await bundleOut(
    "export { ungroundedPriceAssertion, currentProductUserStatements } from '../src/akif/conversationPolicy';",
    {},
    [],
  );
  try {
    const m = await import(output);
    const copperThread = [
      { role: 'user', content: 'We seller copper' },
      { role: 'user', content: 'My price is 5600usd per mt' },
      { role: 'assistant', content: 'What quantity of copper (in mt)?' },
    ];
    const sugarThread = [
      ...copperThread,
      { role: 'user', content: 'Hey' },
      { role: 'user', content: 'I have sugar icumsa 45' },
      { role: 'user', content: 'Kenya' },
    ];
    // The exact live failure: copper's price quoted for sugar.
    assert.equal(m.ungroundedPriceAssertion(
      'Got it - sugar ICUMSA 45 from Kenya at 5600 USD per mt. Please tell me the quantity (in mt) you\'d like to offer.',
      m.currentProductUserStatements(sugarThread, 'what do you think'),
    ), '5600 usd');
    // Same price, copper thread still current: grounded, allowed.
    assert.equal(m.ungroundedPriceAssertion(
      'Confirmed: 5600 USD per mt for the copper.',
      m.currentProductUserStatements(copperThread, 'ok'),
    ), null);
    // Adversarial numerics: quantities, product specs and phone numbers are not price assertions.
    assert.equal(m.ungroundedPriceAssertion('Which port would the 5,000 MT ship from?', ['5000mt']), null);
    assert.equal(m.ungroundedPriceAssertion('Noted, ICUMSA 45 sugar.', ['I have sugar icumsa 45']), null);
    assert.equal(m.ungroundedPriceAssertion('What price per MT are you offering?', ['Kenya']), null);
    // Scope: the copper thread's bare price message stays with copper.
    assert.deepEqual(m.currentProductUserStatements(sugarThread, 'what do you think'),
      ['I have sugar icumsa 45', 'Kenya', 'what do you think']);
    // No product anywhere: the whole conversation grounds.
    assert.deepEqual(m.currentProductUserStatements([{ role: 'user', content: 'hello' }], 'hi again'), ['hello', 'hi again']);
  } finally { await unlink(output); }
});

test('live transcript replay: the 5600 fabrication turn is rejected, facts stay intact', async () => {
  (globalThis as any).__fga = {};
  const output = await bundleOut(
    "export { runBrainTurn, recordBrainInbound } from '../src/akif/brainOrchestrator';",
    { db: dbFixture },
    [[/^@workspace\/db$/, 'db']],
  );
  try {
    const g = (globalThis as any).__fga;
    const m = await import(output);
    const phone = '91000000098';
    // Seed the earlier copper thread exactly as captured live.
    await m.recordBrainInbound(phone, 'We seller copper', 'w1');
    await m.recordBrainInbound(phone, 'My price is 5600usd per mt', 'w2');
    g.row.data.brain.history.push({ role: 'assistant', content: 'What quantity of copper (in mt) would you like to offer?', messageId: 'reply:w2' });
    // The new product thread.
    await m.recordBrainInbound(phone, 'I have sugar icumsa 45', 'w3');
    const chatFabricates = async () => ({ content: "Got it - sugar ICUMSA 45 from Kenya at 5600 USD per mt. Please tell me the quantity (in mt) you'd like to offer.", toolCalls: [] });
    // The turn that fabricated live: must now be rejected to the scripted chain.
    const out = await m.runBrainTurn({ phone, text: 'Kenya', messageId: 'w4' }, chatFabricates);
    assert.equal(out, null, 'fabricated-price turn rejected to the scripted chain');
    const brain = g.row.data.brain;
    assert.ok(!brain.history.some((h: any) => h.role === 'assistant' && h.content.includes('5600 USD per mt')), 'fabricated reply never recorded');
    // The customer's own words survived the rejected turn, in order.
    const contents = brain.history.map((h: any) => h.content);
    assert.ok(contents.includes('I have sugar icumsa 45'), 'sugar fact retained');
    assert.ok(contents.includes('Kenya'), 'Kenya retained');
  } finally { await unlink(output); }
});

test('cross-path arbitration: a relay answer mid-turn suppresses the brain reply; normal turns still send', async () => {
  (globalThis as any).__fga = {};
  const output = await bundleOut(
    "export { runBrainTurn, recordBrainRelayAnswer } from '../src/akif/brainOrchestrator';",
    { db: dbFixture },
    [[/^@workspace\/db$/, 'db']],
  );
  try {
    const g = (globalThis as any).__fga;
    const m = await import(output);
    const phone = '91000000097';
    // The relay answer lands while the model call is in flight (stale claim
    // expiry makes no difference: detection is the recorded answer itself).
    const chatSlow = async () => {
      await m.recordBrainRelayAnswer(phone, 'What quantity of ICUMSA 45 sugar do you have available?', 'relay:item-live-1');
      return { content: 'Got it - noted the sugar. How many mt?', toolCalls: [] };
    };
    const out = await m.runBrainTurn({ phone, text: 'I have sugar icumsa 45', messageId: 'r1' }, chatSlow);
    assert.ok(out && out.handled, 'turn counts as handled (no scripted fallback duplicates)');
    assert.equal(out.reply, null, 'brain reply suppressed: relay already answered');
    const brain = g.row.data.brain;
    assert.ok(brain.history.some((h: any) => h.messageId === 'relay:item-live-1'), 'relay answer recorded');
    assert.ok(!brain.history.some((h: any) => h.content === 'Got it - noted the sugar. How many mt?'), 'undelivered brain reply never recorded');
    // A later turn with no relay interference still answers and records normally.
    const chatNormal = async () => ({ content: 'Which port would it ship from?', toolCalls: [] });
    const out2 = await m.runBrainTurn({ phone, text: '5000mt', messageId: 'r2' }, chatNormal);
    assert.ok(out2 && out2.handled && out2.reply === 'Which port would it ship from?', 'distinct follow-up turn still sends');
    assert.ok(g.row.data.brain.history.some((h: any) => h.messageId === 'reply:r2'), 'normal reply recorded');
  } finally { await unlink(output); }
});

test('outbound reservation ledger: strict states - nothing auto-frees, blocked-by classification, explicit stale-pending clear', async () => {
  (globalThis as any).__fga = {};
  const output = await bundleOut(
    "export { reserveOutboundSend, clearStalePendingOutbound, markOutboundSend, recordBrainInbound, OUTBOUND_RESERVE_TTL_SECS } from '../src/akif/brainOrchestrator';",
    { db: dbFixture },
    [[/^@workspace\/db$/, 'db']],
  );
  try {
    const g = (globalThis as any).__fga;
    const m = await import(output);
    const phone = '91000000096';
    await m.recordBrainInbound(phone, 'hello', 'k1');
    const cover1 = [{ messageId: 'w10', text: 'how much sugar?' }];
    // First path wins; the relay competing on the same wamid loses.
    assert.equal(await m.reserveOutboundSend(phone, cover1, 'brain'), 'reserved');
    assert.equal(await m.reserveOutboundSend(phone, cover1, 'relay'), 'pending', 'competitor sees pending');
    // The same path re-reserving is NOT a safe retry - it is blocked too
    // (a crash after provider-accept before the outcome write must not dup).
    assert.equal(await m.reserveOutboundSend(phone, cover1, 'brain'), 'pending', 'same-path re-reserve blocked');
    // Distinct wamids always pass - two legitimate same-text messages are
    // never conflated.
    const cover2 = [{ messageId: 'w11', text: 'how much sugar?' }];
    assert.equal(await m.reserveOutboundSend(phone, cover2, 'relay'), 'reserved', 'distinct wamid not blocked');
    // Text-key fallback (no wamid, e.g. a relay item that never captured
    // one): a text-covered turn blocks normalized variants of the same text.
    const coverText = [{ text: 'packing in 50kg bags?' }];
    assert.equal(await m.reserveOutboundSend(phone, coverText, 'brain'), 'reserved');
    assert.equal(await m.reserveOutboundSend(phone, [{ text: '  PACKING in 50kg  bags? ' }], 'relay'), 'pending', 'normalized text variant blocked');
    // markOutboundSend settles the state; confirmed blocks indefinitely.
    await m.markOutboundSend(phone, cover1, 'confirmed');
    assert.equal(await m.reserveOutboundSend(phone, cover1, 'relay'), 'confirmed', 'confirmed state returned');
    // Unknown outcome is unresolved, not permission for a competing send.
    await m.markOutboundSend(phone, cover2, 'unknown');
    assert.equal(await m.reserveOutboundSend(phone, cover2, 'relay'), 'unknown', 'unknown outcome never frees');
    // Aging out does NOT free anything: stale pending is classified, and
    // confirmed/unknown entries stay blocking past the TTL.
    for (const e of g.row.data.brain.outbound) e.at = new Date(Date.now() - (m.OUTBOUND_RESERVE_TTL_SECS + 10) * 1000).toISOString();
    assert.equal(await m.reserveOutboundSend(phone, cover1, 'relay'), 'confirmed', 'confirmed never expires');
    assert.equal(await m.reserveOutboundSend(phone, cover2, 'relay'), 'unknown', 'unknown never expires');
    const cover3 = [{ messageId: 'w12', text: 'and the port?' }];
    assert.equal(await m.reserveOutboundSend(phone, cover3, 'brain'), 'reserved');
    for (const e of g.row.data.brain.outbound) e.at = new Date(Date.now() - (m.OUTBOUND_RESERVE_TTL_SECS + 10) * 1000).toISOString();
    assert.equal(await m.reserveOutboundSend(phone, cover3, 'relay'), 'stale_pending', 'aged pending classified stale_pending, still blocked');
    // Explicit human-reconciled clear removes ONLY stale pending entries.
    await m.clearStalePendingOutbound(phone, cover3);
    assert.equal(await m.reserveOutboundSend(phone, cover3, 'relay'), 'reserved', 'after explicit clear, reserve succeeds');
    // The clear never touches confirmed/unknown entries.
    await m.clearStalePendingOutbound(phone, cover1);
    assert.equal(await m.reserveOutboundSend(phone, cover1, 'relay'), 'confirmed', 'confirmed survives a clear attempt');
  } finally { await unlink(output); }
});

test('background continuation staleness: a reply computed before a newer inbound must not send', async () => {
  (globalThis as any).__fga = {};
  const output = await bundleOut(
    "export { backgroundStillCurrent, recordBrainInbound } from '../src/akif/brainOrchestrator';",
    { db: dbFixture },
    [[/^@workspace\/db$/, 'db']],
  );
  try {
    const g = (globalThis as any).__fga;
    const m = await import(output);
    const phone = '91000000097';
    // The inbound the background reply is answering; its reply gets recorded.
    await m.recordBrainInbound(phone, 'can you do 4000?', 'bg1');
    g.row.data.brain.history.push({ role: 'assistant', content: 'Let me check.', messageId: 'reply:bg1', at: new Date().toISOString() });
    assert.equal(await m.backgroundStillCurrent(phone, 'bg1'), true, 'no newer inbound: reply still current');
    // A customer follow-up lands AFTER the reply was computed: it is stale.
    await m.recordBrainInbound(phone, 'actually 3900', 'bg2');
    assert.equal(await m.backgroundStillCurrent(phone, 'bg1'), false, 'newer customer inbound: stale reply suppressed');
    // A relay answer recorded mid-turn also makes the background reply stale.
    g.row.data.brain.history.pop(); // drop bg2 for a clean relay case
    g.row.data.brain.history.push({ role: 'user', content: 'relay answer', messageId: 'relay:item-9', at: new Date().toISOString() });
    assert.equal(await m.backgroundStillCurrent(phone, 'bg1'), false, 'newer relay answer: stale reply suppressed');
  } finally { await unlink(output); }
});

test('relay reply route uses the arbitration ledger: held by a brain reservation, sends and records when free', async () => {
  (globalThis as any).__fga = {};
  const secret = process.env.WHATSAPP_APP_SECRET!;
  const phone = '91000000095';
  process.env.AKIF_HUMAN_RELAY_ENABLED = 'true';
  process.env.AKIF_HUMAN_RELAY_NUMBERS = phone;
  process.env.AKIF_RELAY_ANSWERS_ENABLED = 'true'; // arbitration coverage for a possible re-enable; production default is disabled
  const output = await bundleOut(
    [
      "export { default as relayRouter } from '../src/routes/akifHumanRelay';",
      "export { enqueueHumanRelay, pendingHumanRelay, __clearRelayMemoryForTests } from '../src/akif/humanRelay';",
      "export { reserveOutboundSend, markOutboundSend, recordBrainInbound } from '../src/akif/brainOrchestrator';",
    ].join('\n'),
    {
      db: dbFixture,
      webhookStub: `
        const g = globalThis.__fga;
        g.deliverCalls = [];
        export async function buildHumanRelayDraft() { return null; }
        export async function deliverHumanRelayReply(phone, text) { g.deliverCalls.push({ phone, text }); return { delivered: true, reason: 'sent' }; }
      `,
      waClient: `export async function sendWhatsAppVoiceNote() { throw new Error('not in test'); } export function isWindowClosedError() { return false; } export async function sendWhatsAppInteractive() { throw new Error('not in test'); } export async function sendWhatsAppText() { throw new Error('not in test'); }`,
      replySink: `export function replySinkEnabled() { return false; } export function replySinkSendAllowed() { return true; }`,
      chatUi: `export async function handleChatUi() { return false; }`,
      resendAuth: `export function resendTransportConfigured() { return false; } export function createResendAuthSender() { return async () => ({ ok: false }); }`,
      workerClient: `export function isAkifWorkerMediaEnabled() { return false; } export async function synthesizeAkifSpeechTimed() { throw new Error('not in test'); }`,
      voiceReply: `export function voiceRepliesEnabled() { return false; } export const MAX_SPOKEN_CHARS = 1500; export function speechBlockReason() { return 'off'; } export function speechKind() { return null; }`,
      emailChannel: `export function emailRelayTarget() { return null; } export function liveEmailRelayEnabled() { return false; }`,
      emailOutbound: `export function buildRelayEmailPayload() { return null; } export function outboundDepsFromEnv() { return {}; } export async function sendRelayEmail() { return { delivered: false, reason: 'not_in_test' }; }`,
      emailSend: `export function emailRelaySendDbPorts() { return {}; } export async function sendEmailRelayAnswer() { return { delivered: false, reason: 'not_in_test' }; }`,
    },
    [
      [/^@workspace\/db$/, 'db'],
      [/\.\/whatsappWebhook$/, 'webhookStub'],
      [/\.\.\/whatsapp\/client$/, 'waClient'],
      [/\.\.\/whatsapp\/replySink$/, 'replySink'],
      [/\.\.\/whatsapp\/chatUi$/, 'chatUi'],
      [/resendAuthProvider/, 'resendAuth'],
      [/workerClient$/, 'workerClient'],
      [/voiceReply/, 'voiceReply'],
      [/emailRelayChannel$/, 'emailChannel'],
      [/emailOutbound$/, 'emailOutbound'],
      [/emailRelaySend$/, 'emailSend'],
    ],
  );
  const { createServer } = await import('node:http');
  const { createHmac } = await import('node:crypto');
  let server: ReturnType<typeof createServer> | null = null;
  try {
    const g = (globalThis as any).__fga;
    const m = await import(output);
    m.__clearRelayMemoryForTests();
    // A held customer turn, exactly what the relay worker would answer.
    m.enqueueHumanRelay({ phone, kind: 'text', text: 'how much sugar?' });
    await m.recordBrainInbound(phone, 'hello', 'k1');
    const { default: express } = await import('express');
    const app = express();
    app.use(express.json({ verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; } }));
    app.use(m.relayRouter);
    server = createServer(app);
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as { port: number }).port;
    const post = async (body: Record<string, unknown>) => {
      const raw = Buffer.from(JSON.stringify(body));
      const sig = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
      const res = await fetch(`http://127.0.0.1:${port}/akif-relay/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-udc-relay-signature': sig },
        body: raw,
      });
      return { status: res.status, body: await res.json() };
    };
    // The brain holds a pending reservation for this customer text: the relay
    // reply is refused (answer_in_progress) and nothing is sent or answered.
    const cover = [{ text: 'how much sugar?' }];
    assert.equal(await m.reserveOutboundSend(phone, cover, 'brain'), 'reserved');
    const blocked = await post({ phone, text: 'About 4200 USD per mt.' });
    assert.equal(blocked.status, 409, 'relay reply held when the brain holds the turn');
    assert.equal(blocked.body.error, 'answer_in_progress');
    assert.equal(g.deliverCalls.length, 0, 'nothing sent for a held turn');
    assert.equal(m.pendingHumanRelay().length, 1, 'held item stays open, not marked answered');
    // Aging the reservation to stale_pending keeps it blocked with the
    // distinct stuck error - no worker flag can bypass it.
    for (const e of g.row.data.brain.outbound) e.at = new Date(Date.now() - 700 * 1000).toISOString();
    const stuck = await post({ phone, text: 'About 4200 USD per mt.' });
    assert.equal(stuck.status, 409);
    assert.equal(stuck.body.error, 'answer_stuck', 'stale pending reported distinctly');
    assert.equal(m.pendingHumanRelay().length, 1, 'stuck item stays open');
    // A CONFIRMED send by the brain auto-closes the held item (delivered
    // proof), and it can never be reclaimed.
    await m.markOutboundSend(phone, cover, 'confirmed');
    const dup = await post({ phone, text: 'About 4200 USD per mt.' });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error, 'already_answered');
    assert.equal(m.pendingHumanRelay().length, 0, 'confirmed answer auto-closes the held item');
    assert.equal(g.deliverCalls.length, 0, 'still nothing sent');
    // A turn nobody reserved: the relay answer goes out, and its confirmed
    // reservation then blocks a competing brain send for the same text.
    m.enqueueHumanRelay({ phone, kind: 'text', text: 'what is the moisture?' });
    const sent = await post({ phone, text: 'About 12 percent.', workerId: 'wk-test' });
    assert.equal(sent.status, 200, 'relay reply sends when the turn is free');
    assert.equal(sent.body.delivered, true);
    assert.equal(g.deliverCalls.length, 1, 'exactly one send');
    assert.equal(await m.reserveOutboundSend(phone, [{ text: 'what is the moisture?' }], 'brain'), 'confirmed', 'relay confirmed send blocks the brain');
    // Reservation store DOWN: the route fails CLOSED - 503, nothing sent,
    // the held item stays open for a later retry.
    m.enqueueHumanRelay({ phone, kind: 'text', text: 'packing details?' });
    g.failReserve = true;
    const outage = await post({ phone, text: 'In 50kg bags.', workerId: 'wk-test' });
    if (outage.status !== 503) console.error('OUTAGE BODY:', JSON.stringify(outage.body));
    assert.equal(outage.status, 503, 'reservation outage returns 503');
    assert.equal(outage.body.error, 'reservation_unavailable');
    assert.equal(g.deliverCalls.length, 1, 'still exactly one send total');
    assert.equal(m.pendingHumanRelay().length, 1, 'outage item stays held');
    g.failReserve = false;
    const recovered = await post({ phone, text: 'In 50kg bags.', workerId: 'wk-test' });
    assert.equal(recovered.status, 200, 'retry after recovery sends');
  } finally {
    if (server) await new Promise((r) => server!.close(() => r(undefined)));
    await unlink(output);
  }
});

test('real webhook: a rejected (fabricated-price) brain reply falls to the scripted hold - nothing fabricated is sent, capture intact', async () => {
  (globalThis as any).__fga = {};
  const secret = process.env.WHATSAPP_APP_SECRET!;
  const phone = '91000000094';
  process.env.AKIF_HUMAN_RELAY_ENABLED = 'true';
  process.env.AKIF_HUMAN_RELAY_NUMBERS = phone;
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';
  const output = await bundleOut(
    [
      "export { default as webhookRouter } from '../src/routes/whatsappWebhook';",
      "export { pendingHumanRelay, __clearRelayMemoryForTests } from '../src/akif/humanRelay';",
      "export { recordBrainInbound, reserveOutboundSend, markOutboundSend } from '../src/akif/brainOrchestrator';",
    ].join('\n'),
    {
      db: dbFixture,
      privacyGate: `
        // Test stance: the sender is a consented, unsuspended test number.
        export async function whatsappPrivacyGate() { return null; }
      `,
      waClient: `
        const g = globalThis.__fga;
        g.sends = [];
        export async function sendWhatsAppText(to, body) { g.sends.push({ to, body }); return { delivered: true, reason: 'sent' }; }
        export async function sendWhatsAppInteractive() { return { delivered: true, reason: 'sent' }; }
        export async function sendWhatsAppVoiceNote() { throw new Error('not in test'); }
        export async function sendWhatsAppReaction() { return { delivered: false, reason: 'not_in_test' }; }
        export function isWindowClosedError() { return false; }
        export async function markReadAndTyping() { return undefined; }
        export async function markRead() { return undefined; }
        export async function trackReplyFailures(f) { const failed = new Set(); await f(failed); }
        export async function sendWhatsAppDocument() { return { delivered: false, reason: 'not_in_test' }; }
        export async function sendWhatsAppImage() { return { delivered: false, reason: 'not_in_test' }; }
        export async function sendWhatsAppTextWithMenu(to, body) { g.sends.push({ to, body }); return { delivered: true, reason: 'sent' }; }
        export async function downloadWhatsAppMedia() { throw new Error('not in test'); }
      `,
    },
    [
      [/^@workspace\/db$/, 'db'],
      [/\.\.\/whatsapp\/client$/, 'waClient'],
      [/whatsappPrivacyGate$/, 'privacyGate'],
    ],
  );
  const { createServer } = await import('node:http');
  const { createHmac } = await import('node:crypto');
  let appServer: ReturnType<typeof createServer> | null = null;
  let groqStub: ReturnType<typeof createServer> | null = null;
  try {
    const g = (globalThis as any).__fga;
    // The provider stub: a model that fabricates the copper thread's price
    // into the sugar reply, exactly the live 17 Nov failure.
    groqStub = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        // The second scenario's inbound ("Kenya port?") gets a grounded,
        // price-free reply; everything else gets the fabricating model.
        const content = body.includes('Kenya port?')
          ? "Noted - Kenya for the sugar. What quantity in mt would you like to offer?"
          : "Got it - sugar ICUMSA 45 from Kenya at 5600 USD per mt. Please tell me the quantity (in mt) you'd like to offer.";
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
    });
    await new Promise<void>((r) => groqStub!.listen(0, '127.0.0.1', () => r()));
    process.env.GROQ_BASE_URL = `http://127.0.0.1:${(groqStub.address() as { port: number }).port}`;
    const m = await import(output);
    m.__clearRelayMemoryForTests();
    // Seed the copper thread exactly as captured live, then the sugar turn.
    await m.recordBrainInbound(phone, 'We seller copper', 'w1');
    await m.recordBrainInbound(phone, 'My price is 5600usd per mt', 'w2');
    g.row.data.brain.history.push({ role: 'assistant', content: 'What quantity of copper (in mt) would you like to offer?', messageId: 'reply:w2' });
    await m.recordBrainInbound(phone, 'I have sugar icumsa 45', 'w3');
    const { default: express } = await import('express');
    const app = express();
    app.use(express.json({ verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; } }));
    app.use((req: any, _res: any, next: any) => { req.log = { info() {}, warn() {}, debug() {}, error() {}, child() { return this; } }; next(); });
    app.use(m.webhookRouter);
    appServer = createServer(app);
    await new Promise<void>((r) => appServer!.listen(0, '127.0.0.1', () => r()));
    const port = (appServer.address() as { port: number }).port;
    const payload = {
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: 'test-phone-id' },
        contacts: [{ profile: { name: 'Test Seller' } }],
        messages: [{ id: 'wamid.fabricated-1', from: phone, timestamp: '1763300000', type: 'text', text: { body: 'Kenya' } }],
      } }] }],
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const sig = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    const res = await fetch(`http://127.0.0.1:${port}/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig },
      body: raw,
    });
    assert.equal(res.status, 200, 'webhook accepted');
    // The fabricated price never reached the customer: no send carries 5600.
    assert.ok(!g.sends.some((s: any) => typeof s.body === 'string' && s.body.includes('5600')), 'no fabricated-price send');
    // Scripted fallback behavior after the rejected reply: the turn is held
    // for the human relay queue (silent hold), not answered by the model.
    const held = m.pendingHumanRelay();
    assert.ok(held.some((i: any) => i.text === 'Kenya'), 'rejected turn held for the human relay');
    // Capture intact: the customer's own words are recorded in order; the
    // fabricated assistant reply is not.
    const brain = g.row.data.brain;
    const contents = brain.history.map((h: any) => h.content);
    assert.ok(contents.includes('I have sugar icumsa 45'), 'sugar fact captured');
    assert.ok(contents.includes('Kenya'), 'inbound captured through the rejected turn');
    assert.ok(!brain.history.some((h: any) => h.role === 'assistant' && h.content.includes('5600 USD per mt')), 'fabricated reply never recorded');

    // Suppression regression (the route must treat a confirmed reservation as
    // blocking - a string compare, not a truthiness check): the relay has a
    // CONFIRMED send covering the next inbound's wamid; the brain turn
    // produces a grounded reply, yet nothing may be sent.
    const coverG = [{ messageId: 'wamid.grounded-1', text: 'Kenya port?' }];
    assert.equal(await m.reserveOutboundSend(phone, coverG, 'relay'), 'reserved');
    await m.markOutboundSend(phone, coverG, 'confirmed');
    console.error('LEDGER STATE AFTER MARK:', JSON.stringify(g.row?.data?.brain?.outbound ?? null));
    const sendsBefore = g.sends.length;
    const payload2 = {
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: 'test-phone-id' },
        contacts: [{ profile: { name: 'Test Seller' } }],
        messages: [{ id: 'wamid.grounded-1', from: phone, timestamp: '1763300060', type: 'text', text: { body: 'Kenya port?' } }],
      } }] }],
    };
    const raw2 = Buffer.from(JSON.stringify(payload2));
    const sig2 = 'sha256=' + createHmac('sha256', secret).update(raw2).digest('hex');
    const res2 = await fetch(`http://127.0.0.1:${port}/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig2 },
      body: raw2,
    });
    assert.equal(res2.status, 200, 'second webhook accepted');
    if (g.sends.length !== sendsBefore) console.error('UNEXPECTED SENDS:', JSON.stringify(g.sends.slice(sendsBefore)));
    assert.equal(g.sends.length, sendsBefore, 'confirmed relay reservation suppresses the brain send');
    assert.ok(!g.sends.some((s: any) => typeof s.body === 'string' && s.body.includes('What quantity in mt')), 'grounded reply also suppressed when covered');

    // Fail-closed on storage outage: with the reservation store throwing,
    // the brain-first auto-answer must NOT go out (log-and-send is unsafe).
    g.failReserve = true;
    const payload3 = {
      entry: [{ changes: [{ value: {
        metadata: { phone_number_id: 'test-phone-id' },
        contacts: [{ profile: { name: 'Test Seller' } }],
        messages: [{ id: 'wamid.outage-1', from: phone, timestamp: '1763300120', type: 'text', text: { body: 'Kenya port?' } }],
      } }] }],
    };
    const raw3 = Buffer.from(JSON.stringify(payload3));
    const sig3 = 'sha256=' + createHmac('sha256', secret).update(raw3).digest('hex');
    const res3 = await fetch(`http://127.0.0.1:${port}/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig3 },
      body: raw3,
    });
    assert.equal(res3.status, 200, 'outage webhook accepted');
    assert.equal(g.sends.length, sendsBefore, 'reservation outage suppresses the auto-answer send');
    g.failReserve = false;
  } finally {
    if (appServer) await new Promise((r) => appServer!.close(() => r(undefined)));
    if (groqStub) await new Promise((r) => groqStub!.close(() => r(undefined)));
    await unlink(output);
  }
});

test('relay answers disabled (owner direction 17 Nov): reply and email-send refuse 410, nothing sent', async () => {
  (globalThis as any).__fga = {};
  const secret = process.env.WHATSAPP_APP_SECRET!;
  const phone = '91000000096';
  process.env.AKIF_HUMAN_RELAY_ENABLED = 'true';
  process.env.AKIF_HUMAN_RELAY_NUMBERS = phone;
  delete process.env.AKIF_RELAY_ANSWERS_ENABLED; // production default
  const output = await bundleOut(
    [
      "export { default as relayRouter } from '../src/routes/akifHumanRelay';",
      "export { enqueueHumanRelay, pendingHumanRelay, __clearRelayMemoryForTests, relayAnswersEnabled, scheduleRelayFallback } from '../src/akif/humanRelay';",
    ].join('\n'),
    {
      db: dbFixture,
      webhookStub: `
        const g = globalThis.__fga;
        g.deliverCalls = [];
        export async function buildHumanRelayDraft() { return null; }
        export async function deliverHumanRelayReply(phone, text) { g.deliverCalls.push({ phone, text }); return { delivered: true, reason: 'sent' }; }
      `,
      waClient: `export async function sendWhatsAppVoiceNote() { throw new Error('must not be called'); } export function isWindowClosedError() { return false; } export async function sendWhatsAppInteractive() { throw new Error('must not be called'); } export async function sendWhatsAppText() { throw new Error('must not be called'); }`,
      replySink: `export function replySinkEnabled() { return false; } export function replySinkSendAllowed() { return true; }`,
      chatUi: `export async function handleChatUi() { return false; }`,
      resendAuth: `export function resendTransportConfigured() { return false; } export function createResendAuthSender() { return async () => ({ ok: false }); }`,
      workerClient: `export function isAkifWorkerMediaEnabled() { return false; } export async function synthesizeAkifSpeechTimed() { throw new Error('must not be called'); }`,
      voiceReply: `export function voiceRepliesEnabled() { return false; } export const MAX_SPOKEN_CHARS = 1500; export function speechBlockReason() { return 'off'; } export function speechKind() { return null; }`,
      emailChannel: `export function emailRelayTarget() { return null; } export function liveEmailRelayEnabled() { return false; }`,
      emailOutbound: `export function buildRelayEmailPayload() { return null; } export function outboundDepsFromEnv() { return {}; } export async function sendRelayEmail() { throw new Error('must not be called'); }`,
      emailSend: `export function emailRelaySendDbPorts() { return {}; } export async function sendEmailRelayAnswer() { throw new Error('must not be called'); }`,
    },
    [
      [/^@workspace\/db$/, 'db'],
      [/\.\/whatsappWebhook$/, 'webhookStub'],
      [/\.\.\/whatsapp\/client$/, 'waClient'],
      [/\.\.\/whatsapp\/replySink$/, 'replySink'],
      [/\.\.\/whatsapp\/chatUi$/, 'chatUi'],
      [/resendAuthProvider/, 'resendAuth'],
      [/workerClient$/, 'workerClient'],
      [/voiceReply/, 'voiceReply'],
      [/emailRelayChannel$/, 'emailChannel'],
      [/emailOutbound$/, 'emailOutbound'],
      [/emailRelaySend$/, 'emailSend'],
    ],
  );
  const { createServer } = await import('node:http');
  const { createHmac } = await import('node:crypto');
  let server: ReturnType<typeof createServer> | null = null;
  try {
    const g = (globalThis as any).__fga;
    const m = await import(output);
    m.__clearRelayMemoryForTests();
    assert.equal(m.relayAnswersEnabled(), false, 'default is disabled');
    m.enqueueHumanRelay({ phone, kind: 'text', text: 'how much sugar?' });
    const { default: express } = await import('express');
    const app = express();
    app.use(express.json({ verify: (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; } }));
    app.use(m.relayRouter);
    server = createServer(app);
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as { port: number }).port;
    const post = async (path: string, body: Record<string, unknown>) => {
      const raw = Buffer.from(JSON.stringify(body));
      const sig = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-udc-relay-signature': sig },
        body: raw,
      });
      return { status: res.status, body: await res.json() };
    };
    const refused = await post('/akif-relay/reply', { phone, text: 'About 4200 USD per mt.', workerId: 'wk-test' });
    assert.equal(refused.status, 410, 'reply route refuses while disabled');
    assert.equal(refused.body.error, 'relay_disabled');
    assert.equal(g.deliverCalls.length, 0, 'nothing sent');
    assert.equal(m.pendingHumanRelay().length, 1, 'held item untouched: inbound evidence preserved');
    const mailRefused = await post('/akif-relay/email-send', { draftId: '00000000-0000-4000-8000-000000000000' });
    assert.equal(mailRefused.status, 410, 'email-send route refuses while disabled');
    assert.equal(mailRefused.body.error, 'relay_disabled');
    // The delayed fallback takeover is not scheduled while disabled.
    let fallbackSends = 0;
    m.scheduleRelayFallback({ id: 'x1', phone, at: new Date().toISOString(), kind: 'text', text: 'q', draft: 'draft answer', draftBackgroundDiscarded: false, answeredAt: null }, async () => { fallbackSends++; return { delivered: true }; }, 5);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(fallbackSends, 0, 'no delayed takeover fired');
  } finally {
    if (server) await new Promise((r) => server!.close(() => r(undefined)));
    await unlink(output);
  }
});
