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
    insert: () => ({ values: (row) => ({
      onConflictDoNothing: async () => { if (!g.row) g.row = row; return []; },
      onConflictDoUpdate: async ({ set }) => { if (g.row) Object.assign(g.row, set); else g.row = row; return []; },
      returning: async () => [row],
    }) }),
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
    ), '5600');
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
