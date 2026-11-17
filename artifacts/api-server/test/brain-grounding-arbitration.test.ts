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
      if (keysJson && pathParam) {
        const keysArr = JSON.parse(keysJson);
        const path = pathParam;
        const key = p.find(v => typeof v === 'string' && /:brain1$/.test(v));
        if (!g.row || g.row.phoneHash !== key) return { rowCount: 0 };
        const brain = g.row.data.brain;
        brain.outbound = brain.outbound || [];
        const nowMs = Date.now();
        const live = brain.outbound.filter(e => nowMs - Date.parse(e.at) < 600000);
        if (live.some(e => keysArr.includes(e.textKey))) return { rowCount: 0 };
        const atIso = new Date().toISOString();
        for (const k of keysArr) brain.outbound.push({ textKey: k, path, messageId: null, at: atIso });
        brain.v = (brain.v ?? 0) + 1;
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

test('outbound reservation ledger: first path wins, expiry frees, distinct messages never block, unknown-send stays blocked', async () => {
  (globalThis as any).__fga = {};
  const output = await bundleOut(
    "export { reserveOutboundSend, recordBrainInbound, OUTBOUND_RESERVE_TTL_SECS } from '../src/akif/brainOrchestrator';",
    { db: dbFixture },
    [[/^@workspace\/db$/, 'db']],
  );
  try {
    const g = (globalThis as any).__fga;
    const m = await import(output);
    const phone = '91000000096';
    await m.recordBrainInbound(phone, 'hello', 'k1');
    // The brain reserves the turn; the relay competing on the same text loses.
    assert.equal(await m.reserveOutboundSend(phone, ['how much sugar?'], 'brain', 'w10'), true);
    assert.equal(await m.reserveOutboundSend(phone, ['how much sugar?'], 'relay'), false, 'relay competitor blocked');
    // Normalization: case and whitespace variants are the same customer text.
    assert.equal(await m.reserveOutboundSend(phone, ['  HOW  MUCH sugar? '], 'relay'), false, 'normalized variant blocked');
    // A distinct customer message is never blocked by another message's reservation.
    assert.equal(await m.reserveOutboundSend(phone, ['and the port?'], 'relay'), true, 'distinct message not blocked');
    // Multi-key reserve is all-or-nothing: one held key fails the whole
    // attempt and records nothing for the other keys.
    assert.equal(await m.reserveOutboundSend(phone, ['fresh question', 'how much sugar?'], 'relay'), false, 'multi-key with a held key fails');
    assert.equal(await m.reserveOutboundSend(phone, ['fresh question'], 'relay'), true, 'failed multi-key attempt recorded nothing');
    // Unknown-send modeling: a reservation whose send outcome was never
    // confirmed stays in place - it is not permission for a competing send.
    assert.equal(await m.reserveOutboundSend(phone, ['and the port?'], 'brain'), false, 'relay reservation (unknown-send tolerant) blocks brain');
    // Expiry: reservations older than the TTL no longer block, so a crash
    // cannot wedge the line and a repeated genuine message can be answered.
    for (const e of g.row.data.brain.outbound) e.at = new Date(Date.now() - (m.OUTBOUND_RESERVE_TTL_SECS + 10) * 1000).toISOString();
    assert.equal(await m.reserveOutboundSend(phone, ['how much sugar?'], 'relay'), true, 'expired reservation frees the turn');
    assert.equal(await m.reserveOutboundSend(phone, ['how much sugar?'], 'brain'), false, 'fresh reservation blocks again');
  } finally { await unlink(output); }
});

test('relay reply route uses the arbitration ledger: held by a brain reservation, sends and records when free', async () => {
  (globalThis as any).__fga = {};
  const secret = process.env.WHATSAPP_APP_SECRET!;
  const phone = '91000000095';
  process.env.AKIF_HUMAN_RELAY_ENABLED = 'true';
  process.env.AKIF_HUMAN_RELAY_NUMBERS = phone;
  const output = await bundleOut(
    [
      "export { default as relayRouter } from '../src/routes/akifHumanRelay';",
      "export { enqueueHumanRelay, pendingHumanRelay, __clearRelayMemoryForTests } from '../src/akif/humanRelay';",
      "export { reserveOutboundSend, recordBrainInbound } from '../src/akif/brainOrchestrator';",
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
    // The brain answered this customer text already (its reservation holds):
    // the relay reply is refused and nothing is sent or marked answered.
    assert.equal(await m.reserveOutboundSend(phone, ['how much sugar?'], 'brain', 'w10'), true);
    const blocked = await post({ phone, text: 'About 4200 USD per mt.' });
    assert.equal(blocked.status, 409, 'relay reply held when the brain holds the turn');
    assert.equal(blocked.body.error, 'already_answered');
    assert.equal(g.deliverCalls.length, 0, 'nothing sent for a held turn');
    assert.equal(m.pendingHumanRelay().length, 1, 'held item stays open, not marked answered');
    // A turn nobody reserved: the relay answer goes out, and its reservation
    // then blocks a competing brain send for the same customer text.
    for (const e of g.row.data.brain.outbound) e.at = new Date(Date.now() - 700 * 1000).toISOString();
    const sent = await post({ phone, text: 'About 4200 USD per mt.' });
    assert.equal(sent.status, 200, 'relay reply sends when the turn is free');
    assert.equal(sent.body.delivered, true);
    assert.equal(g.deliverCalls.length, 1, 'exactly one send');
    assert.equal(await m.reserveOutboundSend(phone, ['how much sugar?'], 'brain'), false, 'relay reservation now blocks the brain');
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
      "export { recordBrainInbound } from '../src/akif/brainOrchestrator';",
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
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: "Got it - sugar ICUMSA 45 from Kenya at 5600 USD per mt. Please tell me the quantity (in mt) you'd like to offer." } }] }));
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
  } finally {
    if (appServer) await new Promise((r) => appServer!.close(() => r(undefined)));
    if (groqStub) await new Promise((r) => groqStub!.close(() => r(undefined)));
    await unlink(output);
  }
});
