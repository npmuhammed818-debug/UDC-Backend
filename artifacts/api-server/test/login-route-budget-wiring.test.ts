import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Wiring guards for the login route's brute-force defenses. A DB-backed
// behavioural test needs staging; these catch removal of a rule.
test("login route charges the per-account budget atomically before verifying", async () => {
  const src = await readFile(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
  const login = src.slice(src.indexOf('router.post("/auth/login"'));
  const charge = login.indexOf("chargePasswordLoginAttempt");
  const verify = login.indexOf("verifyPassword(input.password, user.passwordHash)");
  assert.ok(charge > -1 && verify > -1 && charge < verify,
    "the account budget must be charged inside the transaction before password verification");
  assert.ok(login.includes('for("update")'), "the account row lock must serialize login attempts");
  assert.ok(login.indexOf('kind === "limited"') > -1 && login.includes("too_many_auth_attempts"),
    "over-budget logins get 429");
});

test("login route clears the account budget on success only", async () => {
  const src = await readFile(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
  const login = src.slice(src.indexOf('router.post("/auth/login"'));
  const clear = login.indexOf("clearPasswordLoginBudget");
  const verified = login.indexOf("verifyPassword(input.password, user.passwordHash)");
  assert.ok(clear > -1, "successful logins must clear the account budget");
  assert.ok(verified > -1 && verified < clear, "the budget clears only after a correct password");
  assert.equal((login.match(/clearPasswordLoginBudget/g) ?? []).length, 1, "exactly one clear site, on the success path");
});

test("login route equalizes timing for unknown emails and writes no rows for them", async () => {
  const src = await readFile(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
  const login = src.slice(src.indexOf('router.post("/auth/login"'));
  const unknown = login.slice(login.indexOf("if (!user)"));
  assert.ok(unknown.includes("dummyPasswordHash()"), "unknown emails must still pay the scrypt cost");
  assert.ok(src.includes("hashPassword(randomUUID())"), "the dummy hash must be a real scrypt hash");
  assert.ok(unknown.indexOf("chargePasswordLoginAttempt") === -1 || unknown.indexOf("return { kind: \"invalid\" as const }") < unknown.indexOf("chargePasswordLoginAttempt"),
    "unknown emails must return before the budget charge");
});

test("login and register use the durable per-IP web budget, not an in-memory map", async () => {
  const src = await readFile(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
  assert.ok(!src.includes("isAuthRateLimited") && !src.includes("recordAuthFailure") && !src.includes("clearAuthFailures"),
    "the in-memory limiter must be gone from auth routes");
  assert.equal((src.match(/webAuthBudgetAllowed/g) ?? []).length >= 2, true, "register and login both use the durable budget");
});
