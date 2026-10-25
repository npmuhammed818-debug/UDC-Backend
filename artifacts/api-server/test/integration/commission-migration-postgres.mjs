// WRITTEN BUT NOT EXECUTED (no Postgres server was available when authored).
// Isolated synthetic loopback DB only. Applies the DRAFT widening/rollback SQL (docs/drafts/*.sql.draft) to a
// minimal synthetic public.commissions table that mirrors only the two columns that matter. It tests the SQL
// logic, not the app routes. Run:
//   UDC_COMMISSION_QA_DATABASE_URL=postgresql://udc_dev@127.0.0.1:5432/udc_qa_commission_x \
//   node artifacts/api-server/test/integration/commission-migration-postgres.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
// pg is a dependency of @workspace/db, not of api-server
const pg = createRequire(fileURLToPath(new URL("../../../../lib/db/package.json", import.meta.url)))("pg");
const url = new URL(process.env.UDC_COMMISSION_QA_DATABASE_URL ?? "http://missing.invalid");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.match(url.pathname, /^\/udc_qa_commission_[a-z0-9_]+$/);
const read = (name) => readFile(new URL(`../../../../docs/drafts/${name}`, import.meta.url), "utf8");
const forward = await read("commission-3-decimals-forward.sql.draft");
const rollback = await read("commission-3-decimals-rollback.sql.draft");
const pool = new pg.Pool({ connectionString: url.href });
let checks = 0;
const pass = (l) => { checks++; console.log("PASSED: " + l); };
const scale = async () => (await pool.query("select column_name, numeric_scale from information_schema.columns where table_schema='public' and table_name='commissions' and column_name in ('amount','commission_amount') order by column_name")).rows.map((r) => Number(r.numeric_scale));
try {
  await pool.query("drop table if exists public.commissions");
  await pool.query("create table public.commissions (id serial primary key, amount numeric(18,2) not null, commission_amount numeric(18,2), currency text not null)");
  const existing = [["USD", "1500.50"], ["EUR", "20.00"], ["INR", "7375.00"], ["AED", "100.25"], ["SAR", "9.99"], ["QAR", "1.00"], ["JPY", "250000.00"]];
  for (const [c, a] of existing) await pool.query("insert into public.commissions(amount,commission_amount,currency) values ($1,$1,$2)", [a, c]);
  const before = (await pool.query("select id, amount::text a, commission_amount::text ca, currency from public.commissions order by id")).rows;
  // rollback must refuse nothing to narrow? at scale 2 the narrowing is a no-op; skip. Forward first.
  assert.deepEqual(await scale(), [2, 2]);
  await pool.query(forward);
  assert.deepEqual(await scale(), [3, 3]);
  const after = (await pool.query("select id, amount::text a, commission_amount::text ca, currency from public.commissions order by id")).rows;
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    assert.equal(Number(after[i].a), Number(before[i].a)); assert.equal(Number(after[i].ca), Number(before[i].ca)); assert.equal(after[i].currency, before[i].currency);
  }
  pass("forward widening preserves every existing row exactly (value, currency, count)");
  assert.equal((await pool.query("insert into public.commissions(amount,commission_amount,currency) values ('1500.125','1500.125','OMR') returning amount::text a")).rows[0].a, "1500.125");
  assert.equal((await pool.query("insert into public.commissions(amount,commission_amount,currency) values ('0.001','0.001','BHD') returning amount::text a")).rows[0].a, "0.001");
  pass("3-decimal amounts (OMR, BHD) store exactly after widening");
  await assert.rejects(pool.query(forward), /expected numeric scale 2/);
  pass("forward script refuses to run twice (preflight shape check)");
  await assert.rejects(pool.query(rollback), /cannot narrow/);
  assert.deepEqual(await scale(), [3, 3]);
  pass("rollback refuses while a non-zero third decimal exists, leaving the table unchanged");
  await pool.query("delete from public.commissions where currency in ('OMR','BHD')");
  await pool.query(rollback);
  assert.deepEqual(await scale(), [2, 2]);
  const restored = (await pool.query("select amount::text a, currency from public.commissions order by id")).rows;
  assert.deepEqual(restored.map((r) => [r.currency, r.a]), existing);
  pass("rollback succeeds once no third-decimal data exists and restores the original values");
  console.log(`PASSED: ${checks} synthetic-database migration checks.`);
} finally {
  await pool.query("drop table if exists public.commissions").catch(() => {});
  await pool.end();
}
