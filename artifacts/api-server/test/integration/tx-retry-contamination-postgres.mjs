// Deterministic contamination evidence for transactionWithEviction, on an
// isolated loopback PostgreSQL 14 cluster (/tmp/pgtx, port 54329, socket-only,
// trust auth). NEVER pointed at staging/production: the URL below is fixed to
// the local socket and the script refuses any env override.
//
// Proves against a REAL server (not a fixture):
// 1. A pooled backend poisoned by a leaked session-level
//    `SET default_transaction_read_only TO 'on'` (the exact 16-18 Nov staging
//    signature, pg_settings source 'session') makes the first attempt fail
//    25006; the helper evicts ONLY that physical backend and the whole body
//    re-runs atomically inside BEGIN READ WRITE on a different backend pid.
// 2. An intentional read-only default (ALTER DATABASE, source 'database')
//    fails CLOSED: the retry refuses to override it and nothing is written.
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
// pg is not hoisted to the workspace root; resolve the store copy directly
// (same approach as the other *-postgres.mjs integration checks).
import pg from "../../../../node_modules/.pnpm/pg@8.22.0/node_modules/pg/lib/index.js";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

const url = "postgres://postgres@/udc_qa_txretry?host=/tmp/pgtx&port=54329";
assert.ok(url.includes("/tmp/pgtx"), "local socket only");

const dir = await mkdtemp(fileURLToPath(new URL("../../tmp/txretry-", import.meta.url)));
const out = await build({
  stdin: {
    contents: "export { transactionWithEviction, transactionPinnedRetry } from '../../../../lib/db/src/connection.ts';",
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: "ts",
  },
  platform: "node", format: "esm", bundle: true, packages: "external", write: false,
});
await writeFile(dir + "/conn.mjs", out.outputFiles[0].text);
const { transactionWithEviction } = await import(dir + "/conn.mjs");

const pass = (line) => console.log("PASSED: " + line);
const admin = new pg.Client({ connectionString: url });
await admin.connect();
await admin.query("drop table if exists txretry_t");
await admin.query("create table txretry_t (n int)");
await admin.query("alter database udc_qa_txretry reset default_transaction_read_only");

// ---- Case 1: leaked session-level poison on the pooled backend ------------
const pool = new pg.Pool({ connectionString: url, max: 1 });
const poisoner = await pool.connect();
await poisoner.query("SET default_transaction_read_only TO 'on'");
const poisonPid = (await poisoner.query("select pg_backend_pid() as pid")).rows[0].pid;
poisoner.release();

const logs = [];
const result = await transactionWithEviction(
  pool,
  (client) => drizzle(client),
  async (tx) => {
    await tx.execute(sql`insert into txretry_t values (1)`);
    await tx.execute(sql`insert into txretry_t values (2)`);
    return "committed";
  },
  (line) => logs.push(line),
);
assert.equal(result, "committed");
const eviction = logs.find((l) => l.includes("db_tx_readonly_session_evicted") && l.includes('"attempt":0'));
assert.ok(eviction, "poisoned backend eviction logged");
const pinned = logs.map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .find((e) => e?.event === "db_pinned_tx_state");
assert.ok(pinned, "pinned transaction state logged");
assert.notEqual(pinned.backend_pid, poisonPid, "retry ran on a DIFFERENT physical backend than the poisoned one");
assert.equal(pinned.transaction_read_only, "off", "BEGIN READ WRITE made the retry transaction writable");
const rows1 = await admin.query("select n from txretry_t order by n");
assert.deepEqual(rows1.rows.map((r) => r.n), [1, 2], "exactly one committed copy: failed attempt rolled back, no partial state");
pass("session-poisoned backend evicted; whole transaction re-ran once on a clean backend and committed atomically");
await pool.end();

// ---- Case 1b: partial-write rollback is real -------------------------------
// Case 1's poisoned attempt dies on its FIRST write, so its final [1,2] does
// not by itself prove an already-successful partial write rolls back (review
// point). On a CLEAN backend with a fresh table: the FIRST insert succeeds,
// the SECOND violates a unique constraint, the transaction aborts -> the
// first row must be GONE from the database.
await admin.query("drop table if exists txretry_partial");
await admin.query("create table txretry_partial (n int unique)");
const poolClean = new pg.Pool({ connectionString: url, max: 1 });
let bodyErr;
try {
  await transactionWithEviction(poolClean, (client) => drizzle(client), async (tx) => {
    await tx.execute(sql`insert into txretry_partial values (100)`); // succeeds
    await tx.execute(sql`insert into txretry_partial values (100)`); // unique violation
  }, (line) => logs.push(line));
} catch (error) { bodyErr = error; }
assert.ok(bodyErr, "unique violation aborts the transaction");
const rowsPartial = await admin.query("select count(*)::int as c from txretry_partial");
assert.equal(rowsPartial.rows[0].c, 0, "the successful first write was rolled back with the aborted transaction");
pass("body-stage failure rolls back an already-successful partial write (fresh table stays empty)");
await poolClean.end();

// ---- Case 2: intentional database-level read-only default fails closed ----
await admin.query("alter database udc_qa_txretry set default_transaction_read_only = on");
await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = 'udc_qa_txretry' and pid <> pg_backend_pid()");
const pool2 = new pg.Pool({ connectionString: url, max: 1 });
let rejected;
try {
  await transactionWithEviction(pool2, (client) => drizzle(client), async (tx) => {
    await tx.execute(sql`insert into txretry_t values (9)`);
  }, (line) => logs.push(line));
} catch (error) { rejected = error; }
assert.ok(rejected, "intentional read-only default rejects the write");
assert.match(String(rejected?.message), /intentional read-only default/, "guard identified the intentional source");
const rows2 = await admin.query("select count(*)::int as c from txretry_t");
assert.equal(rows2.rows[0].c, 2, "nothing written against an intentional read-only target");
pass("intentional database-level read-only default fails closed (no override, no write)");
await admin.query("alter database udc_qa_txretry reset default_transaction_read_only");
await pool2.end();

// ---- Case 2b: intentional ROLE-level default (real source 'user') fails closed ----
// The first guard used an allowlist containing 'role', which PostgreSQL never
// emits - ALTER ROLE reports source 'user'. An allowlist miss would have let
// BEGIN READ WRITE override a deliberate role-level read-only. The inverted
// guard (only 'session' is overridable) is verified here against the server.
await admin.query("drop role if exists txretry_ro_role");
await admin.query("create role txretry_ro_role login");
await admin.query("alter role txretry_ro_role set default_transaction_read_only = on");
const pool3 = new pg.Pool({ connectionString: "postgres://txretry_ro_role@/udc_qa_txretry?host=/tmp/pgtx&port=54329", max: 1 });
let rejected3;
try {
  await transactionWithEviction(pool3, (client) => drizzle(client), async (tx) => {
    await tx.execute(sql`insert into txretry_t values (10)`);
  }, (line) => logs.push(line));
} catch (error) { rejected3 = error; }
assert.ok(rejected3, "role-level read-only default rejects the write");
assert.match(String(rejected3?.message), /intentional read-only default \(source user/, "guard names the real 'user' source");
const rows3 = await admin.query("select count(*)::int as c from txretry_t");
assert.equal(rows3.rows[0].c, 2, "nothing written against a role-level read-only default");
pass("intentional role-level read-only default (source 'user') fails closed - allowlist bug would have overridden it");
await pool3.end();
await admin.query("alter role txretry_ro_role reset default_transaction_read_only");
await admin.query("drop role txretry_ro_role");

// ---- Case 2c: session SET MASKING a deliberate role default (real server) --
// The visible pg_settings.source is 'session' (highest priority wins the
// source label), yet an ALTER ROLE read-only exists underneath. The old
// source-only guard would have overridden it; the catalog check must fail
// closed. Proven by calling transactionPinnedRetry directly on a masked
// session (transactionWithEviction is not needed to reach the guard).
await admin.query("drop role if exists txretry_masked");
await admin.query("create role txretry_masked login");
await admin.query("alter role txretry_masked set default_transaction_read_only = on");
const maskedClient = new pg.Client({ connectionString: "postgres://txretry_masked@/udc_qa_txretry?host=/tmp/pgtx&port=54329" });
await maskedClient.connect();
await maskedClient.query("set default_transaction_read_only = on"); // session mask on top of the role default
const src = await maskedClient.query("select (select source from pg_settings where name='default_transaction_read_only') as s");
assert.equal(src.rows[0].s, "session", "precondition: session value masks the role default in pg_settings.source");
const { transactionPinnedRetry } = await import(dir + "/conn.mjs");
let maskedRejected;
try {
  await transactionPinnedRetry(maskedClient, async () => {
    await maskedClient.query("insert into txretry_t values (11)");
  });
} catch (error) { maskedRejected = error; }
assert.ok(maskedRejected, "masked deliberate role default rejects the write");
assert.match(String(maskedRejected?.message), /intentional read-only default/, "catalog check sees through the session mask: " + String(maskedRejected?.message));
const rows4 = await admin.query("select count(*)::int as c from txretry_t");
assert.equal(rows4.rows[0].c, 2, "nothing written under a masked deliberate default");
pass("session mask over a deliberate role-level default fails closed (source-only guard would have overridden)");
await maskedClient.end();
await admin.query("alter role txretry_masked reset default_transaction_read_only");
await admin.query("drop role txretry_masked");

await admin.end();
console.log("ALL DETERMINISTIC CONTAMINATION CHECKS PASSED");
process.exit(0);
