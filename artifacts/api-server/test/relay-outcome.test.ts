import assert from "node:assert/strict";
import { test } from "node:test";
import { RELAY_NOT_PASSED_REPLY, RELAY_UNCONFIRMED_REPLY, brainTurnHadExternalSend, noteExternalSend, resetExternalSendsForTest, relayUndeliveredKind, guardRelayClaim, relayOutcomeNote, relayWasDelivered } from "../src/akif/relayOutcome.ts";

test("only an explicit delivered true counts as passed on", () => {
  assert.equal(relayWasDelivered({ delivered: true }), true);
  assert.equal(relayWasDelivered({ delivered: false, reason: "not_configured" }), false);
  assert.equal(relayWasDelivered({ delivered: false, reason: "provider_outcome_unknown" }), false);
  assert.equal(relayWasDelivered(null), false);
  assert.equal(relayWasDelivered(undefined), false);
  assert.equal(relayWasDelivered({}), false);
});
test("a delivered relay keeps the existing confirmation wording", () => {
  const n = relayOutcomeNote({ delivered: true }, "seller", "D-1");
  assert.match(n, /was relayed to the seller for deal D-1/);
  assert.match(n, /you passed it on/);
});
test("not configured never claims it was passed on", () => {
  const n = relayOutcomeNote({ delivered: false, reason: "not_configured" }, "seller", "D-1");
  assert.ok(!/was relayed|passed it on to/.test(n));
  assert.match(n, /could not be sent/);
  assert.ok(!/try again shortly/.test(n), "no retry promise: nothing retries");
});
test("unknown outcome says delivery could not be confirmed and promises nothing", () => {
  const n = relayOutcomeNote({ delivered: false, reason: "provider_outcome_unknown" }, "buyer", "D-2");
  assert.match(n, /could not be confirmed/);
  assert.match(n, /Do not say it was passed on/);
  assert.ok(!/try again shortly/.test(n));
});
test("an overclaiming reply after an unsent relay is replaced with the existing failure clause, a truthful one is kept", () => {
  for (const claim of [
    "Done, I passed your message to the seller and will come back with their reply.",
    "I have forwarded that to the buyer.",
    "Message sent, I will get back with their answer.",
    "I let him know.",
  ]) assert.equal(guardRelayClaim(claim, true), RELAY_NOT_PASSED_REPLY, claim);
  for (const ok of [
    "That did not go through, so the seller has not seen it. Please send it again later.",
    "I could not confirm it was delivered to the seller.",
    "What price would you like to offer?",
  ]) assert.equal(guardRelayClaim(ok, true), ok, ok);
  assert.equal(guardRelayClaim("Done, I passed your message to the seller.", false), "Done, I passed your message to the seller.");
});
test("unknown outcome uses the approved uncertain wording, not the not-sent wording", () => {
  assert.equal(relayUndeliveredKind({ delivered: false, reason: "provider_outcome_unknown" }, false), "unknown");
  assert.equal(relayUndeliveredKind({ delivered: false, reason: "not_configured" }, false), "not_sent");
  assert.equal(relayUndeliveredKind(null, true), "not_sent");
  assert.equal(relayUndeliveredKind({ delivered: true }, false), false);
  assert.equal(guardRelayClaim("Done, I passed your message to the seller.", "unknown"), RELAY_UNCONFIRMED_REPLY);
  assert.equal(RELAY_UNCONFIRMED_REPLY, "I couldn't confirm whether the message went through.");
  assert.equal(guardRelayClaim("Done, I passed your message to the seller.", "not_sent"), RELAY_NOT_PASSED_REPLY);
});
test("a turn that already did an external send is remembered so it is not re-run", () => {
  resetExternalSendsForTest();
  assert.equal(brainTurnHadExternalSend("+1", "m1"), false);
  noteExternalSend("+1", "m1");
  assert.equal(brainTurnHadExternalSend("+1", "m1"), true);
  assert.equal(brainTurnHadExternalSend("+1", "m2"), false);
});
