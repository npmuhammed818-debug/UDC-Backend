import assert from "node:assert/strict";
import { test } from "node:test";
import { relayDeliveryFailureBody } from "../src/akif/relayDeliveryResult.ts";
test("an unknown outcome is not shown as a plain failure and does not invite a blind retry", () => {
  const b = relayDeliveryFailureBody("provider_outcome_unknown");
  assert.equal(b.outcomeUnknown, true); assert.equal(b.retrySafe, false);
  assert.match(b.message, /may already have/i); assert.match(b.message, /do not resend/i);
  assert.doesNotMatch(b.message, /safe to try again/i);
});
test("a definitive failure says not sent and safe to retry", () => {
  const b = relayDeliveryFailureBody("whatsapp_delivery_failed");
  assert.equal(b.outcomeUnknown, false); assert.equal(b.retrySafe, true);
  assert.match(b.message, /not sent/i);
});
