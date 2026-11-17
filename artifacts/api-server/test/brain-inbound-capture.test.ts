import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

process.env.SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL || 'postgres://synthetic:synthetic@127.0.0.1:1/synthetic'; // lazy pool; never connected
process.env.WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || 'synthetic-test-secret-000000'; // guidance key derivation; never leaves the fixture

// 16 Nov incident regression coverage: facts-first capture control flow,
// provider-retry parsing, and the busy-floor/generic-retry guards.
// The SQL semantics themselves (dedup, append ordering, atomicity) are
// verified against the live database; here the TypeScript wiring is proven.

async function bundle(globalName: string, stdinContents: string, fixtures: Record<string, string>, mapExtra: Array<[RegExp, string]> = []) {
  const state: any = {};
  (globalThis as any)[globalName] = state;
  const output = fileURLToPath(new URL(`./cap-${randomUUID()}.mjs`, import.meta.url));
  const map: Array<[RegExp, string]> = [...mapExtra];
  const out = await build({
    stdin: { contents: stdinContents, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
    plugins: [{ name: 'cap-fixture', setup(b) {
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

function dbFixture(state: { rowCount: number; existing: boolean }) {
  return `
    const g = globalThis.__capState;
    g.executes = 0; g.inserts = [];
    export const db = {
      execute: async () => { g.executes++; return { rowCount: ${state.rowCount} }; },
      select: () => ({ from: () => ({ where: () => ({ limit: async () => (${state.existing ? '[{phoneHash:"k"}]' : '[]' }) }) }) }),
      insert: () => ({ values: (row) => { g.inserts.push(row); return { onConflictDoNothing: async () => [] }; } }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
      delete: () => ({ where: async () => [] }),
      transaction: async (f) => f({ execute: async () => ({ rows: [] }) }),
    };
    export const pool = {};
    export const akifCustomerMemoriesTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const akifEmotionalStatesTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const akifResearchRunsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const akifSharedLessonsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const akifTasksTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const auditLogsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const authSessionsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const buyerPoolAllocationsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const buyerPoolsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const buyerRequestsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const commissionsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const companiesTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const companyVerificationDocumentsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const customsClearanceTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const dealCasesTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const dealConversationEventsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const dealFeedbackTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const dealFinancialsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const dealMeetingsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const dealParticipantsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const dealsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const documentAccessTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const documentExtractionsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const documentsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const inspectionsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const matchesTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const messagesTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const notificationPreferencesTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const notificationsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const productsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const referralsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const sellerListingsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const shipmentCargoUnitsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const shipmentTrackingEventsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const shipmentWatchesTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const shipmentsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const userRoleChangeRequestsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const usersTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const vaultAccessLogTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const whatsappChatSessionsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const whatsappInboundDedupTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const whatsappIntakeDraftsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const whatsappMessageContextsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const whatsappShipmentOutboxTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const whatsappUserContextsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const whatsappVoicePreferencesTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const whatsappWebhookInboxTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const dealIntelligenceSnapshotsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const whatsappSigninChallengesTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const vaultDeletionRequestsTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
    export const vaultUploadLinksTable=new Proxy({},{get:(t,k)=>typeof k==='symbol'?undefined:{key:String(k)}});
  `;
}

const MAP: Array<[RegExp, string]> = [
  [/^@workspace\/db$/, 'db'],
];

test('forced-429 path: inbound capture inserts a durable row carrying the fact when none exists', async () => {
  // rowCount 0 + no existing row = first contact (or dedup hit); with no row
  // the capture MUST insert one containing the customer fact and message id.
  const { state, output } = await bundle('__capState',
    "export { recordBrainInbound, recordBrainRelayAnswer } from '../src/akif/brainOrchestrator';",
    { db: dbFixture({ rowCount: 0, existing: false }) }, MAP);
  try {
    const g = (globalThis as any).__capState;
    const m = await import(output);
    await m.recordBrainInbound('91000000001', 'Kenya', 'wam1');
    assert.equal(g.executes, 1, 'one atomic update attempted');
    assert.equal(g.inserts.length, 1, 'missing session row is inserted');
    const brain = g.inserts[0].data.brain;
    assert.deepEqual(brain.history, [{ role: 'user', content: 'Kenya', messageId: 'wam1' }]);

    await m.recordBrainRelayAnswer('91000000001', 'DLC is a Letter of Credit.', 'relay:item9');
    assert.equal(g.inserts.length, 2);
    const relayBrain = g.inserts[1].data.brain;
    assert.deepEqual(relayBrain.history, [{ role: 'assistant', content: 'DLC is a Letter of Credit.', messageId: 'relay:item9' }]);
  } finally { await unlink(output); }
});

test('dedup-hit path (update matched nothing, row exists) does not insert a duplicate row', async () => {
  const { state, output } = await bundle('__capState',
    "export { recordBrainInbound } from '../src/akif/brainOrchestrator';",
    { db: dbFixture({ rowCount: 0, existing: true }) }, MAP);
  try {
    const g = (globalThis as any).__capState;
    const m = await import(output);
    await m.recordBrainInbound('91000000001', 'Kenya', 'wam1');
    assert.equal(g.executes, 1);
    assert.equal(g.inserts.length, 0, 'existing row means the dedup guard matched - no insert');
  } finally { await unlink(output); }
});

test('normal append path (update matched the row) issues no insert', async () => {
  const { state, output } = await bundle('__capState',
    "export { recordBrainInbound } from '../src/akif/brainOrchestrator';",
    { db: dbFixture({ rowCount: 1, existing: true }) }, MAP);
  try {
    const g = (globalThis as any).__capState;
    const m = await import(output);
    await m.recordBrainInbound('91000000001', '5000mt', 'wam2');
    assert.equal(g.executes, 1);
    assert.equal(g.inserts.length, 0);
  } finally { await unlink(output); }
});

test('providerRetrySeconds honors the provider delay only for rate-limit failures', async () => {
  const { output } = await bundle('__capState',
    "export { providerRetrySeconds } from '../src/routes/whatsappWebhook';",
    {
      db: dbFixture({ rowCount: 1, existing: true }),
      brain: "export const isBrainOrchestratorEnabled=()=>false;export const runBrainTurn=async()=>null;export const BRAIN_TOOLS=[];export const BRAIN_BUSY_REPLY='busy';",
    }, [...MAP, [/akif\/brainOrchestrator(\.ts)?$/, 'brain']]);
  try {
    const m = await import(output);
    assert.equal(m.providerRetrySeconds('Rate limit reached for model openai/gpt-oss-20b: Please try again in 2.5s'), 2.5);
    assert.equal(m.providerRetrySeconds('Request failed with status code 429. Please try again in 12s'), 12);
    assert.equal(m.providerRetrySeconds('Request failed with status code 429'), null, '429 with no stated delay: no invented sleep');
    assert.equal(m.providerRetrySeconds('socket hang up'), null, 'non-429 transient: generic retry path, not provider delay');
  } finally { await unlink(output); }
});

test('source guards: busy floor re-nulled after every retry path; generic retry skipped on known 429', async () => {
  const src = await readFile(new URL('../src/routes/whatsappWebhook.ts', import.meta.url), 'utf8');
  const providerBlock = src.indexOf('providerRetryMs > 0');
  const finalGuard = src.indexOf('if (brain?.reply === BRAIN_BUSY_REPLY) brain = null;', providerBlock);
  const sendDecision = src.indexOf('if (brain?.handled) {', providerBlock);
  assert.ok(providerBlock > 0, 'provider-delay retry block exists');
  assert.ok(finalGuard > providerBlock && finalGuard < sendDecision,
    'the busy floor is re-nulled after the provider retry and before the send decision');
  const generic = src.indexOf('One retry before any fallback');
  assert.ok(generic > 0 && src.slice(Math.max(0, generic - 300), generic).includes('providerRetryMs === 0'),
    'the generic blind retry is skipped when a provider 429 delay is known');
});
