import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Request, Response } from "express";
import { requireVerifiedAccount } from "../src/auth/verificationGate.ts";

function check(status?: string, emailVerified = false) {
  let code: number | null = null;
  let body: unknown = null;
  let calledNext = 0;
  const req = {
    authUser: status
      ? { id: "test-user", role: "buyer", status, emailVerified }
      : undefined,
  } as unknown as Request;
  const res = {
    status(value: number) {
      code = value;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;
  requireVerifiedAccount(req, res, () => { calledNext++; });
  return { code, body, calledNext };
}

test("unverified buyers/sellers cannot submit trade terms", () => {
  for (const status of ["pending", "under_review", "active", "rejected", "suspended"]) {
    const result = check(status);
    assert.equal(result.code, 403, status);
    assert.deepEqual(result.body, { error: "verification_required" }, status);
    assert.equal(result.calledNext, 0, status);
  }
});

test("proof of email ownership does not bypass human identity verification", () => {
  const result = check("pending", true);
  assert.equal(result.code, 403);
  assert.equal(result.calledNext, 0);
});

test("missing account must never reach marketplace insert code", () => {
  const result = check();
  assert.equal(result.code, 403);
  assert.equal(result.calledNext, 0);
});

test("human-verified account may proceed to role-specific validation and DB insert", () => {
  const result = check("verified");
  assert.equal(result.code, null);
  assert.equal(result.body, null);
  assert.equal(result.calledNext, 1);
});

test("both browser buyer and seller trade write routes enforce the new gate", () => {
  const source = readFileSync(new URL("../src/routes/marketplace.ts", import.meta.url), "utf8");
  assert.match(source, /router\.post\("\/buyer-requests", requireRole\("buyer"\), requireVerifiedAccount,/);
  assert.match(source, /router\.post\("\/seller-listings", requireRole\("seller"\), requireVerifiedAccount,/);
});
