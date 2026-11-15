import assert from "node:assert/strict";
import { test } from "node:test";
import { EMAIL_UNAVAILABLE_REPLY, emailToolOutcome, guardEmailClaim } from "../src/akif/emailOutcomeGuard.ts";

// What handleEmailVerification returns when delivery is accepted (the text its own renderNote fallback uses). No email is sent in these tests.
const ACCEPTED = "Check your registered email for a 6-digit code. Reply here with the 6-digit code. It expires in 10 minutes; wait one minute before requesting another.";

test("a failed or unavailable delivery is flagged and the model is told the real result", () => {
  const o = emailToolOutcome(EMAIL_UNAVAILABLE_REPLY);
  assert.equal(o.unavailable, true);
  assert.equal(o.finalReply, EMAIL_UNAVAILABLE_REPLY);
  assert.ok(o.note.includes(EMAIL_UNAVAILABLE_REPLY));
  assert.match(o.note, /never say a code was sent unless this says so/);
  assert.ok(!/step ran/i.test(o.note));
});
test("an accepted send is not flagged and its text reaches the model unchanged", () => {
  const o = emailToolOutcome(ACCEPTED);
  assert.equal(o.unavailable, false);
  assert.equal(o.finalReply, ACCEPTED);
  assert.ok(o.note.includes(ACCEPTED));
});
test("a missing reply uses the existing Verify email fallback and is not an unavailable failure", () => {
  const o = emailToolOutcome(null);
  assert.equal(o.unavailable, false);
  assert.match(o.finalReply, /Send Verify email first/);
});
test("misleading model wording after a failed send is replaced, not only the exact word 'sent'", () => {
  for (const claim of [
    "A 6 digit verification code has been sent to your email.",
    "Your registration is submitted. I'm sending the code now.",
    "Done, the code is on its way.",
    "Please check your inbox for the code.",
    "Check your email for your verification code.",
    "I have emailed you a 6-digit code.",
    "The code was delivered, reply with it here.",
    "Please check your mail.",
    "Share the 6 digit code once you have it.",
  ]) assert.equal(guardEmailClaim(claim, true), EMAIL_UNAVAILABLE_REPLY, claim);
});
test("a reply that makes no sending claim is left alone even after a failed send", () => {
  const r = "Your registration details are saved. I could not do the next step just now.";
  assert.equal(guardEmailClaim(r, true), r);
});
test("when delivery was accepted the model wording is never clobbered", () => {
  for (const r of [
    "A 6 digit verification code has been sent to your email.",
    "Your email is verified and your registration is now saved for UDC review.",
    "Check your inbox, then reply here with the code.",
  ]) assert.equal(guardEmailClaim(r, false), r);
});
test("empty or null replies pass through", () => {
  assert.equal(guardEmailClaim(null, true), null);
  assert.equal(guardEmailClaim("", true), "");
  assert.equal(guardEmailClaim(null, false), null);
});
test("code linkage: the brain uses these helpers (source check, not a brain run)", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/akif/brainOrchestrator.ts", import.meta.url), "utf8");
  assert.match(src, /emailToolOutcome\(reply\)/);
  assert.match(src, /outcome\.unavailable/);
  assert.match(src, /finalReply = guardEmailClaim\(finalReply, emailUnavailable\)/);
  assert.ok(!src.includes('"Email verification step ran."'));
});
