import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {writeFile,unlink} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

// Phase 7: task planning with honest states and approval gates.

test("complex goal detection: multi-step requests only, questions stay out", async () => {
  const { looksLikeComplexGoal, isApprovalReply, isStatusQuestion } = await bundleModule(
    "export {looksLikeComplexGoal,isApprovalReply,isStatusQuestion} from '../src/akif/taskPlanner';",
    { '^@workspace\\/db$': 'export const db={};export const akifTasksTable={};', '^drizzle-orm$': 'export const eq=()=>({});export const and=()=>({});export const or=()=>({});export const desc=x=>x;', 'cheapModel(\\.ts)?$': 'export const runCheapModelChat=async()=>{throw Error("no model in pure test");};' },
  );
  for (const t of ["Help me import copper from Chile", "I want to sell 500 MT of cathodes", "Find me a seller for aluminum scrap", "Set up an inspection for my shipment"]) {
    assert.equal(looksLikeComplexGoal(t), true, t);
  }
  for (const t of ["What is CIF?", "How much is the fee?", "tell me about DLC", "yes"]) {
    assert.equal(looksLikeComplexGoal(t), false, t);
  }
  assert.equal(isApprovalReply("yes"), true);
  assert.equal(isApprovalReply("go ahead"), true);
  assert.equal(isApprovalReply("yes please"), true);
  assert.equal(isApprovalReply("yes but change the price"), false);
  assert.equal(isStatusQuestion("what is the status?"), true);
  assert.equal(isStatusQuestion("what is CIF?"), false);
});

async function bundleModule(entry, fixtures) {
  const output = fileURLToPath(new URL(`./akif-planner-${randomUUID()}.mjs`, import.meta.url));
  const bundle = await build({
    stdin: { contents: entry, resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
    plugins: [{ name: 'fixture', setup(b) {
      const keys = Object.keys(fixtures);
      keys.forEach((k, i) => b.onResolve({ filter: new RegExp(k) }, () => ({ path: `f${i}`, namespace: 'fixture' })));
      const contents = Object.fromEntries(keys.map((k, i) => [`f${i}`, fixtures[k]]));
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

function makeTaskDb() {
  const rows = { akifTasksTable: [] };
  const tables = { akifTasksTable: new Proxy({ _table: 'akifTasksTable' }, {
    get: (target, key) => key === '_table' ? 'akifTasksTable' : { column: key, table: 'akifTasksTable' },
  }) };
  const val = (expr, row) => expr?.column ? row[expr.column] : expr;
  const match = (expr, row) => !expr ? true
    : expr.kind === 'and' ? expr.args.every(e => match(e, row))
    : expr.kind === 'or' ? expr.args.some(e => match(e, row))
    : expr.kind === 'eq' ? val(expr.a, row) === val(expr.b, row)
    : true;
  const select = fields => {
    let from, condition, limit = Infinity, order;
    const q = {
      from: t => (from = t._table, q),
      where: c => (condition = c, q),
      orderBy: c => (order = c, q),
      limit: n => (limit = n, q),
      then: (resolve, reject) => Promise.resolve().then(() => {
        let result = rows[from].filter(row => match(condition, row));
        result = result.slice(0, limit);
        return result.map(row => fields ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, val(v, row)])) : row);
      }).then(resolve, reject),
    };
    return q;
  };
  const insert = table => {
    let input;
    const run = () => (Array.isArray(input) ? input : [input]).map(item => {
      const result = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...item };
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
  const update = table => {
    let input, condition;
    const run = () => {
      const matched = rows[table._table].filter(row => match(condition, row));
      for (const row of matched) Object.assign(row, input);
      return matched;
    };
    const q = {
      set: value => (input = value, q),
      where: c => (condition = c, q),
      returning: fields => Promise.resolve().then(run).then(items => fields ? items.map(item => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, item[v.column]]))) : items),
      then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
    };
    return q;
  };
  return { db: { select, insert, update }, rows, tables };
}

test("task planner: plan, gate, approve, complete, cancel - honest states throughout", async () => {
  const { db, rows, tables } = makeTaskDb();
  const key = '__plannerFixture';
  globalThis[key] = { db, tables };
  const mod = await bundleModule(
    "export * from '../src/akif/taskPlanner';",
    {
      '^@workspace\\/db$': `export const db=globalThis.${key}.db;export const akifTasksTable=globalThis.${key}.tables.akifTasksTable;`,
      '^drizzle-orm$': "export const eq=(a,b)=>({kind:'eq',a,b});export const and=(...args)=>({kind:'and',args});export const or=(...args)=>({kind:'or',args});export const desc=x=>({kind:'desc',x});",
      'cheapModel(\\.ts)?$': 'export const runCheapModelChat=async()=>{throw Error("tests must inject planner");};',
    },
  );

  // Plan creation with an injected planner; gated steps flagged by their words.
  const planned = await mod.planTask({
    userId: 'u1', goal: 'Help me import copper', source: 'whatsapp:test',
    planner: async () => ['Confirm quantity and terms', 'Compare verified sellers', 'Contact the chosen seller', 'Submit the requirement'],
  });
  assert.ok(planned);
  assert.equal(planned.steps.length, 4);
  assert.equal(planned.steps[0].state, 'in_progress');
  assert.equal(planned.steps[2].gated, true, 'contacting a seller is a real action and needs a yes');
  assert.equal(planned.steps[3].gated, true);
  assert.equal(planned.steps[1].gated, undefined);
  assert.match(mod.formatPlanForCustomer(planned.goal, planned.steps), /starting now/);
  assert.match(mod.formatPlanForCustomer(planned.goal, planned.steps), /I will ask you before this/);

  // A planner that returns junk produces no plan, never a fake one.
  assert.equal(await mod.planTask({ userId: 'u1', goal: 'x'.repeat(20), source: 'whatsapp:test', planner: async () => ['only one step'] }), null);
  assert.equal(await mod.planTask({ userId: 'u1', goal: 'x'.repeat(20), source: 'whatsapp:test', planner: async () => { throw Error('model down'); } }), null);
  assert.equal(rows.akifTasksTable.length, 1);

  // Open tasks are listed; completing an ungated step advances honestly.
  let open = await mod.readOpenTasks({ userId: 'u1' });
  assert.equal(open.length, 1);
  const done1 = await mod.completeStep({ taskId: planned.id, stepIndex: 0 });
  assert.equal(done1.ok, true);
  assert.equal(done1.task.steps[0].state, 'completed');
  assert.equal(done1.task.steps[1].state, 'in_progress');
  assert.equal(done1.task.state, 'in_progress');

  // A gated step cannot complete without approval: it waits, honestly.
  await mod.completeStep({ taskId: planned.id, stepIndex: 1 });
  const blocked = await mod.completeStep({ taskId: planned.id, stepIndex: 2 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blocked, 'awaiting_approval');
  assert.equal(blocked.task.state, 'awaiting_approval');
  assert.equal(blocked.task.steps[2].state, 'awaiting_approval');

  // The customer's yes approves the step; only then can it complete.
  const approved = await mod.approveStep({ taskId: planned.id });
  assert.equal(approved.ok, true);
  assert.equal(approved.step.label, 'Contact the chosen seller');
  assert.equal(approved.step.approved, true);
  const done2 = await mod.completeStep({ taskId: planned.id, stepIndex: 2 });
  assert.equal(done2.ok, true);

  // Last gated step still needs its own yes; then the task completes.
  await mod.completeStep({ taskId: planned.id, stepIndex: 3 });
  await mod.approveStep({ taskId: planned.id });
  const done3 = await mod.completeStep({ taskId: planned.id, stepIndex: 3 });
  assert.equal(done3.task.state, 'completed');
  open = await mod.readOpenTasks({ userId: 'u1' });
  assert.equal(open.length, 0, 'completed tasks leave the open list');

  // Cancellation skips remaining steps and keeps the record.
  const planned2 = await mod.planTask({ userId: 'u1', goal: 'I want to sell cathodes', source: 'whatsapp:test', planner: async () => ['Check your listing', 'Contact buyers'] });
  assert.ok(planned2);
  assert.equal(await mod.cancelTask({ taskId: planned2.id }), true);
  const cancelled = rows.akifTasksTable.find(r => r.id === planned2.id);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.steps[1].state, 'skipped');
  assert.equal(rows.akifTasksTable.length, 2, 'nothing is deleted');

  // Tasks are quoted data with goal and honest states.
  const prompt = mod.formatTasksForPrompt([{ id: 'x', goal: 'Help me import copper', state: 'in_progress', steps: [{ label: 'Confirm terms', state: 'completed' }, { label: 'Contact seller', state: 'in_progress', gated: true }] }]);
  assert.match(prompt, /private task list/);
  assert.match(prompt, /Contact seller \[in_progress\]/);
});
