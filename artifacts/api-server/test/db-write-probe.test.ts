import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { makeWriteProbeHandler } from "../src/routes/dbWriteProbe.ts";

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

function fakePool(ro = "off") {
  const calls: string[] = [];
  let connects = 0;
  const released: Array<unknown> = [];
  return {
    calls,
    released,
    get connects() { return connects; },
    async connect() {
      connects++;
      return {
        async query(text: string) {
          calls.push(text);
          if (text.startsWith("select current_setting")) return { rows: [{ ro, pid: 123 }] };
          return { rows: [] };
        },
        release(e?: unknown) { released.push(e ?? "clean"); },
      };
    },
  };
}

function runRoute(admin: unknown, pool: ReturnType<typeof fakePool>, envFlag: string | undefined, now: () => number = () => Date.now()) {
  const req = { authUser: admin } as never;
  const res = fakeRes();
  const old = process.env.UDC_DB_WRITE_PROBE;
  if (envFlag === undefined) delete process.env.UDC_DB_WRITE_PROBE; else process.env.UDC_DB_WRITE_PROBE = envFlag;
  const mw = requireRole("admin");
  let passed = false;
  mw(req as never, res as never, () => { passed = true; });
  const handler = makeWriteProbeHandler(pool, now);
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

test("authorized probe: BEGIN, one write, ROLLBACK, clean release, no-store, no internals in body", async () => {
  const pool = fakePool("off");
  const { res, restore } = await runRoute({ role: "admin", status: "approved" }, pool, "1");
  restore();
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.headers["Cache-Control"], "no-store");
  const body = res.out.body as Record<string, unknown>;
  assert.equal(body.status, "ok");
  assert.equal(body.write, "rollback_only");
  assert.ok(!("backend_pid" in body) && !("pid" in body), "no backend internals in the response");
  assert.deepEqual(pool.calls.slice(0, 2), ["BEGIN", "INSERT INTO public.whatsapp_inbound_dedup (id_hash) VALUES ($1)"]);
  assert.equal(pool.calls[pool.calls.length - 1], "ROLLBACK");
  assert.deepEqual(pool.released, ["clean"]);
});

test("rate limit: a second probe inside 30s gets 429 with zero database work", async () => {
  const pool = fakePool();
  const t = 1_000_000;
  const handler = makeWriteProbeHandler(pool, () => t); // ONE instance, as the route binds it
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

test("write failure: 503 with bounded code, rollback still attempted in finally", async () => {
  const pool = fakePool();
  const origQuery = (await pool.connect()).query;
  void origQuery;
  const p2 = {
    calls: [] as string[],
    released: [] as Array<unknown>,
    async connect() {
      return {
        async query(text: string) {
          p2.calls.push(text);
          if (text.startsWith("INSERT")) throw Object.assign(new Error("ro"), { code: "25006" });
          return { rows: [{ ro: "off", pid: 1 }] };
        },
        release(e?: unknown) { p2.released.push(e ?? "clean"); },
      };
    },
  };
  const { res, restore } = await runRoute({ role: "admin", status: "approved" }, p2, "1");
  restore();
  assert.equal(res.out.statusCode, 503);
  assert.equal((res.out.body as Record<string, unknown>).code, "25006");
  assert.deepEqual(p2.calls, ["BEGIN", "INSERT INTO public.whatsapp_inbound_dedup (id_hash) VALUES ($1)", "ROLLBACK"]);
  assert.deepEqual(p2.released, ["clean"], "rollback succeeded: session returns to the pool");
});

test("rollback failure destroys the client", async () => {
  const released: Array<unknown> = [];
  const p3 = {
    async connect() {
      return {
        async query(text: string) {
          if (text.startsWith("INSERT")) throw Object.assign(new Error("ro"), { code: "25006" });
          if (text === "ROLLBACK") throw new Error("connection lost");
          return { rows: [] };
        },
        release(e?: unknown) { released.push(e ?? "clean"); },
      };
    },
  };
  const { res, restore } = await runRoute({ role: "admin", status: "approved" }, p3, "1");
  restore();
  assert.equal(res.out.statusCode, 503);
  assert.ok(released[0] instanceof Error, "client destroyed after rollback failure");
});
process.on("exit", () => unlink(bundled).catch(() => undefined));
