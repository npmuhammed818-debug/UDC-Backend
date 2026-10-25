import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { emailCodeHash, emailCodeMatches } from "../src/auth/emailCodes.ts";

const read = (p: string) => readFile(new URL(p, import.meta.url), "utf8");
const secret = "synthetic-otp-guard-secret-32-characters!!";

// Regression guards for the OTP and session rules in the owner's mandate. These read the
// source (the verifier needs a real database), so they catch removal of a rule, not every
// possible logic bug. A DB-backed behavioural test needs a staging database.
test("code check rejects used, expired, over-attempted or email-changed challenges before comparing", async () => {
  const src = await read("../src/auth/emailAuth.ts");
  const verify = src.slice(src.indexOf("select id,email,code_hash,attempts,expires_at,consumed_at"));
  for (const rule of ["c.consumed_at ||", "epoch(c.expires_at) <= now().getTime()", "c.attempts >= EMAIL_CODE_ATTEMPTS", "c.email !== user.email.trim().toLowerCase()"]) {
    assert.ok(verify.includes(rule), `missing rule: ${rule}`);
    assert.ok(verify.indexOf(rule) < verify.indexOf("emailCodeMatches("), `${rule} must run before the comparison`);
  }
});

test("every attempt is counted and a correct or final-attempt code consumes the challenge", async () => {
  const src = await read("../src/auth/emailAuth.ts");
  assert.ok(src.includes("attempts=attempts+1,consumed_at=${valid || c.attempts + 1 >= EMAIL_CODE_ATTEMPTS ? now() : null}"));
  assert.ok(src.includes("for update"), "challenge row must be locked while checking");
});

test("issuing a new code invalidates earlier unconsumed ones", async () => {
  const src = await read("../src/auth/emailAuth.ts");
  assert.ok(/update email_auth_challenges set consumed_at=\$\{now\(\)\} where user_id=\$\{user\.id\} and purpose=\$\{purpose\} and consumed_at is null/.test(src));
});

test("code digests do not match a different purpose, challenge, user, email or code", () => {
  const base = ["verify_email", "ch1", "u1", "a@b.co", "123456"] as const;
  const h = emailCodeHash(secret, base[0], base[1], base[2], base[3], base[4]);
  assert.ok(emailCodeMatches(h, emailCodeHash(secret, ...base)));
  const variants: Array<[string, string, string, string, string]> = [
    ["reset_password", "ch1", "u1", "a@b.co", "123456"], ["verify_email", "ch2", "u1", "a@b.co", "123456"],
    ["verify_email", "ch1", "u2", "a@b.co", "123456"], ["verify_email", "ch1", "u1", "c@d.co", "123456"],
    ["verify_email", "ch1", "u1", "a@b.co", "123457"],
  ];
  for (const v of variants) assert.ok(!emailCodeMatches(h, emailCodeHash(secret, ...v)), v.join("|"));
});

test("sessions reject revoked and expired tokens; password reset revokes all sessions", async () => {
  const s = await read("../src/auth/sessions.ts");
  assert.ok(s.includes("isNull(authSessionsTable.revokedAt)") && s.includes("gt(authSessionsTable.expiresAt, now)"));
  const e = await read("../src/auth/emailAuth.ts");
  assert.ok(e.includes("update auth_sessions set revoked_at=${now()} where user_id=${user!.id} and revoked_at is null"));
});
