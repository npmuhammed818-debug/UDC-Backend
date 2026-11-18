import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachPoolErrorLogger } from "../../../lib/db/src/connection.ts";

test("an idle pooled client error is logged instead of crashing the process", () => {
  const pool = new EventEmitter();
  const lines: string[] = [];
  attachPoolErrorLogger(pool as never, (line) => lines.push(line));
  assert.doesNotThrow(() => pool.emit("error", Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" })));
  const row = JSON.parse(lines[0]);
  assert.equal(row.event, "db_pool_idle_client_error");
  assert.equal(row.code, "57P01");
});

test("without the listener the same event would be uncaught (guard is what prevents the crash)", () => {
  const bare = new EventEmitter();
  assert.throws(() => bare.emit("error", new Error("x")));
});

import { redactForLog as redactApi } from "../src/lib/redactForLog.ts";
import { redactForLog as redactDb } from "../../../lib/db/src/connection.ts";
for (const [name, fn] of [["api", redactApi], ["db", redactDb]] as const) {
  test(`${name} log redaction removes connection strings, credentials and tokens`, () => {
    const dirty = "connect failed postgresql://postgres.abc:Sup3rSecret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres password=hunter2 Bearer abc.def.ghi key: re_AbCdEfGhIjKlMnOpQrStUvWxYz123456 sslmode=verify-full";
    const out = fn(dirty);
    for (const leak of ["Sup3rSecret", "pooler.supabase.com", "hunter2", "re_AbCd", "abc.def.ghi"]) assert.ok(!out.includes(leak), leak);
    assert.ok(out.includes("connect failed"));
    assert.ok(fn("x".repeat(500)).length <= 200);
  });
}

import { writeWithEviction, READ_ONLY_SQLSTATE } from "../../../lib/db/src/connection.ts";

test("a read-only write failure evicts the poisoned client and retries once", async () => {
  const released: Array<unknown> = [];
  let calls = 0;
  const poisoned = { release: (e?: unknown) => released.push(e ?? "clean") };
  const healthy = { release: (e?: unknown) => released.push(e ?? "clean") };
  const pool = { connect: async () => (calls++ === 0 ? poisoned : healthy) };
  const out = await writeWithEviction(pool as never, async (client) => {
    if (client === poisoned) throw Object.assign(new Error("cannot execute INSERT in a read-only transaction"), { code: "25006" });
    return "written";
  }, () => {});
  assert.equal(out, "written");
  assert.equal(calls, 2);
  assert.ok(released[0] instanceof Error, "poisoned client released with an error so node-pg destroys it");
  assert.equal(released[1], "clean");
});

test("a second 25006 still fails: one retry, never a loop", async () => {
  const released: Array<unknown> = [];
  let calls = 0;
  const pool = { connect: async () => { calls++; return { release: (e?: unknown) => released.push(e ?? "clean") }; } };
  await assert.rejects(
    writeWithEviction(pool as never, async () => { throw Object.assign(new Error("ro"), { code: READ_ONLY_SQLSTATE }); }, () => {}),
    (e: Error & { code?: string }) => e.code === "25006",
  );
  assert.equal(calls, 2);
  assert.equal(released.length, 2);
  assert.ok(released.every((r) => r instanceof Error));
});

test("other errors release cleanly and are not retried", async () => {
  const released: Array<unknown> = [];
  let calls = 0;
  const pool = { connect: async () => { calls++; return { release: (e?: unknown) => released.push(e ?? "clean") }; } };
  await assert.rejects(
    writeWithEviction(pool as never, async () => { throw Object.assign(new Error("unique violation"), { code: "23505" }); }, () => {}),
    (e: Error & { code?: string }) => e.code === "23505",
  );
  assert.equal(calls, 1);
  assert.deepEqual(released, ["clean"]);
});

import { transactionPinnedRetry, PINNED_STATE_QUERY } from "../../../lib/db/src/connection.ts";

function fakeClient(ro: string, calls: string[], fail?: { match: string; code: string; message: string }) {
  return {
    calls,
    async query(text: string) {
      calls.push(text);
      if (fail && text.toUpperCase().startsWith(fail.match.toUpperCase())) {
        throw Object.assign(new Error(fail.message), { code: fail.code });
      }
      if (text.startsWith("select current_setting")) return { rows: [{ ro, default_ro: "off", default_source: "default", pid: 1 }] };
      return { rows: [] };
    },
    release(e?: unknown) { calls.push(e ? "release(err)" : "release()"); },
  };
}

test("pinned retry: BEGIN, check, write, COMMIT in one transaction on one client", async () => {
  const calls: string[] = [];
  const client = fakeClient("off", calls);
  const out = await transactionPinnedRetry(client as never, async () => { calls.push("WRITE"); return "written"; });
  assert.equal(out, "written");
  assert.deepEqual(calls, ["BEGIN READ WRITE", PINNED_STATE_QUERY, "WRITE", "COMMIT"]);
});

test("pinned retry: a still-read-only retry session aborts BEFORE the write, then rolls back", async () => {
  const calls: string[] = [];
  const client = fakeClient("on", calls);
  await assert.rejects(
    transactionPinnedRetry(client as never, async () => { calls.push("WRITE"); }),
    (e: Error & { code?: string }) => e.code === "25006",
  );
  assert.deepEqual(calls, ["BEGIN READ WRITE", PINNED_STATE_QUERY, "ROLLBACK"]);
});

test("pinned retry: write failure rolls back and rethrows; COMMIT failure rolls back and rethrows", async () => {
  const c1: string[] = [];
  await assert.rejects(
    transactionPinnedRetry(fakeClient("off", c1) as never, async () => {
      throw Object.assign(new Error("write broke"), { code: "25007" });
    }),
    (e: Error & { code?: string }) => e.code === "25007",
  );
  assert.deepEqual(c1, ["BEGIN READ WRITE", PINNED_STATE_QUERY, "ROLLBACK"]);
  const c2: string[] = [];
  const client2 = fakeClient("off", c2, { match: "COMMIT", code: "ECONN", message: "commit dropped" });
  await assert.rejects(
    transactionPinnedRetry(client2 as never, async () => "written"),
    (e: Error & { code?: string }) => e.code === "ECONN",
  );
  assert.deepEqual(c2, ["BEGIN READ WRITE", PINNED_STATE_QUERY, "COMMIT", "ROLLBACK"]);
});

test("pinned retry: a session-poisoned default is overridden by BEGIN READ WRITE (16-18 Nov incident semantics)", async () => {
  // Simulates a Supavisor transaction-mode backend carrying a leaked
  // `SET default_transaction_read_only TO 'on'` (source 'session'): inside an
  // explicit BEGIN READ WRITE the transaction overrides the poisoned session
  // default, so current_setting reports off and the write proceeds.
  const calls: string[] = [];
  let txReadWrite = false;
  const client = {
    async query(text: string) {
      calls.push(text);
      if (text === "BEGIN READ WRITE") { txReadWrite = true; return { rows: [] }; }
      if (text.startsWith("select current_setting")) return { rows: [{ ro: txReadWrite ? "off" : "on", default_ro: "on", default_source: "session", pid: 7 }] };
      return { rows: [] };
    },
    release() {},
  };
  const out = await transactionPinnedRetry(client as never, async () => { calls.push("WRITE"); return "written"; });
  assert.equal(out, "written");
  assert.deepEqual(calls, ["BEGIN READ WRITE", PINNED_STATE_QUERY, "WRITE", "COMMIT"]);
});

test("pinned retry: an INTENTIONAL configured read-only default (source database/role/config) is NOT overridden - fails closed", async () => {
  // The guard for the inverse case: if someone deliberately sets a read-only
  // default via ALTER DATABASE / ALTER ROLE / config, BEGIN READ WRITE could
  // technically override it per transaction, but the retry must refuse.
  for (const source of ["database", "role", "configuration file"]) {
    const calls: string[] = [];
    const client = {
      async query(text: string) {
        calls.push(text);
        if (text.startsWith("select current_setting")) return { rows: [{ ro: "off", default_ro: "on", default_source: source, pid: 9 }] };
        return { rows: [] };
      },
      release() {},
    };
    await assert.rejects(
      transactionPinnedRetry(client as never, async () => { calls.push("WRITE"); return "written"; }),
      (e: Error & { code?: string }) => e.code === "25006" && /intentional/.test(e.message),
    );
    assert.deepEqual(calls, ["BEGIN READ WRITE", PINNED_STATE_QUERY, "ROLLBACK"], `source=${source}: no write, rolled back`);
  }
});

test("pinned retry with terminator rollback: ROLLBACK instead of COMMIT, write still runs, state logged internally", async () => {
  const calls: string[] = [];
  const logs: string[] = [];
  const client = {
    async query(text: string) {
      calls.push(text);
      if (text.startsWith("select current_setting")) return { rows: [{ ro: "off", default_ro: "off", default_source: "default", pid: 4242 }] };
      return { rows: [] };
    },
    release() {},
  };
  const out = await transactionPinnedRetry(client as never, async () => { calls.push("WRITE"); return "probed"; }, { terminator: "rollback", log: (l) => logs.push(l) });
  assert.equal(out, "probed");
  assert.deepEqual(calls, ["BEGIN READ WRITE", PINNED_STATE_QUERY, "WRITE", "ROLLBACK"]);
  const state = JSON.parse(logs[0]);
  assert.equal(state.event, "db_pinned_tx_state");
  assert.equal(state.backend_pid, 4242);
  assert.equal(state.transaction_read_only, "off");
  assert.equal(state.rollback_only, true);
});

test("pinned retry without options: COMMIT terminator (production default)", async () => {
  const calls: string[] = [];
  const client = fakeClient("off", calls);
  const out = await transactionPinnedRetry(client as never, async () => { calls.push("WRITE"); return "written"; });
  assert.equal(out, "written");
  assert.deepEqual(calls, ["BEGIN READ WRITE", PINNED_STATE_QUERY, "WRITE", "COMMIT"]);
});

test("writeWithEviction with a pinned retry: one retry on 25006, wrapped failure destroys the client", async () => {
  const released: Array<unknown> = [];
  let calls = 0;
  const pool = { connect: async () => { calls++; return { release: (e?: unknown) => released.push(e ?? "clean"), query: async () => ({ rows: [{ ro: "off" }] }) }; } };
  const out = await writeWithEviction(pool as never, async () => {
    if (calls === 1) throw Object.assign(new Error("ro"), { code: "25006" });
    return "written";
  }, () => {}, async (client, runOnce) => transactionPinnedRetry(client as never, runOnce));
  assert.equal(out, "written");
  assert.equal(calls, 2);
  assert.ok(released[0] instanceof Error, "the poisoned session is destroyed");
  assert.equal(released[1], "clean", "the successful retry session returns to the pool");
});

test("writeWithEviction with a pinned retry: non-25006 inside the retry is not retried and destroys the client", async () => {
  const released: Array<unknown> = [];
  let calls = 0, runs = 0;
  const pool = { connect: async () => { calls++; return { release: (e?: unknown) => released.push(e ?? "clean"), query: async () => ({ rows: [{ ro: "off" }] }) }; } };
  await assert.rejects(
    writeWithEviction(pool as never, async () => {
      runs++;
      throw Object.assign(new Error("x"), { code: calls === 1 ? "25006" : "23505" });
    }, () => {}, async (client, runOnce) => transactionPinnedRetry(client as never, runOnce)),
    (e: Error & { code?: string }) => e.code === "23505",
  );
  assert.equal(calls, 2);
  assert.equal(runs, 2, "first attempt + one retry, never a third");
  assert.ok(released.every((r) => r instanceof Error));
});
