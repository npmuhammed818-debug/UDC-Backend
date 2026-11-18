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
    contents: "export { transactionWithEviction } from '../../../../lib/db/src/connection.ts';",
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

await admin.end();
console.log("ALL DETERMINISTIC CONTAMINATION CHECKS PASSED");
process.exit(0);
