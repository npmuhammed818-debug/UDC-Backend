import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// Auth write coverage (18 Nov live finding): the session touch/create/revoke
// and the WhatsApp sign-in request writes must route through dbWrite, so a
// poisoned read-only pooled session is evicted+retried instead of 500ing
// every authenticated request (observed live on /api/admin/db-write-probe).
const state: { writes: string[]; dbWriteCalls: number; sessionRow?: unknown } = { writes: [], dbWriteCalls: 0 };
(globalThis as never as Record<string, unknown>).__authWriteCov = state;
process.env.SESSION_SECRET = "synthetic-session-secret-for-coverage-test!!";

const bundled = fileURLToPath(new URL(`./authcov-${randomUUID()}.mjs`, import.meta.url));
const out = await build({
  stdin: {
    contents: "export { createSession, getAuthenticatedUser, revokeSession } from '../src/auth/sessions.ts'; export { requestWhatsAppSignin } from '../src/auth/whatsappSignin.ts';",
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: "ts",
  },
  platform: 'node', format: 'esm', bundle: true, packages: 'external', write: false,
  plugins: [{ name: 'auth-write-fixture', setup(b) {
    b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: 'db', namespace: 'fixture' }));
    b.onResolve({ filter: /auth\/passwords$/ }, () => ({ path: 'passwords', namespace: 'fixture' }));
    b.onResolve({ filter: /^drizzle-orm$/ }, () => ({ path: 'orm', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => {
      if (args.path === 'db') return { contents: `
        const s=globalThis.__authWriteCov;
        const rec=(op)=>{s.writes.push(op)};
        export const db={
          insert(){return {values(){rec('insert');return Promise.resolve()}}},
          update(){return {set(){return {where(){rec('update');return Promise.resolve()}}}}},
          delete(){return {where(){rec('delete');return Promise.resolve()}}},
          select(){return {from(){return {innerJoin(){return {where(){rec('select');return Promise.resolve(s.sessionRow?[s.sessionRow]:[])}}}}}}},
        };
        export const dbWrite=async(run)=>{s.dbWriteCalls++;return run(db)};
        export const authSessionsTable={_n:'auth_sessions'};
        export const usersTable={_n:'users'};
        export const auditLogsTable={_n:'audit_logs'};
        export const whatsappSigninChallengesTable={_n:'wa_signin_challenges'};
      `, loader: 'js' };
      if (args.path === 'passwords') return { contents: `export const hashPassword=async()=>'synthetic-hash';export const verifyPassword=async()=>true;`, loader: 'js' };
      return { contents: `export const eq=()=>({});export const and=(...a)=>a;export const gt=()=>({});export const isNull=()=>({});export const lt=()=>({});export const sql=()=>({});`, loader: 'js' };
    });
  } }],
});
await writeFile(bundled, out.outputFiles[0].text);
const m = await import(bundled);
process.on("exit", () => unlink(bundled).catch(() => undefined));

test("session create/touch/revoke all route through dbWrite by default", async () => {
  state.writes = []; state.dbWriteCalls = 0;
  await m.createSession("user-1");
  assert.equal(state.dbWriteCalls, 1, "createSession default goes through dbWrite");
  assert.deepEqual(state.writes, ["insert"]);

  state.writes = []; state.dbWriteCalls = 0;
  state.sessionRow = { sessionId: "s1", userId: "user-1", email: null, phone: null, fullName: null, role: "admin", status: "approved" };
  const user = await m.getAuthenticatedUser("synthetic-token");
  assert.ok(user && user.id === "user-1", "user still resolved");
  assert.equal(state.dbWriteCalls, 1, "session touch goes through dbWrite");
  assert.deepEqual(state.writes, ["select", "update"]);

  state.writes = []; state.dbWriteCalls = 0;
  await m.revokeSession("synthetic-token");
  assert.equal(state.dbWriteCalls, 1, "revokeSession goes through dbWrite");
  assert.deepEqual(state.writes, ["update"]);
});

test("transactional callers can still pass their own executor (no double-wrap)", async () => {
  state.writes = []; state.dbWriteCalls = 0;
  const tx = { insert() { state.writes.push("tx-insert"); return { values() { return Promise.resolve(); } }; } };
  await m.createSession("user-1", tx as never);
  assert.equal(state.dbWriteCalls, 0, "explicit tx executor is used directly");
  assert.deepEqual(state.writes, ["tx-insert"]);
});

test("WhatsApp sign-in request writes (cleanup, challenge, audit) all route through dbWrite", async () => {
  state.writes = []; state.dbWriteCalls = 0;
  const out = await m.requestWhatsAppSignin("buyer", "user-1", "203.0.113.7");
  assert.ok(out.code && out.browserToken, "request payload still returned");
  assert.equal(state.dbWriteCalls, 3, "all three writes go through dbWrite");
  assert.deepEqual(state.writes, ["delete", "insert", "insert"]);
});
