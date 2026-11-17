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

// 16 Nov incident, the conversational regression main asked for: forced 429s
// on consecutive turns must not lose Kenya / 5000mt, the next successful turn
// must see them, and a turn-end merge racing a concurrent capture must
// re-merge instead of dropping it. Drives the REAL runBrainTurn with an
// injected chat (its documented seam) and a stateful fixture db that emulates
// the exact session semantics of the deployed SQL (which was separately
// verified live against Postgres).

async function bundleOut(stdinContents: string, fixtures: Record<string, string>, mapExtra: Array<[RegExp, string]>) {
  const output = fileURLToPath(new URL(`./f429-${randomUUID()}.mjs`, import.meta.url));
  const out = await build({
    stdin: { contents: stdinContents, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
    plugins: [{ name: 'f429-fixture', setup(b) {
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
  const g = globalThis.__f429;
  g.row = null;           // the one whatsapp_chat_sessions row
  g.casAttempts = 0;      // whole-row merge writes attempted
  g.competeOnNextCAS = false; // when true, emulate a concurrent append mid-merge
  function walk(chunks, out) {
    for (const c of chunks || []) {
      if (c === null || c === undefined) continue;
      if (typeof c !== 'object') { out.push(c); continue; } // raw param value
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
      g.casAttempts++;
      if (g.competeOnNextCAS) {
        g.competeOnNextCAS = false;
        // A concurrent inbound capture lands between the merge's read and write.
        const brain = g.row.data.brain;
        brain.history = [...brain.history, { role: 'user', content: 'competing capture', messageId: 'race-mid' }];
        brain.v = (brain.v ?? 0) + 1;
        return [];
      }
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

test('forced 429s preserve facts across turns; turn-end merge survives a racing capture', async () => {
  (globalThis as any).__f429 = {};
  const output = await bundleOut(
    "export { runBrainTurn } from '../src/akif/brainOrchestrator';",
    { db: dbFixture },
    [[/^@workspace\/db$/, 'db']],
  );
  try {
    const g = (globalThis as any).__f429;
    const m = await import(output);
    const phone = '91000000099';
    const seenPayloads: any[][] = [];
    let failNext = 2;
    const chat = async (messages: any[]) => {
      seenPayloads.push(messages);
      if (failNext > 0) {
        failNext--;
        throw new Error('Request failed with status code 429: Rate limit reached for model openai/gpt-oss-20b: Please try again in 2s');
      }
      return { content: 'Thanks! Noted.', toolCalls: [] };
    };

    // Turn 1 and 2: the provider rejects both - the incident condition.
    await assert.rejects(() => m.runBrainTurn({ phone, text: 'Kenya', messageId: 'm1' }, chat), /429/);
    await assert.rejects(() => m.runBrainTurn({ phone, text: '5000mt', messageId: 'm2' }, chat), /429/);

    // Facts survived the failed turns, durable in the session record.
    let brain = g.row.data.brain;
    assert.deepEqual(brain.history.map((h: any) => [h.role, h.content, h.messageId]), [
      ['user', 'Kenya', 'm1'],
      ['user', '5000mt', 'm2'],
    ], 'both facts captured before the model calls that failed');

    // Turn 3 succeeds: its request to the provider must carry the facts -
    // this is the regression that caused the Kenya / 5000mt re-asks.
    g.competeOnNextCAS = true; // turn-end merge will race a concurrent capture
    const out = await m.runBrainTurn({ phone, text: 'what did I tell you?', messageId: 'm3' }, chat);
    assert.ok(out && out.handled, 'turn 3 answered');
    const payloadText = JSON.stringify(seenPayloads[2]);
    assert.ok(payloadText.includes('Kenya'), 'turn 3 payload carries Kenya');
    assert.ok(payloadText.includes('5000mt'), 'turn 3 payload carries 5000mt');

    // The raced merge re-read and re-merged: competing capture AND the
    // assistant reply both survived, nothing dropped, order preserved.
    brain = g.row.data.brain;
    const contents = brain.history.map((h: any) => h.content);
    assert.ok(contents.includes('competing capture'), 'competing capture not overwritten by the merge');
    assert.ok(contents.includes('Thanks! Noted.'), 'assistant reply merged');
    assert.ok(g.casAttempts >= 2, `lost race forced a retried merge (attempts: ${g.casAttempts})`);
    assert.deepEqual(contents.slice(0, 3), ['Kenya', '5000mt', 'what did I tell you?'], 'rapid successive turns stay ordered');
  } finally { await unlink(output); }
});

test('duplicate redelivery of the same message id records once', async () => {
  (globalThis as any).__f429 = {};
  const output = await bundleOut(
    "export { recordBrainInbound } from '../src/akif/brainOrchestrator';",
    { db: dbFixture },
    [[/^@workspace\/db$/, 'db']],
  );
  try {
    const g = (globalThis as any).__f429;
    const m = await import(output);
    await m.recordBrainInbound('91000000099', 'Kenya', 'm1');
    await m.recordBrainInbound('91000000099', 'Kenya', 'm1'); // webhook redelivery
    const brain = g.row.data.brain;
    assert.equal(brain.history.filter((h: any) => h.messageId === 'm1').length, 1, 'dedup on message id');
  } finally { await unlink(output); }
});
