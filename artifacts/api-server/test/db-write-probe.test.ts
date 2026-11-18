import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { makeWriteProbeHandler } from "../src/routes/dbWriteProbe.ts";
// The REAL production candidate retry: the probe must exercise this exact
// wrapper (with terminator "rollback"), not a look-alike.
import { transactionPinnedRetry, PINNED_STATE_QUERY } from "../../../lib/db/src/connection.ts";

const rollbackWrap = (client: never, runOnce: () => Promise<unknown>, log?: (line: string) => void) =>
  transactionPinnedRetry(client, runOnce, { terminator: "rollback", log });

// requireRole comes from the REAL auth middleware. Its module pulls the db
// layer, so it is bundled here with a stubbed @workspace/db - the same
// fixture pattern as the other route-level suites.
const bundled = fileURLToPath(new URL(`./probe-${randomUUID()}.mjs`, import.meta.url));
const out = await build({
  stdin: { contents: "export { requireRole } from '../src/auth/middleware.ts';", resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
  platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
  plugins: [{ name: 'probe-fixture', setup(b) {
    b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: 'db', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const db={};export const pool={};export const authSessionsTable={};export const usersTable={};' }));
  } }],
});
await writeFile(bundled, out.outputFiles[0].text);
const { requireRole } = await import(bundled);

function fakeRes() {
  const out: { statusCode?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  return {
    out,
    setHeader(n: string, v: string) { out.headers[n] = v; },
    status(code: number) { out.statusCode = code; return { json(body: unknown) { out.body = body; } }; },
  };
}

// A fake pool whose connections are Supavisor-like backends carrying a
// poisoned session default when poisonFirst is set: plain BEGIN leaves
// transaction_read_only on; BEGIN READ WRITE overrides it per transaction
// (PostgreSQL SET TRANSACTION semantics). retryRo simulates a hard read-only
// target (standby): even BEGIN READ WRITE leaves the transaction read-only.
function fakePool(opts: { poisonFirst?: boolean; retryRo?: string } = {}) {
  const { poisonFirst = false, retryRo = "off" } = opts;
  const calls: Array<{ client: number; text: string }> = [];
  const released: Array<{ client: number; error: unknown }> = [];
  const logs: string[] = [];
  let connects = 0;
  return {
    calls,
    released,
    logs,
    get connects() { return connects; },
    log(line: string) { logs.push(line); },
    async connect() {
      const id = ++connects;
      const poisoned = poisonFirst;
      let txRo = poisoned ? "on" : retryRo;
      return {
        async query(text: string) {
          calls.push({ client: id, text });
          if (text === "BEGIN") { txRo = poisoned ? "on" : "off"; return { rows: [] }; }
          if (text === "BEGIN READ WRITE") { txRo = retryRo; return { rows: [] }; }
          if (text.startsWith("select current_setting")) return { rows: [{ ro: txRo, default_ro: poisoned ? "on" : "off", default_source: poisoned ? "session" : "default", pid: 1000 + id }] };
          if (text.startsWith("INSERT") && txRo === "on") throw Object.assign(new Error("cannot execute INSERT in a read-only transaction"), { code: "25006" });
          return { rows: [] };
        },
        release(e?: unknown) { released.push({ client: id, error: e ?? null }); },
      };
    },
  };
}

function runRoute(admin: unknown, deps: { connect(): Promise<unknown>; log?(line: string): void }, envFlag: string | undefined, now: () => number = () => Date.now()) {
  const req = { authUser: admin } as never;
  const res = fakeRes();
  const old = process.env.UDC_DB_WRITE_PROBE;
  if (envFlag === undefined) delete process.env.UDC_DB_WRITE_PROBE; else process.env.UDC_DB_WRITE_PROBE = envFlag;
  const mw = requireRole("admin");
  let passed = false;
  mw(req as never, res as never, () => { passed = true; });
  const log = deps.log ?? ((line: string) => console.error(line));
  const handler = makeWriteProbeHandler({ connect: deps.connect as never, wrapRetry: ((c: never, r: () => Promise<unknown>) => rollbackWrap(c, r, log)) as never }, now, log);
  const done = passed ? handler(req, res as never) : Promise.resolve();
  return done.then(() => ({ res, passed, old, restore: () => { if (old === undefined) delete process.env.UDC_DB_WRITE_PROBE; else process.env.UDC_DB_WRITE_PROBE = old; } }));
}

test("unauthorized requests get 401/403 and cause ZERO database work", async () => {
  for (const principal of [undefined, { role: "buyer", status: "approved" }, { role: "admin", status: "suspended" }]) {
    const pool = fakePool();
    const { res, restore } = await runRoute(principal, pool, "1");
    restore();
    assert.ok([401, 403].includes(res.out.statusCode!), JSON.stringify(res.out));
    assert.equal(pool.connects, 0, "no client checked out");
    assert.deepEqual(pool.calls, [], "no SQL issued");
  }
});

test("flag disabled: 404 and zero database work even for an admin", async () => {
  const pool = fakePool();
  const { res, restore } = await runRoute({ role: "admin", status: "approved" }, pool, undefined);
  restore();
  assert.equal(res.out.statusCode, 404);
  assert.equal(pool.connects, 0);
});

test("authorized probe on a clean pool: one plain attempt, BEGIN+write+ROLLBACK, no-store, no internals in body", async () => {
  const pool = fakePool();
  const { res, restore } = await runRoute({ role: "admin", status: "approved" }, pool, "1");
  restore();
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.headers["Cache-Control"], "no-store");
  const body = res.out.body as Record<string, unknown>;
  assert.equal(body.status, "ok");
  assert.equal(body.write, "rollback_only");
  assert.equal(body.attempts, 1);
  assert.ok(!("backend_pid" in body) && !("pid" in body), "no backend internals in the response");
  assert.deepEqual(pool.calls.map((c) => c.text), [
    "BEGIN",
    "select current_setting('transaction_read_only') as ro, pg_backend_pid() as pid",
    "INSERT INTO public.whatsapp_inbound_dedup (id_hash) VALUES ($1)",
    "ROLLBACK",
  ]);
  assert.deepEqual(pool.released, [{ client: 1, error: null }], "clean release, one client");
});

test("poisoned pool: plain attempt 25006s, session is evicted, REAL pinned retry (BEGIN READ WRITE) succeeds, rolled back", async () => {
  const pool = fakePool({ poisonFirst: true });
  const { res, restore } = await runRoute({ role: "admin", status: "approved" }, pool, "1");
  restore();
  assert.equal(res.out.statusCode, 200);
  const body = res.out.body as Record<string, unknown>;
  assert.equal(body.status, "ok");
  assert.equal(body.write, "rollback_only");
  assert.equal(body.attempts, 2);
  assert.equal(body.retried, true);
  assert.equal(body.transaction_read_only, "off");
  assert.ok(!("backend_pid" in body) && !("pid" in body), "no backend internals in the response");
  assert.deepEqual(pool.calls.map((c) => [c.client, c.text]), [
    [1, "BEGIN"],
    [1, "select current_setting('transaction_read_only') as ro, pg_backend_pid() as pid"],
    [1, "INSERT INTO public.whatsapp_inbound_dedup (id_hash) VALUES ($1)"],
    [1, "ROLLBACK"],
    [2, "BEGIN READ WRITE"],
    [2, PINNED_STATE_QUERY],
    [2, "INSERT INTO public.whatsapp_inbound_dedup (id_hash) VALUES ($1)"],
    [2, "select current_setting('transaction_read_only') as ro"],
    [2, "ROLLBACK"],
  ]);
  assert.equal(pool.released[0].client, 1);
  assert.ok(pool.released[0].error instanceof Error, "poisoned session evicted (released with error)");
  assert.deepEqual(pool.released[1], { client: 2, error: null }, "retry client released clean after rollback");
  // Internal evidence: backend/state logged for BOTH the plain attempt and
  // inside the pinned transaction; never in the response.
  const plain = pool.logs.map((l) => JSON.parse(l)).find((r) => r.event === "db_write_probe_state" && r.phase === "plain");
  assert.ok(plain && plain.transaction_read_only === "on" && typeof plain.backend_pid !== "undefined", "plain-attempt poison state logged internally");
  const pinned = pool.logs.map((l) => JSON.parse(l)).find((r) => r.event === "db_pinned_tx_state");
  assert.ok(pinned && pinned.transaction_read_only === "off" && pinned.rollback_only === true, "pinned-transaction state logged internally");
  assert.equal(pinned.default_source, "session", "leaked-session source recorded internally");
});

test("poisoned pool with a still-read-only retry session: 503, write never runs in the retry, retry client destroyed", async () => {
  const pool = fakePool({ poisonFirst: true, retryRo: "on" });
  const { res, restore } = await runRoute({ role: "admin", status: "approved" }, pool, "1");
  restore();
  assert.equal(res.out.statusCode, 503);
  assert.equal((res.out.body as Record<string, unknown>).code, "25006");
  const retryCalls = pool.calls.filter((c) => c.client === 2).map((c) => c.text);
  assert.deepEqual(retryCalls, [
    "BEGIN READ WRITE",
    PINNED_STATE_QUERY,
    "ROLLBACK",
  ], "still-read-only retry aborts before the write");
  assert.ok(pool.released[1].error instanceof Error, "wrapped failure destroys the client");
});

test("rate limit: a second probe inside 30s gets 429 with zero additional database work", async () => {
  const pool = fakePool();
  const t = 1_000_000;
  const log = pool.log;
  const handler = makeWriteProbeHandler({ connect: () => pool.connect(), wrapRetry: ((c: never, r: () => Promise<unknown>) => rollbackWrap(c, r, log)) as never }, () => t, log); // ONE instance, as the route binds it
  const old = process.env.UDC_DB_WRITE_PROBE;
  process.env.UDC_DB_WRITE_PROBE = "1";
  const res1 = fakeRes();
  await handler({ authUser: { role: "admin", status: "approved" } }, res1 as never);
  const res2 = fakeRes();
  await handler({ authUser: { role: "admin", status: "approved" } }, res2 as never);
  if (old === undefined) delete process.env.UDC_DB_WRITE_PROBE; else process.env.UDC_DB_WRITE_PROBE = old;
  assert.equal(res1.out.statusCode, 200);
  assert.equal(res2.out.statusCode, 429);
  assert.equal(pool.connects, 1, "only the first probe touched the database");
});

test("non-25006 write failure: 503 with bounded code, no retry, rollback still attempted", async () => {
  const p2 = {
    calls: [] as string[],
    released: [] as Array<unknown>,
    async connect() {
      return {
        async query(text: string) {
          p2.calls.push(text);
          if (text.startsWith("select current_setting")) return { rows: [{ ro: "off", pid: 1 }] };
          if (text.startsWith("INSERT")) throw Object.assign(new Error("disk full"), { code: "53100" });
          return { rows: [] };
        },
        release(e?: unknown) { p2.released.push(e ?? "clean"); },
      };
    },
  };
  const { res, restore } = await runRoute({ role: "admin", status: "approved" }, { connect: p2.connect }, "1");
  restore();
  assert.equal(res.out.statusCode, 503);
  assert.equal((res.out.body as Record<string, unknown>).code, "53100");
  assert.deepEqual(p2.calls, [
    "BEGIN",
    "select current_setting('transaction_read_only') as ro, pg_backend_pid() as pid",
    "INSERT INTO public.whatsapp_inbound_dedup (id_hash) VALUES ($1)",
    "ROLLBACK",
  ], "no retry attempt for non-25006 errors");
  assert.deepEqual(p2.released, ["clean"], "rollback succeeded: session returns to the pool");
});

test("rollback failure destroys the client", async () => {
  const released: Array<unknown> = [];
  const p3 = {
    async connect() {
      return {
        async query(text: string) {
          if (text.startsWith("select current_setting")) return { rows: [{ ro: "off", pid: 1 }] };
          if (text.startsWith("INSERT")) throw Object.assign(new Error("boom"), { code: "53100" });
          if (text === "ROLLBACK") throw new Error("connection lost");
          return { rows: [] };
        },
        release(e?: unknown) { released.push(e ?? "clean"); },
      };
    },
  };
  const { res, restore } = await runRoute({ role: "admin", status: "approved" }, { connect: p3.connect }, "1");
  restore();
  assert.equal(res.out.statusCode, 503);
  assert.ok(released[0] instanceof Error, "client destroyed after rollback failure");
});
process.on("exit", () => unlink(bundled).catch(() => undefined));
