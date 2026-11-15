import assert from "node:assert/strict";
import { test } from "node:test";
import { relayOutcomeNote, relayWasDelivered } from "../src/akif/relayOutcome.ts";

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
});
test("unknown outcome says delivery could not be confirmed and promises nothing", () => {
  const n = relayOutcomeNote({ delivered: false, reason: "provider_outcome_unknown" }, "buyer", "D-2");
  assert.match(n, /could not be confirmed/);
  assert.match(n, /Do not say it was passed on/);
  assert.ok(!/try again shortly/.test(n));
});
