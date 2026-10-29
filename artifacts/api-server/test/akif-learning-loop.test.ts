import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

// Phase 6: learning from corrections and from deal outcomes, plus immediate
// withdrawal of a disputed lesson. Pure functions are tested directly; the
// db-touching parts run against a bundled fake db like the phase 4 tests.


// Bundle a module entry with stubbed fixtures, the same pattern as the
// phase 4 tests. Direct source imports cannot resolve the repo's
// extensionless workspace imports under plain node.
async function bundleModule(entry, fixtures) {
  const output = fileURLToPath(new URL(`./akif-loop-${randomUUID()}.mjs`, import.meta.url));
  const bundle = await build({
    stdin: { contents: entry, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
    plugins: [{ name: 'fixture', setup(b) {
      for (const [filter, name] of Object.keys(fixtures).map((k, i) => [new RegExp(k), `f${i}`])) b.onResolve({ filter }, () => ({ path: name, namespace: 'fixture' }));
      const contents = Object.fromEntries(Object.values(fixtures).map((c, i) => [`f${i}`, c]));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: contents[a.path] }));
    } }],
  });
  await writeFile(output, bundle.outputFiles[0].text);
  try {
    return await import(`./${output.split('/').pop()}`);
  } finally {
    await unlink(output).catch(() => {});
  }
}

test("correction detection: strong signals only, ordinary talk stays out", async () => {
  const { looksLikeCorrection, isLessonDispute } = await bundleModule(
    "export {looksLikeCorrection,isLessonDispute} from '../src/akif/correctionLearning';",
    { '^@workspace\\/db$': 'export const db={};', 'customerMemory(\\.ts)?$': 'export const saveCustomerMemory=async()=>({id:null});' },
  );
  for (const t of ["I meant 500 MT, not 50", "wrong, the price was FOB not CIF", "that's not correct", "correction: delivery is March"]) {
    assert.equal(looksLikeCorrection(t), true, t);
  }
  for (const t of ["no", "no problem", "ok", "can you tell me the price?", "that is a lot of money"]) {
    assert.equal(looksLikeCorrection(t), false, t);
  }
  for (const t of ["that's not true", "you're wrong", "that is wrong"]) assert.equal(isLessonDispute(t), true, t);
  for (const t of ["I disagree with your price", "no thanks", "that deal is wrong for me"]) assert.equal(isLessonDispute(t), false, t);
});

test("deal outcome note: structural fields only, no identifiers by construction", async () => {
  const { dealOutcomeNote, TERMINAL_DEAL_STATUSES } = await bundleModule(
    "export {dealOutcomeNote,TERMINAL_DEAL_STATUSES} from '../src/akif/dealOutcomeLessons';",
    { '^@workspace\\/db$': 'export const db={};export const akifSharedLessonsTable={};export const dealsTable={};', '^drizzle-orm$': 'export const eq=()=>({});' },
  );
  const note = dealOutcomeNote({ status: "cancelled", incoterm: "CIF" });
  assert.equal(note, "A deal under CIF terms ended with status 'cancelled'.");
  assert.ok(!/UDC-|@|\d{3,}/.test(note));
  assert.deepEqual([...TERMINAL_DEAL_STATUSES].sort(), ["cancelled", "completed", "disputed", "failed", "rejected"]);
});

test("correction turn: private save plus shared-learner hook; non-corrections save nothing", async () => {
  const tableNames = ["akifCustomerMemoriesTable", "usersTable"];
  const tables = Object.fromEntries(tableNames.map(name => [name, new Proxy({ _table: name }, {
    get: (target, key) => key === "_table" ? name : { column: key, table: name },
  })]));
  const rows = Object.fromEntries(tableNames.map(name => [name, []]));
  rows.usersTable.push({ id: "u1", akifLearningOptIn: true });
  const val = (expr, row) => expr?.column ? row[expr.table]?.[expr.column] : expr;
  const match = (expr, row) => !expr ? true : expr.kind === "eq" ? val(expr.a, row) === val(expr.b, row) : true;
  const select = fields => {
    let from, condition, limit = Infinity;
    const q = {
      from: t => (from = t._table, q),
      where: c => (condition = c, q),
      limit: n => (limit = n, q),
      then: (resolve, reject) => Promise.resolve().then(() => {
        const result = rows[from].map(row => ({ [from]: row })).filter(item => match(condition, item)).slice(0, limit);
        return result.map(item => fields ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, val(v, item)])) : item[from]);
      }).then(resolve, reject),
    };
    return q;
  };
  const insert = table => {
    let input;
    const run = () => (Array.isArray(input) ? input : [input]).map(item => {
      const result = { id: randomUUID(), createdAt: new Date(), ...item };
      rows[table._table].push(result);
      return result;
    });
    const q = {
      values: value => (input = value, q),
      returning: fields => Promise.resolve().then(run).then(items => fields ? items.map(item => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, item[v.column]]))) : items),
      then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
    };
    return q;
  };
  const db = { select, insert };
  globalThis.__loopFixture = { db };
  const key = "__loopFixture";
  const output = fileURLToPath(new URL(`./akif-loop-${randomUUID()}.mjs`, import.meta.url));
  const bundle = await build({
    stdin: { contents: "export * from '../src/akif/correctionLearning';", resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
    plugins: [{ name: 'fixture', setup(b) {
      const fixtures = {
        db: `export const db=globalThis.${key}.db;` + tableNames.map(n => `export const ${n}=globalThis.${key}.db.__tables.${n};`).join(''),
        orm: "export const eq=(a,b)=>({kind:'eq',a,b});export const and=(...args)=>({kind:'and',args});export const or=(...args)=>({kind:'or',args});export const ilike=(a,pattern)=>({kind:'ilike',a,pattern});export const desc=x=>({kind:'desc',x});",
      };
      db.__tables = tables;
      for (const [filter, path] of [[/^@workspace\/db$/, 'db'], [/^drizzle-orm$/, 'orm']]) b.onResolve({ filter }, () => ({ path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: fixtures[a.path] }));
    } }],
  });
  await writeFile(output, bundle.outputFiles[0].text);
  try {
    const mod = await import(`./${output.split('/').pop()}`);
    const shared = [];
    const result = await mod.handleCorrectionTurn({
      userId: "u1", text: "I meant 500 MT, not 50", source: "whatsapp:test",
      sharedLearner: async input => { shared.push(input); },
    });
    assert.equal(result.saved, true);
    assert.equal(rows.akifCustomerMemoriesTable.length, 1);
    assert.equal(rows.akifCustomerMemoriesTable[0].kind, "correction");
    assert.equal(rows.akifCustomerMemoriesTable[0].source, "whatsapp:test");
    assert.equal(shared.length, 1);
    assert.equal(shared[0].topic, "correction");
    const skipped = await mod.handleCorrectionTurn({ userId: "u1", text: "thanks!", source: "whatsapp:test" });
    assert.equal(skipped.saved, false);
    assert.equal(rows.akifCustomerMemoriesTable.length, 1, "ordinary talk must not become a correction");
  } finally {
    await unlink(output).catch(() => {});
  }
});

test("deal outcome learning: terminal deals teach one structural lesson, staging marks practice, non-terminal skipped", async () => {
  const tableNames = ["dealsTable", "akifSharedLessonsTable"];
  const tables = Object.fromEntries(tableNames.map(name => [name, new Proxy({ _table: name }, {
    get: (target, key) => key === "_table" ? name : { column: key, table: name },
  })]));
  const rows = Object.fromEntries(tableNames.map(name => [name, []]));
  rows.dealsTable.push(
    { id: "d1", status: "cancelled", incoterm: "FOB", dealNumber: "UDC-1001" },
    { id: "d2", status: "negotiating", incoterm: "CIF", dealNumber: "UDC-1002" },
  );
  const val = (expr, row) => expr?.column ? row[expr.table]?.[expr.column] : expr;
  const match = (expr, row) => !expr ? true : expr.kind === "eq" ? val(expr.a, row) === val(expr.b, row) : true;
  const select = fields => {
    let from, condition, limit = Infinity;
    const q = {
      from: t => (from = t._table, q),
      where: c => (condition = c, q),
      limit: n => (limit = n, q),
      then: (resolve, reject) => Promise.resolve().then(() => {
        const result = rows[from].map(row => ({ [from]: row })).filter(item => match(condition, item)).slice(0, limit);
        return result.map(item => fields ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, val(v, item)])) : item[from]);
      }).then(resolve, reject),
    };
    return q;
  };
  const insert = table => {
    let input;
    const run = () => (Array.isArray(input) ? input : [input]).map(item => {
      const result = { id: randomUUID(), createdAt: new Date(), ...item };
      rows[table._table].push(result);
      return result;
    });
    const q = {
      values: value => (input = value, q),
      returning: fields => Promise.resolve().then(run).then(items => fields ? items.map(item => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, item[v.column]]))) : items),
      then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
    };
    return q;
  };
  const db = { select, insert };
  const key = "__outcomeFixture";
  globalThis[key] = { db };
  const prevEnv = process.env.UDC_APP_ENV;
  process.env.UDC_APP_ENV = "staging";
  const output = fileURLToPath(new URL(`./akif-outcome-${randomUUID()}.mjs`, import.meta.url));
  const bundle = await build({
    stdin: { contents: "export * from '../src/akif/dealOutcomeLessons';", resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
    plugins: [{ name: 'fixture', setup(b) {
      const fixtures = {
        db: `export const db=globalThis.${key}.db;` + tableNames.map(n => `export const ${n}=globalThis.${key}.db.__tables.${n};`).join(''),
        orm: "export const eq=(a,b)=>({kind:'eq',a,b});",
      };
      db.__tables = tables;
      for (const [filter, path] of [[/^@workspace\/db$/, 'db'], [/^drizzle-orm$/, 'orm']]) b.onResolve({ filter }, () => ({ path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: fixtures[a.path] }));
    } }],
  });
  await writeFile(output, bundle.outputFiles[0].text);
  try {
    const mod = await import(`./${output.split('/').pop()}`);
    const done = await mod.learnFromDealOutcome({ dealId: "d1" });
    assert.equal(done.status, "approved");
    assert.equal(done.origin, "practice", "staging outcomes are marked practice, not proven");
    assert.equal(rows.akifSharedLessonsTable.length, 1);
    const lesson = rows.akifSharedLessonsTable[0];
    assert.equal(lesson.topic, "deal_outcome");
    assert.equal(lesson.origin, "practice");
    assert.equal(lesson.content, "A deal under FOB terms ended with status 'cancelled'.");
    assert.ok(!/UDC-1001|UDC-1002/.test(lesson.content), "deal numbers never appear in lessons");
    const skipped = await mod.learnFromDealOutcome({ dealId: "d2" });
    assert.equal(skipped.status, "skipped");
    assert.equal(rows.akifSharedLessonsTable.length, 1, "non-terminal deals teach nothing");
  } finally {
    if (prevEnv === undefined) delete process.env.UDC_APP_ENV; else process.env.UDC_APP_ENV = prevEnv;
    await unlink(output).catch(() => {});
  }
});
