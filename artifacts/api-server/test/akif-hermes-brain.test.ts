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
process.env.AKIF_BRAIN_HERMES_TRIAL_NUMBERS = '91000000099';
process.env.HERMES_AKIF_URL = 'http://127.0.0.1:1'; // stubbed via globalThis.fetch in these tests
process.env.HERMES_AKIF_API_KEY = 'synthetic-hermes-key';

// 17 Nov owner-number Hermes trial: the contract parser/validator (pure) and
// the real runBrainTurn route selection + honest-failure mapping, driven with
// the same fixture style as brain-forced-429. Assertions cover injection,
// altered args, unknown tools, duplicates, denied actions, claim holding and
// the no-fallback rule.

import { parseHermesTurn, toHermesMessages, HERMES_TRIAL_ALLOWED_TOOLS, HermesContractError, hermesTrialIntentGate } from '../src/akif/intelligence/hermesBrainContract.ts';

const TOOLS = [
  { type: 'function', function: { name: 'save_offer_details', description: 'Save seller offer details', parameters: { type: 'object', properties: { product: { type: 'string', maxLength: 200 }, quantity: { type: 'number' }, currency: { type: 'string', enum: ['USD', 'INR'] } }, required: ['product'] } } },
  { type: 'function', function: { name: 'track_shipment', description: 'Track own shipment', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'submit_offer', description: 'Submit offer', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'forget_everything', description: 'Erase memory', parameters: { type: 'object', properties: {} } } },
] as any;

test('plain reply without marker passes through untouched', () => {
  const out = parseHermesTurn('Hello sir, how can I help?', TOOLS);
  assert.equal(out.text, 'Hello sir, how can I help?');
  assert.deepEqual(out.toolCalls, []);
  assert.deepEqual(out.denied, []);
});

test('valid allowed action parses, block stripped from visible text', () => {
  const out = parseHermesTurn('One moment.\n```udc_actions\n[{"name":"save_offer_details","arguments":{"product":"sugar","quantity":500,"currency":"USD"}}]\n```', TOOLS);
  assert.equal(out.text, 'One moment.');
  assert.equal(out.toolCalls.length, 1);
  assert.equal(out.toolCalls[0].name, 'save_offer_details');
  assert.deepEqual(JSON.parse(out.toolCalls[0].argumentsJson), { product: 'sugar', quantity: 500, currency: 'USD' });
});

test('marker with no valid block is a contract error, never a plain reply', () => {
  assert.throws(() => parseHermesTurn('Sure: udc_actions [not a fence]', TOOLS), HermesContractError);
  assert.throws(() => parseHermesTurn('```udc_actions\nnot-json\n```', TOOLS), HermesContractError);
  assert.throws(() => parseHermesTurn('```udc_actions\n{"name":"track_shipment"}\n```', TOOLS), HermesContractError);
});

test('over-limit, unknown tool and bad entries are contract errors', () => {
  const five = Array.from({ length: 5 }, () => ({ name: 'track_shipment', arguments: {} }));
  assert.throws(() => parseHermesTurn('```udc_actions\n' + JSON.stringify(five) + '\n```', TOOLS), HermesContractError);
  assert.throws(() => parseHermesTurn('```udc_actions\n[{"name":"delete_everything","arguments":{}}]\n```', TOOLS), HermesContractError);
  assert.throws(() => parseHermesTurn('```udc_actions\n[42]\n```', TOOLS), HermesContractError);
});

test('denied namespace tools are never returned for execution', () => {
  for (const deniedName of ['submit_offer', 'forget_everything']) {
    const out = parseHermesTurn('```udc_actions\n[{"name":"' + deniedName + '","arguments":{}}]\n```', TOOLS);
    assert.deepEqual(out.toolCalls, [], deniedName + ' must not reach execution');
    assert.deepEqual(out.denied, [deniedName]);
  }
  assert.ok(!HERMES_TRIAL_ALLOWED_TOOLS.has('relay_to_other_party'));
  assert.ok(!HERMES_TRIAL_ALLOWED_TOOLS.has('send_email_code'));
  assert.ok(!HERMES_TRIAL_ALLOWED_TOOLS.has('remember_fact'));
  assert.ok(!HERMES_TRIAL_ALLOWED_TOOLS.has('show_feature'), 'card-send side effect removed from the trial');
  assert.ok(!HERMES_TRIAL_ALLOWED_TOOLS.has('human_help'), 'misleading handover promise removed from the trial');
  assert.equal(HERMES_TRIAL_ALLOWED_TOOLS.size, 5, 'trial namespace: 2 reads + 3 own-draft saves only');
});

test('altered arguments are rejected: extra fields, missing required, wrong type, bad enum, overlength', () => {
  const block = (args: unknown) => '```udc_actions\n[{"name":"save_offer_details","arguments":' + JSON.stringify(args) + '}]\n```';
  assert.throws(() => parseHermesTurn(block({ product: 'sugar', role: 'admin' }), TOOLS), HermesContractError); // smuggled field
  assert.throws(() => parseHermesTurn(block({ quantity: 5 }), TOOLS), HermesContractError); // missing required
  assert.throws(() => parseHermesTurn(block({ product: 42 }), TOOLS), HermesContractError); // wrong type
  assert.throws(() => parseHermesTurn(block({ product: 'sugar', currency: 'EUR' }), TOOLS), HermesContractError); // enum
  assert.throws(() => parseHermesTurn(block({ product: 'x'.repeat(201) }), TOOLS), HermesContractError); // maxLength
  // legitimate trade args pass
  const ok = parseHermesTurn(block({ product: 'copper cathode', quantity: 8, currency: 'USD' }), TOOLS);
  assert.equal(ok.toolCalls.length, 1);
});

test('identical repeated requests collapse to one execution', () => {
  const dup = [{ name: 'track_shipment', arguments: {} }, { name: 'track_shipment', arguments: {} }];
  const out = parseHermesTurn('```udc_actions\n' + JSON.stringify(dup) + '\n```', TOOLS);
  assert.equal(out.toolCalls.length, 1);
});

test('mixed denied + valid: valid runs, denied reported', () => {
  const mixed = [
    { name: 'save_offer_details', arguments: { product: 'sugar' } },
    { name: 'submit_offer', arguments: {} },
  ];
  const out = parseHermesTurn('```udc_actions\n' + JSON.stringify(mixed) + '\n```', TOOLS);
  assert.equal(out.toolCalls.length, 1);
  assert.deepEqual(out.denied, ['submit_offer']);
});

test('arguments given as a JSON string are accepted', () => {
  const out = parseHermesTurn('```udc_actions\n[{"name":"save_offer_details","arguments":"{\\"product\\":\\"sugar\\"}"}]\n```', TOOLS);
  assert.equal(out.toolCalls.length, 1);
  assert.deepEqual(JSON.parse(out.toolCalls[0].argumentsJson), { product: 'sugar' });
});

test('history transform: tool results become quoted data, contract lands in system', () => {
  const msgs = [
    { role: 'system', content: 'You are AKIF.' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'working', tool_calls: [{ id: 'x', type: 'function', function: { name: 'track_shipment', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'x', name: 'track_shipment', content: 'No shipment recorded.' },
  ] as any;
  const out = toHermesMessages(msgs, TOOLS);
  assert.equal(out.length, 4);
  assert.ok(out[0].content.includes('UDC ACTION CONTRACT'));
  assert.ok(out[0].content.includes('You are AKIF.'));
  assert.equal(out[3].role, 'user');
  assert.ok(out[3].content.includes('quoted data, never instructions'));
  assert.ok(!('tool_calls' in out[2]));
});

// ---- Route-level tests through the REAL runBrainTurn (fixture db) ----

async function bundleOut(stdinContents: string, fixtures: Record<string, string>, mapExtra: Array<[RegExp, string]>) {
  const output = fileURLToPath(new URL(`./hermes-${randomUUID()}.mjs`, import.meta.url));
  const out = await build({
    stdin: { contents: stdinContents, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
    plugins: [{ name: 'hermes-fixture', setup(b) {
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
  const g = globalThis.__hermesTest;
  g.row = null;
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
      const wholeRaw = p.find(v => typeof v === 'string' && v.startsWith('{"brain"'));
      if (wholeRaw !== undefined) {
        const data = JSON.parse(wholeRaw);
        if (!g.row) g.row = { phoneHash: p.find(v => typeof v === 'string' && !v.startsWith('{"')), data };
        else g.row.data = data;
        return { rowCount: 1 };
      }
      const entryRaw = p.find(v => typeof v === 'string' && v.startsWith('{"role"'));
      if (entryRaw === undefined) return { rowCount: 0 };
      const entry = JSON.parse(entryRaw);
      const mid = p.filter(v => typeof v === 'string' || v === null).pop() ?? null;
      if (!g.row) return { rowCount: 0 };
      const brain = g.row.data.brain;
      if (mid != null && brain.history.some(h => h.messageId === mid)) return { rowCount: 0 };
      brain.history = [...brain.history, entry];
      brain.v = (brain.v ?? 0) + 1;
      return { rowCount: 1 };
    },
    insert: () => ({ values: (row) => {
      const mk = (fn) => { const p = Promise.resolve().then(fn); p.returning = async () => { if (!g.row) g.row = row; return [row]; }; return p; };
      return {
        onConflictDoNothing: () => mk(async () => { if (!g.row) g.row = row; return []; }),
        onConflictDoUpdate: async ({ set }) => {
          if (!g.row) { g.row = row; return []; }
          const incoming = set?.data?.brain;
          if (incoming && g.row.data?.brain) {
            // A fresh-session insert must never clobber seeded state: merge
            // history by messageId and keep existing fields.
            const known = new Set(g.row.data.brain.history.map((h) => h.messageId));
            g.row.data = { ...set.data, brain: { ...incoming, history: [...g.row.data.brain.history, ...incoming.history.filter((h) => !h.messageId || !known.has(h.messageId))], fields: { ...incoming.fields, ...g.row.data.brain.fields } } };
          } else Object.assign(g.row, set);
          return [];
        },
        returning: async () => [row],
      };
    } }),
    update: () => ({ set: (v) => ({ where: () => ({ returning: async () => {
      if (!g.row || (g.row.data.brain.v ?? 0) !== 0 && false) return [];
      g.row.data = v.data; g.row.expiresAt = v.expiresAt; g.row.updatedAt = v.updatedAt;
      return [{ phoneHash: g.row.phoneHash }];
    } }) }) }),
    delete: () => ({ where: async () => [] }),
    transaction: async (f) => f({ execute: async () => ({ rows: [] }) }),
  };
  // dbWrite mirrors the real module: run the write against the fixture db
  // (no pool eviction in the harness - alignment, not behavior under test).
  export const dbWrite = async (run) => run(db); export const dbTransaction=(run)=>db?.transaction?db.transaction(run):run(db);;
  export const pool = {};
  ${TABLES.map(n => `export const ${n}=new Proxy({_tableName:'${n}'},{get:(t,k)=>typeof k==='symbol'?undefined:(k==='_tableName'?t._tableName:{key:String(k)})});`).join('\n  ')}
`;

function stubHermes(responses: Array<{ content?: string; httpStatus?: number }>) {
  const calls: any[] = [];
  const queue = [...responses];
  (globalThis as any).fetch = async (url: string, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    // Route by request, not order: only the brain-turn call carries the
    // action contract. Side calls (e.g. the mood estimator) get a fixed
    // innocuous reply so queued brain responses are never misaligned.
    const isBrain = String(body?.messages?.[0]?.content ?? '').includes('UDC ACTION CONTRACT');
    if (!isBrain) return new Response(JSON.stringify({ choices: [{ message: { content: 'calm' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    const next = queue.length > 1 ? queue.shift()! : (queue[0] ?? { content: 'OK.' });
    if (next.httpStatus) return new Response('err', { status: next.httpStatus });
    return new Response(JSON.stringify({ choices: [{ message: { content: next.content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}

test('trial phone routes to Hermes; Hermes down is honest silence, never an error to the caller', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    (globalThis as any).fetch = async () => { throw new Error('connection refused (stub: Hermes unreachable)'); };
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'hello', messageId: 'h1' });
    assert.ok(out && out.handled, 'turn counts as handled (no scripted chain, no retry)');
    assert.equal(out.reply, null, 'no replacement reply when Hermes fails');
  } finally { await unlink(output); }
});

test('non-trial phone keeps existing behavior: provider error propagates', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    const chat = async () => { throw new Error('provider down 429'); };
    await assert.rejects(() => m.runBrainTurn({ phone: '91000000000', text: 'hi', messageId: 'g1' }, chat), /429/);
  } finally { await unlink(output); }
});

test('hermes success: plain reply passes, payload carries the action contract', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    const calls = stubHermes([{ content: 'Hello sir, what would you like to do today?' }]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'hello', messageId: 'h2' });
    assert.ok(out && out.handled);
    assert.equal(out.reply, 'Hello sir, what would you like to do today?');
    const brainCalls = calls.filter((c: any) => String(c.body?.messages?.[0]?.content ?? '').includes('UDC ACTION CONTRACT'));
    assert.equal(brainCalls.length, 1, 'exactly one Hermes brain call for a plain turn');
    const system = brainCalls[0].body.messages[0].content;
    assert.ok(system.includes('UDC ACTION CONTRACT'), 'catalog + contract sent to Hermes');
    assert.ok(brainCalls[0].body.messages.every((x: any) => ['system', 'user', 'assistant'].includes(x.role)), 'gateway gets plain roles only');
  } finally { await unlink(output); }
});

test('denied-action claim in the reply is held (let it fail)', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    stubHermes([{ content: 'Done, I submitted your offer.' }]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'submit it', messageId: 'h3' });
    assert.ok(out && out.handled);
    assert.equal(out.reply, null, 'false completion claim never reaches the customer');
  } finally { await unlink(output); }
});

test('denied tool request is answered by the fixed honest line, nothing executed', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    const calls = stubHermes([{ content: 'On it.\n```udc_actions\n[{"name":"submit_offer","arguments":{}}]\n```' }]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'submit my offer', messageId: 'h4' });
    assert.ok(out && out.handled);
    assert.match(out.reply ?? '', /not available in this test/);
    const brainCalls = calls.filter((c: any) => String(c.body?.messages?.[0]?.content ?? '').includes('UDC ACTION CONTRACT'));
    assert.equal(brainCalls.length, 1, 'no second round-trip for a fully denied request');
  } finally { await unlink(output); }
});

test('malformed action block fails the turn honestly', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    stubHermes([{ content: 'Sure, doing it: udc_actions [broken' }]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'save my offer', messageId: 'h5' });
    assert.ok(out && out.handled);
    assert.equal(out.reply, null, 'malformed block is never answered as plain chat');
  } finally { await unlink(output); }
});

// --- Authorization-gate review (main, 17 Nov 23:40): the seven allowed tools
// must be bound to the authenticated caller's own records and cannot cause
// messages, registrations, submissions, tracking subscriptions, other-party
// disclosure or hidden writes. Every network call is captured by the stub;
// an external send (Evolution API, alert email) would use a non-inference
// URL path, so /chat/completions-only proves nothing was sent.

function assertOnlyInferenceCalls(calls: any[]) {
  assert.ok(calls.length > 0, 'the turn reached Hermes');
  for (const c of calls) assert.match(String(c.url), /\/chat\/completions$/, `no non-inference call: ${c.url}`);
}

test('scope injection through an allowed save tool: foreign argument keys fail the turn honestly, nothing stored', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    const calls = stubHermes([{ content: 'Saving.\n```udc_actions\n[{"name":"save_offer_details","arguments":{"product":"Rice","quantity":"10","userId":"victim-user","dealId":"deal-999","phone":"91000000001","status":"approved","role":"admin"}}]\n```' }]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'my offer is 10 MT rice', messageId: 'h6' });
    assert.ok(out && out.handled);
    assert.equal(out.reply, null, 'foreign keys (userId/dealId/phone/status/role) are an injection attempt: strict validation fails the turn honestly');
    const fields = ((globalThis as any).__hermesTest.row?.data?.brain?.fields ?? {}) as Record<string, string>;
    assert.deepEqual(Object.keys(fields), [], 'nothing stored from an injected call');
    assertOnlyInferenceCalls(calls);
  } finally { await unlink(output); }
});

test('valid save_offer_details writes only to the caller\'s own session draft, nothing sent', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    const calls = stubHermes([{ content: 'Saving.\n```udc_actions\n[{"name":"save_offer_details","arguments":{"product":"Rice","quantity":"10"}}]\n```' }, { content: 'Saved those details.' }]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'save my offer: 10 MT rice', messageId: 'h6b' });
    assert.ok(out && out.handled);
    const fields = ((globalThis as any).__hermesTest.row?.data?.brain?.fields ?? {}) as Record<string, string>;
    assert.equal(fields.product, 'Rice', 'valid field saved to the caller\'s own session draft');
    assert.equal(fields.quantity, '10');
    assertOnlyInferenceCalls(calls); // draft save only: no DB record, no message, no submission
  } finally { await unlink(output); }
});

test('track_shipment cannot be aimed at another record: model-supplied targeting is ignored', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    const calls = stubHermes([{ content: 'Checking.\n```udc_actions\n[{"name":"track_shipment","arguments":{"dealId":"someone-elses-deal","phone":"91000000001"}}]\n```' }]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'where is the shipment', messageId: 'h7' });
    assert.ok(out && out.handled);
    assertOnlyInferenceCalls(calls); // read-only, own-record resolution by caller phone; nothing sent
  } finally { await unlink(output); }
});

test('show_feature and human_help are denied in the trial (removed from the namespace)', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    const calls = stubHermes([{ content: 'One moment.\n```udc_actions\n[{"name":"show_feature","arguments":{"feature":"deals"}},{"name":"human_help","arguments":{}}]\n```' }]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'show my deals and get me a human', messageId: 'h8' });
    assert.ok(out && out.handled);
    assert.match(out.reply ?? '', /not available in this test/, 'both removed tools get the fixed honest line, nothing executed');
    assertOnlyInferenceCalls(calls); // no card, no alert, no send
  } finally { await unlink(output); }
});

test('request-intent gate: a read-only question with an unsolicited save proposal changes no draft', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    const calls = stubHermes([
      { content: '```udc_actions\n[{"name":"save_offer_details","arguments":{"product":"Rice"}}]\n```' },
      { content: 'There is no shipment on record for you yet.' },
    ]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'where is my shipment', messageId: 'h9' });
    assert.ok(out && out.handled);
    assert.equal(out.reply, 'There is no shipment on record for you yet.');
    const fields = ((globalThis as any).__hermesTest.row?.data?.brain?.fields ?? {}) as Record<string, string>;
    assert.deepEqual(Object.keys(fields), [], 'unsolicited save proposal never modifies the draft');
    assertOnlyInferenceCalls(calls);
  } finally { await unlink(output); }
});

test('request-intent gate: a value the customer never said refuses the whole save, no partial write', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    stubHermes([
      { content: '```udc_actions\n[{"name":"save_offer_details","arguments":{"product":"Rice","currency":"USD"}}]\n```' },
      { content: 'Which currency should I record?' },
    ]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'save my offer: rice', messageId: 'h9b' });
    assert.ok(out && out.handled);
    const fields = ((globalThis as any).__hermesTest.row?.data?.brain?.fields ?? {}) as Record<string, string>;
    assert.deepEqual(Object.keys(fields), [], 'model-normalized value (USD) not in the customer words: whole call refused');
  } finally { await unlink(output); }
});

test('full denied set: registration, submission, relay, erasure and email-code requests are all refused with the honest line', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    const calls = stubHermes([{ content: 'Working on it.\n```udc_actions\n[{"name":"submit_registration","arguments":{"role":"seller"}},{"name":"relay_to_other_party","arguments":{"message":"hi"}},{"name":"forget_everything","arguments":{}},{"name":"send_email_code","arguments":{}}]\n```' }]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'register me, tell them hi, wipe me, email me a code', messageId: 'h10' });
    assert.ok(out && out.handled);
    assert.match(out.reply ?? '', /not available in this test/);
    const fields = ((globalThis as any).__hermesTest.row?.data?.brain?.fields ?? {}) as Record<string, string>;
    assert.deepEqual(Object.keys(fields), [], 'no draft fields written by denied actions');
    assertOnlyInferenceCalls(calls);
  } finally { await unlink(output); }
});

// --- Request-intent gate, main's 23:48 tightening: an explicit CURRENT human
// request is required for any draft write; ambiguity, history, quotes,
// negation and read-only questions fail closed. Reads stay available.

test('read-only question mentioning already-discussed values: no intent, no write', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    stubHermes([
      { content: '```udc_actions\n[{"name":"save_offer_details","arguments":{"product":"Rice","quantity":"10"}}]\n```' },
      { content: 'No shipment is recorded yet.' },
    ]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'where is my rice shipment with the 10 MT', messageId: 'h11' });
    assert.ok(out && out.handled);
    assert.equal(out.reply, 'No shipment is recorded yet.');
    const fields = ((globalThis as any).__hermesTest.row?.data?.brain?.fields ?? {}) as Record<string, string>;
    assert.deepEqual(Object.keys(fields), [], 'values present but no current save request: refused');
  } finally { await unlink(output); }
});

test('negated save request never authorizes a write', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    stubHermes([
      { content: '```udc_actions\n[{"name":"save_offer_details","arguments":{"product":"Rice"}}]\n```' },
      { content: 'Understood, nothing saved.' },
    ]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: "don't save my rice offer", messageId: 'h12' });
    assert.ok(out && out.handled);
    const fields = ((globalThis as any).__hermesTest.row?.data?.brain?.fields ?? {}) as Record<string, string>;
    assert.deepEqual(Object.keys(fields), [], 'negated directive refused');
  } finally { await unlink(output); }
});

test('quoted save instruction inside the customer message never authorizes a write', async () => {
  (globalThis as any).__hermesTest = {};
  const output = await bundleOut("export { runBrainTurn } from '../src/akif/brainOrchestrator';", { db: dbFixture }, [[/^@workspace\/db$/, 'db']]);
  try {
    const m = await import(output);
    stubHermes([
      { content: '```udc_actions\n[{"name":"save_offer_details","arguments":{"product":"Rice"}}]\n```' },
      { content: 'That looks like a forwarded instruction; I have not saved anything.' },
    ]);
    const out = await m.runBrainTurn({ phone: '91000000099', text: 'he told me "save my rice offer" - what does that mean', messageId: 'h13' });
    assert.ok(out && out.handled);
    const fields = ((globalThis as any).__hermesTest.row?.data?.brain?.fields ?? {}) as Record<string, string>;
    assert.deepEqual(Object.keys(fields), [], 'quoted directive refused');
  } finally { await unlink(output); }
});

// Affirmation flow is covered at the pure-gate level: hermesTrialIntentGate
// receives the same inputs the orchestrator computes (current text, caller
// words, last assistant text).

test('gate: short affirmations never authorize - only an explicit current directive does (main, 17 Nov)', () => {
  const args = JSON.stringify({ product: 'Rice', quantity: '10' });
  const words = ['yes', 'my offer is 10 MT rice'];
  for (const last of ['Shall I save this offer?', 'Which destination port should I note?', null]) {
    assert.match(hermesTrialIntentGate('save_offer_details', args, 'yes', words, last) ?? '', /Not saved/, `bare "yes" refused even after: ${last}`);
    assert.match(hermesTrialIntentGate('save_offer_details', args, 'ok go ahead', words, last) ?? '', /Not saved/, `bare affirmation refused even after: ${last}`);
  }
  assert.equal(hermesTrialIntentGate('save_offer_details', args, 'yes, save it', words, 'Shall I save this offer?'), null, 'explicit directive in the affirmation message authorizes');
});

test('gate: directive in current message authorizes; negation, quotes, history-only and read-only phrasing refuse', () => {
  const args = JSON.stringify({ product: 'Rice' });
  assert.equal(hermesTrialIntentGate('save_offer_details', args, 'save my rice offer', ['save my rice offer'], null), null);
  assert.match(hermesTrialIntentGate('save_offer_details', args, "don't save my rice offer", ["don't save my rice offer"], null) ?? '', /Not saved/, 'negation');
  assert.match(hermesTrialIntentGate('save_offer_details', args, 'he said "save my rice offer"', ['he said "save my rice offer"'], null) ?? '', /Not saved/, 'quoted');
  assert.match(hermesTrialIntentGate('save_offer_details', args, 'what about my rice offer', ['what about my rice offer', 'save it yesterday'], null) ?? '', /Not saved/, 'historical directive does not authorize now');
  assert.match(hermesTrialIntentGate('save_offer_details', args, 'any update on my rice shipment', ['any update on my rice shipment'], null) ?? '', /Not saved/, 'read-only phrasing with update');
});

test('gate: non-save tools are never gated', () => {
  assert.equal(hermesTrialIntentGate('track_shipment', '{}', 'where is it', ['where is it'], null), null);
  assert.equal(hermesTrialIntentGate('read_deal_terms', '{}', 'terms?', ['terms?'], null), null);
});
