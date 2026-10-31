import { test } from "node:test";
import assert from "node:assert/strict";
import { isVerifyEmailRequest, isBareAcknowledgement } from "../src/whatsapp/intentPhrases.ts";

test("verify email phrases", () => {
  for (const t of ["Verify email", "verify my email", "Send verify email", "please verify my email", "Send me the otp", "send code", "resend otp please", "I want to verify my email.", "confirm my email address"]) assert.ok(isVerifyEmailRequest(t), t);
  for (const t of ["how do I verify my company", "verify the buyer email in the contract please check everything carefully today", "email code 123456", "what is an otp", "send me the invoice"]) assert.ok(!isVerifyEmailRequest(t), t);
});
test("bare acknowledgements get no chat reply", () => {
  for (const t of ["Okay", "Okey", "ok", "Oky.", "thanks", "Got it!"]) assert.ok(isBareAcknowledgement(t), t);
  for (const t of ["ok what is FOB", "okay and CIF?", "thanks for the quote, how much"]) assert.ok(!isBareAcknowledgement(t), t);
});
