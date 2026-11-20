// Integration proof for the deal-state system line (18 Nov incident fix):
// the REAL brainOrchestrator, real route selection (normal brain model and
// Hermes trial), and the real model clients, with only @workspace/db,
// drizzle-orm predicates and the HTTP layer isolated. Asserts the line
// computed from authoritative deal rows reaches the outbound model payload
// on both routes, that unregistered users get no line, and that a lookup
// failure produces the honest "could not check" line.
process.env.AKIF_BRAIN_ORCHESTRATOR = "on";
process.env.GROQ_API_KEY = "fixture-groq-key";
process.env.AKIF_GROQ = "on";
process.env.WHATSAPP_APP_SECRET = "fixture-secret-0123456789abcdef"; // session-key derivation only
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

test("deal-state line reaches both brain routes from the real orchestrator", async (t) => {
  const names = ["usersTable", "companiesTable", "companyVerificationDocumentsTable", "whatsappChatSessionsTable", "dealsTable", "productsTable", "auditLogsTable", "shipmentsTable", "shipmentTrackingEventsTable", "whatsappUserContextsTable", "dealParticipantsTable", "buyerPoolAllocationsTable", "buyerPoolsTable", "matchesTable", "referralsTable", "commissionsTable", "notificationPreferencesTable", "sellerListingsTable", "messagesTable", "notificationsTable", "dealConversationEventsTable", "documentAccessTable", "documentExtractionsTable", "documentsTable", "buyerRequestsTable", "whatsappMessageContextsTable", "akifSharedLessonsTable", "akifCustomerMemoriesTable", "akifEmotionalStatesTable", "akifResearchRunsTable", "akifTasksTable", "dealMeetingsTable", "dealFinancialsTable", "whatsappIntakeDraftsTable", "whatsappInboundDedupTable", "whatsappShipmentOutboxTable", "whatsappVoicePreferencesTable", "whatsappWebhookInboxTable", "shipmentCargoUnitsTable", "shipmentWatchesTable", "inspectionsTable", "userRoleChangeRequestsTable", "dealCasesTable", "dealFeedbackTable", "customsClearanceTable", "authSessionsTable", "vaultAccessLogTable"];
  const tables: any = Object.fromEntries(names.map(name => [name, new Proxy({ _tableName: name }, {
    get(target, key) { return key === "_tableName" ? target._tableName : { kind: "column", table: name, key }; },
  })]));
  const rows: Record<string, any[]> = Object.fromEntries(names.map(name => [name, []]));
  const evaluate = (node: any, row: any): any => {
    if (node?.kind === "column") return row[node.table]?.[node.key];
    if (node?.kind === "eq") return evaluate(node.a, row) === evaluate(node.b, row);
    if (node?.kind === "ne") return evaluate(node.a, row) !== evaluate(node.b, row);
    if (node?.kind === "and") return node.args.every((n: any) => evaluate(n, row));
    if (node?.kind === "or") return node.args.some((n: any) => evaluate(n, row));
    if (node?.kind === "in" && Array.isArray(node.query)) return node.query.includes(evaluate(node.a, row));
    if (node?.kind === "notIn" && Array.isArray(node.query)) return !node.query.includes(evaluate(node.a, row));
    return node;
  };
  function select(fields?: any) {
    let table: string, condition: any = true, maximum = Infinity;
    const q: any = {
      from(t: any) { table = t._tableName; return q; }, where(c: any) { condition = c; return q; },
      orderBy() { return q; }, for() { return q; }, limit(n: number) { maximum = n; return q; },
      run() {
        const source = rows[table];
        if (!Array.isArray(source)) throw new Error("synthetic_deal_lookup_failure");
        return source.filter(r => evaluate(condition, { [table]: r })).slice(0, maximum).map(r => fields
          ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, evaluate(v, { [table]: r })])) : { ...r });
      }, then(resolve: any, reject: any) { return Promise.resolve().then(q.run).then(resolve, reject); },
    };
    return q;
  }
  function insert(table: any) {
    let input: any;
    const run = () => { const records = (Array.isArray(input) ? input : [input]).map(item => ({ id: randomUUID(), createdAt: new Date(), ...item })); rows[table._tableName].push(...records); return records; };
    const q: any = { values(v: any) { input = v; return q; },
      onConflictDoNothing() { return q; }, onConflictDoUpdate() { return q; },
      returning(fields?: any) { return Promise.resolve(run().map(r => fields ? Object.fromEntries(Object.entries(fields).map(([k, v]: any) => [k, r[v.key]])) : r)); },
      then(resolve: any, reject: any) { return Promise.resolve().then(run).then(resolve, reject); } };
    return q;
  }
  function update(table: any) { let input: any, condition: any; const run = () => { const values = rows[table._tableName].filter(r => evaluate(condition, { [table._tableName]: r })); values.forEach(r => Object.assign(r, input)); return values; }; const q: any = { set(v: any) { input = v; return q; }, where(v: any) { condition = v; return q; }, returning: async (fields?: any) => run().map((r: any) => fields ? Object.fromEntries(Object.entries(fields).map(([k, v]: any) => [k, r[v.key]])) : r), then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject) }; return q; }
  const state: any = {
    tables, rows, captured: [] as Array<{ url: string; body: any }>,
    db: { select, insert, update, execute: async () => [], transaction: async (cb: any) => cb((globalThis as any).__brainDealTest.db) },
  };
  (globalThis as any).__brainDealTest = state;

  const REPLY = "There is no active deal on record yet, so there are no current deal terms to show.";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    state.captured.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ choices: [{ message: { content: REPLY } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as any;

  const output = fileURLToPath(new URL(`./brain-deal-${randomUUID()}.mjs`, import.meta.url));
  try {
    const bundle = await build({
      stdin: { contents: 'export { runBrainTurn } from "../src/akif/brainOrchestrator.ts";', resolveDir: fileURLToPath(new URL(".", import.meta.url)), loader: "ts" },
      bundle: true, platform: "node", format: "esm", packages: "external", write: false,
      plugins: [{ name: "fixtures", setup(b) {
        b.onResolve({ filter: /.*/ }, args => {
          if (args.path === "@workspace/db") return { path: "db", namespace: "fixture" };
          if (args.path === "drizzle-orm") return { path: "orm", namespace: "fixture" };
        });
        b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents:
          'const s=globalThis.__brainDealTest;' + (args.path === "db"
            ? 'export const dbTransaction=(run)=>s.db.transaction(run);export const db=s.db;export const dbWrite=async(run)=>run(s.db);' + names.map(n => `export const ${n}=s.tables.${n};`).join("")
            : 'export const eq=(a,b)=>({kind:"eq",a,b});export const ne=(a,b)=>({kind:"ne",a,b});export const and=(...args)=>({kind:"and",args});export const or=(...args)=>({kind:"or",args});export const inArray=(a,query)=>({kind:"in",a,query});export const notInArray=(a,query)=>({kind:"notIn",a,query});const sql=Object.assign(()=>true,{raw:(x)=>x});export{sql};export const gte=(a,b)=>({kind:"gte",a,b});export const gt=(a,b)=>({kind:"gt",a,b});export const lt=(a,b)=>({kind:"lt",a,b});export const lte=(a,b)=>({kind:"lte",a,b});export const desc=x=>x;export const asc=x=>x;export const isNull=a=>({kind:"isNull",a});export const ilike=(a,b)=>({kind:"ilike",a,b});') }));
      } }],
    });
    await writeFile(output, bundle.outputFiles[0].text);
    const { runBrainTurn } = await import(output);

    const PHONE = "+15550001111";
    const TEXT = "What are my current deal\nTerms"; // burst aggregation joins bubbles with newlines
    const registerUser = () => { state.rows.usersTable = [{ id: "u-1", phone: PHONE, role: "seller", fullName: "Fixture Owner", name: "Fixture Owner", email: "fixture@example.com", country: "India", status: "active" }]; };
    const systemContent = () => {
      // The emotional-state estimator makes its own chat/completions call first;
      // the brain turn is the LAST model call in a turn (any regenerate retries
      // re-send the same messages array with the same system content).
      const calls = state.captured.filter((c: any) => c.url.includes("chat/completions"));
      const call = calls.at(-1);
      assert.ok(call, "a model call was made");
      assert.doesNotMatch(JSON.stringify(call.body?.messages?.[0] ?? ""), /Estimate the customer's emotional state/, "picked the emotion-estimator call, not the brain turn");
      return { call, system: JSON.stringify(call.body?.messages ?? []) };
    };

    await t.test("normal brain-model route: no deal rows -> no-deal line in the system prompt", async () => {
      registerUser();
      state.rows.dealsTable = [];
      state.captured = [];
      const out = await runBrainTurn({ phone: PHONE, text: TEXT });
      assert.equal(out?.reply, REPLY);
      const { call, system } = systemContent();
      assert.match(call.url, /groq/); // default route is the Groq brain model
      assert.match(system, /NO deal on record/);
      assert.match(system, /never present an unsubmitted offer or requirement draft as a deal/);
      assert.match(system, /Do not ask which deal/);
    });

    await t.test("Hermes trial route: same line reaches the Hermes payload", async () => {
      registerUser();
      state.rows.dealsTable = [];
      state.captured = [];
      process.env.AKIF_BRAIN_HERMES_TRIAL_NUMBERS = PHONE.replace(/\D/g, "");
      process.env.HERMES_AKIF_URL = "http://127.0.0.1:9";
      process.env.HERMES_AKIF_API_KEY = "fixture-hermes-key";
      try {
        const out = await runBrainTurn({ phone: PHONE, text: TEXT });
        assert.equal(out?.reply, REPLY);
        const { call, system } = systemContent();
        assert.match(call.url, /^http:\/\/127\.0\.0\.1:9\/v1\/chat\/completions/); // Hermes endpoint, not Groq
        assert.match(system, /NO deal on record/);
      } finally {
        delete process.env.AKIF_BRAIN_HERMES_TRIAL_NUMBERS;
        delete process.env.HERMES_AKIF_URL;
        delete process.env.HERMES_AKIF_API_KEY;
      }
    });

    await t.test("own deal row exists -> no injection, existing deal tools/selection untouched", async () => {
      registerUser();
      state.rows.dealsTable = [{ dealNumber: "UDC-OWN1", status: "negotiating", buyerUserId: "u-1", sellerUserId: "other" }];
      state.captured = [];
      const out = await runBrainTurn({ phone: PHONE, text: TEXT });
      assert.equal(out?.reply, REPLY);
      const { system } = systemContent();
      assert.doesNotMatch(system, /Deal state data/);
    });

    await t.test("another user's deal row only -> predicate excludes it, no-deal line still injected", async () => {
      registerUser();
      // Proves the authorization predicate at the harness's evaluated query
      // boundary: a row belonging to neither this buyer nor this seller must
      // not count as the customer's deal.
      state.rows.dealsTable = [{ dealNumber: "UDC-FOR1", status: "negotiating", buyerUserId: "someone-else", sellerUserId: "also-else" }];
      state.captured = [];
      const out = await runBrainTurn({ phone: PHONE, text: TEXT });
      assert.equal(out?.reply, REPLY);
      const { system } = systemContent();
      assert.match(system, /NO deal on record/);
      assert.doesNotMatch(system, /UDC-FOR1/);
    });

    await t.test("unregistered user: no deal-state line is injected", async () => {
      state.rows.usersTable = [];
      state.rows.dealsTable = [];
      state.captured = [];
      const out = await runBrainTurn({ phone: PHONE, text: TEXT });
      assert.equal(out?.reply, REPLY);
      const { system } = systemContent();
      assert.doesNotMatch(system, /Deal state data/);
    });

    await t.test("deal lookup failure: honest cannot-check line, never worded as no-deal", async () => {
      registerUser();
      state.rows.dealsTable = null; // select throws synthetic_deal_lookup_failure
      state.captured = [];
      const out = await runBrainTurn({ phone: PHONE, text: TEXT });
      assert.equal(out?.reply, REPLY);
      const { system } = systemContent();
      assert.match(system, /could not be checked just now/);
      assert.match(system, /never guess a deal state/);
      assert.doesNotMatch(system, /NO deal on record/);
      state.rows.dealsTable = [];
    });
  } finally {
    globalThis.fetch = realFetch;
    await unlink(output).catch(() => {});
  }
});
