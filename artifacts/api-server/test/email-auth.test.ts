import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emailCodeHash,
  emailCodeMatches,
  newEmailCode,
} from "../src/auth/emailCodes.ts";
import { deliverAuthEmail } from "../src/auth/emailTransport.ts";
import { sendAuthEmail } from "../src/auth/emailDelivery.ts";
import { passwordSchema } from "../src/privacy/registration.ts";

const secret = "synthetic-email-otp-test-secret-32-characters";
test("email code digests are keyed and bound to purpose, challenge, user and email", () => {
  const original = emailCodeHash(
    secret,
    "verify_email",
    "challenge-a",
    "user-a",
    "qa@example.invalid",
    "00123456",
  );
  assert.match(original, /^[a-f0-9]{64}$/);
  for (const changed of [
    emailCodeHash(
      secret + "x",
      "verify_email",
      "challenge-a",
      "user-a",
      "qa@example.invalid",
      "00123456",
    ),
    emailCodeHash(
      secret,
      "reset_password",
      "challenge-a",
      "user-a",
      "qa@example.invalid",
      "00123456",
    ),
    emailCodeHash(
      secret,
      "verify_email",
      "challenge-b",
      "user-a",
      "qa@example.invalid",
      "00123456",
    ),
    emailCodeHash(
      secret,
      "verify_email",
      "challenge-a",
      "user-b",
      "qa@example.invalid",
      "00123456",
    ),
    emailCodeHash(
      secret,
      "verify_email",
      "challenge-a",
      "user-a",
      "other@example.invalid",
      "00123456",
    ),
    emailCodeHash(
      secret,
      "verify_email",
      "challenge-a",
      "user-a",
      "qa@example.invalid",
      "00123457",
    ),
  ])
    assert.equal(emailCodeMatches(original, changed), false);
  assert.equal(emailCodeMatches(original, original), true);
  assert.equal(emailCodeMatches(original, ""), false);
  assert.equal(emailCodeMatches(original, "f".repeat(63)), false);
  assert.throws(() =>
    emailCodeHash(
      "weak",
      "verify_email",
      "a",
      "b",
      "qa@example.invalid",
      "12345678",
    ),
  );
});
test("codes are eight digits including possible leading zeroes", () => {
  for (let n = 0; n < 100; n++) assert.match(newEmailCode(), /^\d{8}$/);
});
test("default email delivery fails closed and never logs codes or contacts a provider", async (t) => {
  let contacted = false,
    logged = false;
  t.mock.method(globalThis, "fetch", async () => {
    contacted = true;
    throw new Error("unexpected network");
  });
  for (const method of ["log", "warn", "error"] as const)
    t.mock.method(console, method, () => {
      logged = true;
    });
  await assert.rejects(
    sendAuthEmail(
      {
        to: "qa@example.invalid",
        code: "12345678",
        purpose: "verify_email",
        expiresAt: new Date(),
      },
      new AbortController().signal,
    ),
    /email_delivery_unavailable/,
  );
  assert.equal(contacted, false);
  assert.equal(logged, false);
});
test("registration and recovery share a bounded strong password policy", () => {
  for (const input of [
    "short",
    "longpasswordwithoutupper1!",
    "NOLOWERCASE123!",
    "MissingNumber!!",
    "MissingSymbol123",
    "a".repeat(129),
  ])
    assert.equal(passwordSchema.safeParse(input).success, false);
  assert.equal(
    passwordSchema.safeParse("Fictional-New-Password9!").success,
    true,
  );
});

test("email delivery deadline aborts even an unresponsive provider", async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(
    deliverAuthEmail(
      async (_message, abort) => {
        signal = abort;
        await new Promise(() => {});
      },
      {
        to: "qa@example.invalid",
        code: "12345678",
        purpose: "verify_email",
        expiresAt: new Date(),
      },
      1,
    ),
    /email_delivery_unavailable/,
  );
  assert.equal(signal?.aborted, true);
});

test("generic user input cannot set email proof or password recovery eligibility", async () => {
  const { insertUserSchema } =
    await import("../../../lib/db/src/schema/users.ts");
  const input = insertUserSchema.parse({
    email: "qa@example.invalid",
    passwordHash: "synthetic",
    verifiedEmail: "qa@example.invalid",
    emailVerifiedAt: new Date(),
    passwordRecoveryEnabled: true,
  });
  assert.equal("verifiedEmail" in input, false);
  assert.equal("emailVerifiedAt" in input, false);
  assert.equal("passwordRecoveryEnabled" in input, false);
});
