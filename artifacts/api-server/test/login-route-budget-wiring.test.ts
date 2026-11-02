import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Wiring guard for the per-account password budget: the route must pre-check
// the account budget before verifying the password and charge every failure.
// A DB-backed behavioural test needs staging; this catches removal of the rule.
test("login route enforces and charges the per-account password budget", async () => {
  const src = await readFile(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
  const login = src.slice(src.indexOf('router.post("/auth/login"'));
  assert.ok(
    login.indexOf("passwordLoginAllowed") > -1 &&
      login.indexOf("passwordLoginAllowed") < login.indexOf("verifyPassword"),
    "account budget must be checked before the password is verified",
  );
  const invalid = login.slice(login.indexOf('kind === "invalid"'));
  assert.ok(invalid.includes("recordPasswordLoginFailure"), "failed logins must charge the account budget");
  assert.ok(login.includes('429').valueOf() && login.includes("too_many_auth_attempts"), "over-budget logins get 429");
});
