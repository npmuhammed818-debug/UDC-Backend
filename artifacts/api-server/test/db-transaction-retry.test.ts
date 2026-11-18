import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// Unit matrix for transactionWithEviction (whole-transaction pinned retry).
// Fake clients script every query; the pool hands them out in order.
const bundled = fileURLToPath(new URL(`./txretry-${randomUUID()}.mjs`, import.meta.url));
const out = await build({
  stdin: {
    contents: "export { transactionWithEviction } from '../../../lib/db/src/connection.ts';",
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: "ts",
  },
  platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
});
await writeFile(bundled, out.outputFiles[0].text);
const { transactionWithEviction } = await import(bundled);
process.on("exit", () => unlink(bundled).catch(() => undefined));

type Step = { error?: { code?: string; message: string }; rows?: Array<Record<string, unknown>> };
function fakeClient(script: (text: string, n: number) => Step | undefined) {
  const calls: string[] = [];
  const client = {
    calls,
    releasedWith: undefined as unknown,
    async query(text: string) {
      calls.push(text);
      const step = script(text, calls.length);
      if (step?.error) throw Object.assign(new Error(step.error.message), { code: step.error.code });
      return { rows: step?.rows ?? [] };
    },
    release(error?: unknown) { client.releasedWith = error; },
  };
  return client;
}
const ro25006 = { code: "25006", message: "cannot execute INSERT in a read-only transaction" };
// State row for a clean retry backend whose POOLER neighbour leaked a
// session-level default (the 16-18 Nov incident signature): the leak is
// visible in default_ro but source 'session' marks it non-intentional.
const poisonedSessionState = [{ ro: "off", default_ro: "on", default_source: "session", pid: 4242 }];
const isStateQuery = (t: string) => t.startsWith("select current_setting('transaction_read_only')");
const logs: string[] = [];
const log = (l: string) => logs.push(l);

test("clean first attempt: BEGIN, body, COMMIT on one client, released clean", async () => {
  const c = fakeClient(() => ({}));
  const pool = { connect: async () => c };
  const result = await transactionWithEviction(pool, (cl) => ({ cl }), async (tx: { cl: typeof c }) => {
    await tx.cl.query("insert into t values (1)");
    return "done";
  }, log);
  assert.equal(result, "done");
  assert.deepEqual(c.calls, ["BEGIN", "insert into t values (1)", "COMMIT"]);
  assert.equal(c.releasedWith, undefined, "clean release, client stays in pool");
});

test("25006 mid-transaction: rollback, evict poisoned client, whole body re-runs once inside BEGIN READ WRITE", async () => {
  const poisoned = fakeClient((text) => text.startsWith("insert") ? { error: ro25006 } : {});
  const fresh = fakeClient((text) => isStateQuery(text) ? { rows: poisonedSessionState } : {});
  const clients = [poisoned, fresh];
  const pool = { connect: async () => clients.shift()! };
  let bodyRuns = 0;
  const result = await transactionWithEviction(pool, (cl) => ({ cl }), async (tx: { cl: ReturnType<typeof fakeClient> }) => {
    bodyRuns++;
    await tx.cl.query("insert into t values (1)");
    await tx.cl.query("insert into t values (2)");
    return "done";
  }, log);
  assert.equal(result, "done");
  assert.equal(bodyRuns, 2, "whole body re-ran exactly once");
  assert.deepEqual(poisoned.calls, ["BEGIN", "insert into t values (1)", "ROLLBACK"], "first attempt rolled back before eviction");
  assert.ok(poisoned.releasedWith instanceof Error, "poisoned client destroyed");
  assert.deepEqual(fresh.calls, ["BEGIN READ WRITE", fresh.calls[1], "insert into t values (1)", "insert into t values (2)", "COMMIT"]);
  assert.ok(isStateQuery(fresh.calls[1]), "read-only intent guard ran inside the pinned transaction");
  assert.equal(fresh.releasedWith, undefined);
  assert.ok(logs.some((l) => l.includes("db_tx_readonly_session_evicted") && l.includes('"attempt":0')));
});

test("intentional read-only default (source 'role') fails closed on the retry: body never re-runs", async () => {
  const poisoned = fakeClient((text) => text.startsWith("insert") ? { error: ro25006 } : {});
  const intentional = fakeClient((text) => isStateQuery(text)
    ? { rows: [{ ro: "off", default_ro: "on", default_source: "role", pid: 7 }] } : {});
  const clients = [poisoned, intentional];
  const pool = { connect: async () => clients.shift()! };
  let bodyRuns = 0;
  await assert.rejects(
    transactionWithEviction(pool, (cl) => ({ cl }), async (tx: { cl: ReturnType<typeof fakeClient> }) => {
      bodyRuns++;
      await tx.cl.query("insert into t values (1)");
    }, log),
    (e: Error) => /intentional read-only default/.test(e.message),
  );
  assert.equal(bodyRuns, 1, "guard stopped the retry before the body");
  assert.ok(intentional.calls.includes("ROLLBACK"), "pinned transaction rolled back");
  assert.ok(intentional.releasedWith instanceof Error, "uncertain-state client destroyed");
});

test("still read-only inside BEGIN READ WRITE (hot standby) fails closed", async () => {
  const poisoned = fakeClient((text) => text.startsWith("insert") ? { error: ro25006 } : {});
  const standby = fakeClient((text) => isStateQuery(text)
    ? { rows: [{ ro: "on", default_ro: "on", default_source: "session", pid: 9 }] } : {});
  const clients = [poisoned, standby];
  const pool = { connect: async () => clients.shift()! };
  let bodyRuns = 0;
  await assert.rejects(
    transactionWithEviction(pool, (cl) => ({ cl }), async (tx: { cl: ReturnType<typeof fakeClient> }) => {
      bodyRuns++;
      await tx.cl.query("insert into t values (1)");
    }, log),
    (e: Error) => /retry session is read-only/.test(e.message),
  );
  assert.equal(bodyRuns, 1);
});

test("non-25006 body error: ROLLBACK, clean release, no retry, error propagates untouched", async () => {
  const sentinel = new Error("duplicate key value");
  const c = fakeClient((text) => text.startsWith("insert into t values (2)") ? { error: { message: "duplicate key value" } } : {});
  const pool = { connect: async () => c };
  let bodyRuns = 0;
  await assert.rejects(
    transactionWithEviction(pool, (cl) => ({ cl }), async (tx: { cl: typeof c }) => {
      bodyRuns++;
      await tx.cl.query("insert into t values (1)");
      await tx.cl.query("insert into t values (2)");
    }, log),
    (e: Error) => e.message === sentinel.message,
  );
  assert.equal(bodyRuns, 1, "no retry for ordinary errors");
  assert.deepEqual(c.calls, ["BEGIN", "insert into t values (1)", "insert into t values (2)", "ROLLBACK"]);
  assert.equal(c.releasedWith, undefined, "rolled-back client returns to the pool");
});

test("25006 at COMMIT: rolled-back attempt is evicted, body re-runs once (callers must keep bodies free of non-DB side effects)", async () => {
  const commitFails = fakeClient((text) => text === "COMMIT" ? { error: { code: "25006", message: "cannot execute COMMIT in a read-only transaction" } } : {});
  const fresh = fakeClient((text) => isStateQuery(text) ? { rows: poisonedSessionState } : {});
  const clients = [commitFails, fresh];
  const pool = { connect: async () => clients.shift()! };
  let bodyRuns = 0;
  const result = await transactionWithEviction(pool, (cl) => ({ cl }), async (tx: { cl: ReturnType<typeof fakeClient> }) => {
    bodyRuns++;
    await tx.cl.query("insert into t values (1)");
    return "done";
  }, log);
  assert.equal(result, "done");
  assert.equal(bodyRuns, 2);
  assert.ok(commitFails.releasedWith instanceof Error);
  assert.deepEqual(fresh.calls.filter((t) => t.startsWith("insert")), ["insert into t values (1)"]);
});

test("drizzle-wrapped 25006 (SQLSTATE on .cause) is still detected and retried", async () => {
  // Regression: DrizzleQueryError carries the pg error as .cause; a top-level
  // code check misclassifies it as an ordinary error and skips the retry
  // (found by the loopback contamination check, 18 Nov).
  const poisoned = fakeClient((text) => text.startsWith("insert")
    ? { error: { message: "Failed query: insert ..." } } : {});
  const origQuery = poisoned.query;
  poisoned.query = async (text: string) => {
    try { return await origQuery(text); } catch (e) {
      if (text.startsWith("insert")) throw Object.assign(new Error("Failed query: insert into t values (1)"), { cause: Object.assign(new Error("cannot execute INSERT in a read-only transaction"), { code: "25006" }) });
      throw e;
    }
  };
  const fresh = fakeClient((text) => isStateQuery(text) ? { rows: poisonedSessionState } : {});
  const clients = [poisoned, fresh];
  const pool = { connect: async () => clients.shift()! };
  const result = await transactionWithEviction(pool, (cl) => ({ cl }), async (tx: { cl: ReturnType<typeof fakeClient> }) => {
    await tx.cl.query("insert into t values (1)");
    return "done";
  }, log);
  assert.equal(result, "done");
  assert.ok(poisoned.releasedWith instanceof Error, "cause-wrapped 25006 still evicts");
});

test("retry exhaustion: two poisoned attempts -> throws the last 25006, both clients destroyed, body ran twice", async () => {
  const a = fakeClient((text) => text.startsWith("insert") ? { error: ro25006 } : {});
  const b = fakeClient((text) => text === "BEGIN READ WRITE" ? { error: { code: "25006", message: "cannot execute BEGIN READ WRITE in a read-only transaction" } } : {});
  const clients = [a, b];
  let connects = 0;
  const pool = { connect: async () => { connects++; return clients.shift()!; } };
  let bodyRuns = 0;
  await assert.rejects(
    transactionWithEviction(pool, (cl) => ({ cl }), async (tx: { cl: ReturnType<typeof fakeClient> }) => {
      bodyRuns++;
      await tx.cl.query("insert into t values (1)");
    }, log),
    (e: Error & { code?: string }) => e.code === "25006",
  );
  assert.equal(connects, 2, "exactly one retry");
  assert.equal(bodyRuns, 1, "second client died before the body");
  assert.ok(a.releasedWith instanceof Error && b.releasedWith instanceof Error);
});
