import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID, createHmac } from "node:crypto";
import { hashPassword } from "../src/auth/passwords.ts";

// Behavioural proof for the owner question: when an attacker burns the
// per-email daily password budget, can the real owner still log in with the
// CORRECT password from a fresh network? Real route, real charge logic,
// fixture database. Email limits are seeded by the same HMAC construction
// the service uses (same secret), never by reaching inside the service.
test("burned daily cap vs the real owner with the correct password", async () => {
  const secret = "synthetic-login-lockout-secret-32!!";
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = secret;
  const password = "Correct-Horse-Password1!";
  const email = "owner@example.invalid";
  const user = {
    id: randomUUID(), email, passwordHash: await hashPassword(password),
    role: "buyer", status: "verified", passwordRecoveryEnabled: true,
  };
  const digest = (value: string) =>
    createHmac("sha256", secret).update("udc-email-limit-v1\0" + value).digest("hex");
  const state: any = { sessions: 0, limits: {} as Record<string, any> };
  const usersTable: any = { name: "users", id: { column: "id" }, email: { column: "email" }, passwordHash: { column: "passwordHash" }, role: { column: "role" }, status: { column: "status" }, passwordRecoveryEnabled: { column: "passwordRecoveryEnabled" } };
  state.db = {
    transaction: async (f: any) => f(state.db),
    select: () => ({
      from: () => ({
        where: (condition: any) => ({
          limit: () => ({
            for: async () =>
              condition?.kind === "sql" &&
              String(condition.values?.[1]).toLowerCase() === user.email
                ? [user]
                : [],
            then: (resolve: any, reject: any) =>
              Promise.resolve(
                condition?.kind === "sql" &&
                  String(condition.values?.[1]).toLowerCase() === user.email
                  ? [user]
                  : [],
              ).then(resolve, reject),
          }),
        }),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => ({}) }) }),
    execute: async (v: any) => {
      const text = (v?.parts ?? []).join("");
      if (text.startsWith("delete from email_auth_limits where key in")) {
        for (const key of v.values) delete state.limits[key];
        return { rows: [] };
      }
      if (text.startsWith("delete from email_auth_limits")) return { rows: [] };
      if (text.includes("from email_auth_limits where key=")) {
        const row = state.limits[v.values[0]];
        return { rows: row ? [row] : [] };
      }
      if (text.startsWith("insert into email_auth_limits")) {
        state.limits[v.values[0]] = { count: v.values[1], window_start: v.values[2], last_attempt_at: v.values[3] };
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  (globalThis as any).__loginLockout = state;
  const output = fileURLToPath(new URL(`./login-lockout-${randomUUID()}.mjs`, import.meta.url));
  const result = await build({
    stdin: {
      contents:
        "import express from 'express';import auth from '../src/routes/auth';const app=express();app.use(express.json());app.use(auth);export default app;",
      resolveDir: fileURLToPath(new URL(".", import.meta.url)),
    },
    bundle: true, platform: "node", format: "esm", packages: "external", write: false,
    plugins: [{
      name: "isolated-login-lockout",
      setup(b) {
        const fixtures: any = {
          db: `const s=globalThis.__loginLockout;export const db=s.db;export const usersTable=${JSON.stringify(usersTable)};export const auditLogsTable={};export const notificationPreferencesTable={};export const referralsTable={};export const companiesTable={};export const dealParticipantsTable={};export const notificationsTable={};export const dealsTable={};`,
          orm: 'export const sql=(parts,...values)=>({kind:"sql",parts,values});export const eq=(a,b)=>({kind:"eq",a,b});export const ne=()=>true;export const and=(...args)=>({kind:"and",args});export const inArray=()=>({kind:"in"});export const desc=(x)=>x;',
          sessions: "const s=globalThis.__loginLockout;export const SESSION_COOKIE='fixture-session';export const createSession=async()=>{s.sessions++;return {token:'synthetic-session',expiresAt:new Date(Date.now()+60000)}};export const revokeSession=async()=>{};export const getAuthenticatedUser=async()=>null;",
          profile: "export const getSafeUserProfile=async id=>({id});",
        };
        for (const [filter, path] of [[/^@workspace\/db$/, "db"], [/^drizzle-orm$/, "orm"], [/auth\/sessions$|^\.\/sessions$/, "sessions"], [/auth\/userProfile$/, "profile"]] as const)
          b.onResolve({ filter }, () => ({ path, namespace: "fixture" }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ contents: fixtures[args.path] }));
      },
    }],
  });
  await writeFile(output, result.outputFiles[0].text);
  let server: any;
  try {
    const { default: app } = await import(output);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const login = (pwd: string, addr = email) =>
      fetch(`http://127.0.0.1:${server.address().port}/auth/login`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: addr, password: pwd }),
      });

    // Control: no attack - the correct password gets in and starts a session.
    let response = await login(password);
    assert.equal(response.status, 200, "control: correct password must log in");
    assert.equal(state.sessions, 1);

    // Attacker from other networks has burned the whole daily budget: 30
    // charged failures inside a live window. (Pair windows rate-limit each
    // network, so reaching 30 takes the attacker repeated windows - the seed
    // is the end state of that grind.)
    state.limits[digest(`pwd-login-day:${email}`)] = {
      count: 30, window_start: new Date(), last_attempt_at: new Date(),
    };

    // A fresh wrong guess is refused at the cap.
    response = await login("Wrong-Password9!");
    assert.equal(response.status, 429, "over-cap wrong guesses are refused");

    // THE QUESTION: the real owner, fresh network, correct password.
    response = await login(password);
    assert.equal(response.status, 429,
      "CURRENT BEHAVIOUR: the owner is also refused until the daily window expires");
    assert.equal(state.sessions, 1, "no new session for the locked-out owner");
  } finally {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await unlink(output);
    delete (globalThis as any).__loginLockout;
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});
