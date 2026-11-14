import { test } from "node:test";
import assert from "node:assert/strict";
import {
  windowLimitExceeded,
  PASSWORD_LOGIN_LIMIT,
  PASSWORD_LOGIN_WINDOW_MS,
} from "../src/auth/loginBudget.ts";

test("password login budget: no row means allowed", () => {
  assert.equal(windowLimitExceeded(undefined, 1_000_000, PASSWORD_LOGIN_WINDOW_MS, PASSWORD_LOGIN_LIMIT), false);
});

test("password login budget: under the limit inside the window is allowed", () => {
  const now = 10_000_000;
  assert.equal(
    windowLimitExceeded({ count: PASSWORD_LOGIN_LIMIT - 1, windowStartMs: now - 60_000 }, now, PASSWORD_LOGIN_WINDOW_MS, PASSWORD_LOGIN_LIMIT),
    false,
  );
});

test("password login budget: at the limit inside the window is blocked", () => {
  const now = 10_000_000;
  assert.equal(
    windowLimitExceeded({ count: PASSWORD_LOGIN_LIMIT, windowStartMs: now - 60_000 }, now, PASSWORD_LOGIN_WINDOW_MS, PASSWORD_LOGIN_LIMIT),
    true,
  );
  assert.equal(
    windowLimitExceeded({ count: PASSWORD_LOGIN_LIMIT + 5, windowStartMs: now - 1 }, now, PASSWORD_LOGIN_WINDOW_MS, PASSWORD_LOGIN_LIMIT),
    true,
  );
});

test("password login budget: an expired window resets", () => {
  const now = 10_000_000;
  assert.equal(
    windowLimitExceeded({ count: 999, windowStartMs: now - PASSWORD_LOGIN_WINDOW_MS }, now, PASSWORD_LOGIN_WINDOW_MS, PASSWORD_LOGIN_LIMIT),
    false,
  );
  assert.equal(
    windowLimitExceeded({ count: 999, windowStartMs: now - PASSWORD_LOGIN_WINDOW_MS - 1 }, now, PASSWORD_LOGIN_WINDOW_MS, PASSWORD_LOGIN_LIMIT),
    false,
  );
});
