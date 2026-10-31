import test from "node:test";
import assert from "node:assert/strict";
import { trustedGuidanceAnswer, inviteCountAnswer, commissionAnswer } from "../src/akif/udcHandbook.ts";
test("invite count question gets the approved explanation, commission stays blocked", () => {
  assert.equal(trustedGuidanceAnswer("When will my invite count?", "agent"), inviteCountAnswer);
  assert.equal(trustedGuidanceAnswer("how does my referral work?", "agent"), inviteCountAnswer);
  assert.equal(trustedGuidanceAnswer("how much commission per referral?", "agent"), commissionAnswer);
  assert.doesNotMatch(inviteCountAnswer, /%|percent|commission rate/i);
});
