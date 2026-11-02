import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PASSWORD_LOGIN_DAILY_LIMIT,
  PASSWORD_LOGIN_DAILY_WINDOW_MS,
  PASSWORD_LOGIN_LIMIT,
  PASSWORD_LOGIN_WINDOW_MS,
} from "../src/auth/loginBudget.ts";

// Owner-approved shape (option B): 10 tries per email+network pair per 30
// minutes, plus a per-email daily safety net of 30 across all networks.
test("approved budget values: 10 per pair per 30 minutes, 30 per email per day", () => {
  assert.equal(PASSWORD_LOGIN_LIMIT, 10);
  assert.equal(PASSWORD_LOGIN_WINDOW_MS, 30 * 60_000);
  assert.equal(PASSWORD_LOGIN_DAILY_LIMIT, 30);
  assert.equal(PASSWORD_LOGIN_DAILY_WINDOW_MS, 24 * 60 * 60_000);
});

test("the account budget keys on the email+network pair and a daily email cap", async () => {
  const src = await readFile(new URL("../src/auth/emailAuth.ts", import.meta.url), "utf8");
  assert.ok(src.includes("`pwd-login:${address}:${ip}`"), "pair key must include the network");
  assert.ok(src.includes("`pwd-login-day:${address}`"), "daily key must exist per email");
  const clear = src.slice(src.indexOf("clearPasswordLoginBudget"));
  assert.ok(clear.includes("pwd-login:") && clear.includes("pwd-login-day:"), "success clears both rows");
});

test("the login route passes the client network into the budget", async () => {
  const src = await readFile(new URL("../src/routes/auth.ts", import.meta.url), "utf8");
  assert.ok(src.includes("chargePasswordLoginAttempt(tx, input.email, rateKey)"),
    "the pair budget needs the request's network");
  assert.ok(src.includes("clearPasswordLoginBudget(input.email, rateKey, tx)"),
    "the clear must target the same pair");
});
