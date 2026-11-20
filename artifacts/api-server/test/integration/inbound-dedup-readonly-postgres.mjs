// Isolated loopback QA DB only (udc_qa_*), synthetic data, no network.
// Proves: the durable inbound claim stays idempotent, fails closed with InboundDedupUnavailable when the
// database session is read-only (SQLSTATE 25006), and now logs a bounded redacted cause with no message id.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import pg from "/tmp/pgtest/node_modules/pg/lib/index.js";
const url = new URL(process.env.UDC_QA_DATABASE_URL ?? "http://missing.invalid");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
assert.match(url.pathname, /^\/udc_qa_[a-z0-9_]+$/);
for (const key of Object.keys(process.env)) if (/^(SUPABASE_|WHATSAPP_|AKIF_|GROQ_|SESSION_SECRET)/.test(key)) delete process.env[key];
Object.assign(process.env, { SUPABASE_DATABASE_URL: url.href, SESSION_SECRET: randomBytes(32).toString("hex"), NODE_ENV: "production" });
const directory = await mkdtemp(fileURLToPath(new URL("../../tmp/qa-dedup-", import.meta.url)));
const lines = [];
const realWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => { lines.push(String(chunk)); return realWrite(chunk, ...rest); };
let checks = 0; const pass = (l) => { checks++; realWrite("PASSED: " + l + "\n"); };
const admin = new pg.Client({ connectionString: url.href });
let pool;
try {
  await build({
    stdin: { contents: `export { claimInboundMessage, InboundDedupUnavailable } from './src/whatsapp/inboundDedup.ts'; export { pool } from '@workspace/db';`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)), loader: "ts" },
    outfile: directory + "/app.mjs", bundle: true, platform: "node", format: "esm", external: ["pg-native", "@resvg/resvg-js"], logLevel: "silent",
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
  });
  const app = await import(directory + "/app.mjs"); pool = app.pool;
  await admin.connect();
  const id = "wamid.QA-" + randomBytes(6).toString("hex");
  assert.equal(await app.claimInboundMessage(id), true); pass("first claim succeeds");
  assert.equal(await app.claimInboundMessage(id), false); pass("redelivery is not claimed twice (idempotent)");
  // Make every NEW session read-only, then drop the pooled idle clients so the next claim opens a read-only one.
  const db = url.pathname.slice(1);
  await admin.query(`ALTER DATABASE ${db} SET default_transaction_read_only = on`);
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, [db]);
  await new Promise((r) => setTimeout(r, 300));
  lines.length = 0;
  const id2 = "wamid.QA-" + randomBytes(6).toString("hex");
  await assert.rejects(() => app.claimInboundMessage(id2), (e) => e instanceof app.InboundDedupUnavailable);
  pass("read-only session fails closed with InboundDedupUnavailable");
  const logged = lines.join("");
  assert.match(logged, /dedup_claim_cause/); assert.match(logged, /"sqlState":"25006"/); assert.match(logged, /read-only transaction/);
  assert.ok(!logged.includes(id2), "message id must not be logged");
  assert.ok(!logged.includes(url.href) && !logged.includes("postgresql://"), "no connection string in log");
  pass("cause log carries SQLSTATE 25006 and redacted message, no message id");
  await admin.query(`ALTER DATABASE ${db} RESET default_transaction_read_only`);
  await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, [db]);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await app.claimInboundMessage(id2), true); pass("after the session is healthy the same id is claimed once (no lost message, no double)");
  assert.equal(await app.claimInboundMessage(id2), false); pass("and is then deduplicated");
  realWrite(`ALL ${checks} CHECKS PASSED\n`);
} finally { process.stdout.write = realWrite; await admin.end().catch(() => {}); await pool?.end().catch(() => {}); }
