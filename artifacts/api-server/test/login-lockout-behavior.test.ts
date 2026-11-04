import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID, createHmac } from "node:crypto";
import { hashPassword } from "../src/auth/passwords.ts";
import { emailCodeHash } from "../src/auth/emailCodes.ts";

// Behavioural proof for the owner-approved recovery rule: when an attacker
// burns the per-email daily password budget, the real owner still logs in
// with the CORRECT password from a fresh network. Real route, real charge logic,
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
    password_recovery_enabled: true,
    verified_email: email, email_verified_at: new Date(),
  };
  const resetChallengeId = randomUUID();
  const resetCode = "123456";
  const digest = (value: string) =>
    createHmac("sha256", secret).update("udc-email-limit-v1\0" + value).digest("hex");
  const state: any = {
    sessions: 0,
    sessionsRevoked: 0,
    limits: {} as Record<string, any>,
    challenge: {
      id: resetChallengeId,
      email,
      code_hash: emailCodeHash(secret, "reset_password", resetChallengeId, user.id, email, resetCode),
      attempts: 0,
      expires_at: new Date(Date.now() + 600_000),
      consumed_at: null,
    },
  };
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
      if (text.startsWith("select id,email,verified_email,email_verified_at,password_recovery_enabled,status from users")) {
        return { rows: String(v.values[0]).toLowerCase() === email ? [user] : [] };
      }
      if (text.startsWith("select id,email,code_hash,attempts,expires_at,consumed_at from email_auth_challenges")) {
        return { rows: v.values[0] === resetChallengeId ? [state.challenge] : [] };
      }
      if (text.startsWith("update email_auth_challenges set attempts=attempts+1")) {
        state.challenge.attempts++;
        state.challenge.consumed_at = new Date();
        return { rows: [] };
      }
      if (text.startsWith("update users set password_hash=")) {
        user.passwordHash = v.values[0];
        return { rows: [] };
      }
      if (text.startsWith("update auth_sessions set revoked_at=")) {
        state.sessionsRevoked++;
        return { rows: [] };
      }
      if (text.startsWith("update email_auth_challenges set consumed_at=coalesce")) {
        state.challenge.consumed_at ??= new Date();
        return { rows: [] };
      }
      if (text.startsWith("insert into audit_logs")) return { rows: [] };
      return { rows: [] };
    },
  };
  (globalThis as any).__loginLockout = state;
  const output = fileURLToPath(new URL(`./login-lockout-${randomUUID()}.mjs`, import.meta.url));
  const result = await build({
    stdin: {
      contents:
        "import express from 'express';import auth from '../src/routes/auth';import emailAuth from '../src/routes/emailAuth';const app=express();app.use(express.json());app.use(auth);app.use(emailAuth);export default app;",
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

    const dailyKey = digest(`pwd-login-day:${email}`);
    const burnedCount = state.limits[dailyKey].count;

    // A fresh wrong guess is refused at the cap and is not charged past it.
    response = await login("Wrong-Password9!");
    assert.equal(response.status, 429, "over-cap wrong guesses are refused");
    assert.equal(state.limits[dailyKey].count, burnedCount);

    // THE OWNER RULE: the real owner, fresh network, correct password.
    response = await login(password);
    assert.equal(response.status, 200,
      "the correct password gets in even when the daily cap is burned");
    assert.equal(state.sessions, 2, "the owner gets a new session");
    assert.equal(state.limits[dailyKey], undefined, "success clears the daily budget");

    // Owner rule, second half: a successful email-code reset also clears the
    // budget. Seed both rows again, prove the emailed code, and land a new hash.
    const pairKey = digest(`pwd-login:${email}:127.0.0.1`);
    state.limits[dailyKey] = { count: 30, window_start: new Date(), last_attempt_at: new Date() };
    state.limits[pairKey] = { count: 10, window_start: new Date(), last_attempt_at: new Date() };
    const oldHash = user.passwordHash;
    response = await fetch(`http://127.0.0.1:${server.address().port}/auth/password/recovery/confirm`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        challengeId: resetChallengeId,
        code: resetCode,
        password: "Fictional-Replacement9!",
      }),
    });
    assert.equal(response.status, 200, "the valid email-code reset succeeds");
    assert.equal(state.limits[dailyKey], undefined, "reset clears the daily budget");
    assert.equal(state.limits[pairKey], undefined, "reset clears the requester pair budget");
    assert.notEqual(user.passwordHash, oldHash, "reset stores the new password hash");
    assert.equal(state.sessionsRevoked, 1, "reset still revokes existing sessions");
  } finally {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await unlink(output);
    delete (globalThis as any).__loginLockout;
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});
