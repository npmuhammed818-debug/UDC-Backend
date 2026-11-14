import { test } from "node:test";
import assert from "node:assert/strict";
import {
  __setRelayPersistenceForTests,
  claimHumanRelay,
  emailGivenInRelay,
  enqueueHumanRelay,
  markHumanRelayAnswered,
  pendingHumanRelay,
  recentHumanRelayContext,
  resetHumanRelay,
} from "../src/akif/humanRelay.ts";

test("claim and pending payloads carry the number's recent history so answers never re-ask", () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();

  enqueueHumanRelay({ phone: "+91 70220 32531", kind: "text", text: "Personal someone@example.com" });
  markHumanRelayAnswered("917022032531");
  enqueueHumanRelay({ phone: "+91 70220 32531", kind: "text", text: "Agent only" });
  const open = enqueueHumanRelay({ phone: "+91 70220 32531", kind: "text", text: "Full name" });
  enqueueHumanRelay({ phone: "919999999999", kind: "text", text: "other number noise" });

  const context = recentHumanRelayContext("917022032531", open.id);
  assert.equal(context.length, 2);
  assert.equal(context[0].text, "Personal someone@example.com");
  assert.equal(context[0].answered, true, "the answered turn is marked answered");
  assert.equal(context[1].text, "Agent only");
  assert.equal(context[1].answered, false);

  const claimed = claimHumanRelay("worker-test");
  assert.equal(claimed?.text, "Agent only", "the oldest answerable item for the phone is claimed first");
  assert.equal(claimed?.context?.length, 2, "the claim carries the recent history");
  assert.ok(claimed?.context?.every((c) => c.text !== "other number noise"), "no other number leaks in");

  const second = claimHumanRelay("worker-test");
  assert.equal(second?.phone, "919999999999", "the newer item for the same phone waits on the active claim");

  const pending = pendingHumanRelay();
  const stillOpen = pending.filter((i) => i.phone === "917022032531");
  assert.equal(stillOpen.length, 2);
  assert.ok(stillOpen.every((i) => Array.isArray(i.context) && i.context.length > 0), "pending items carry context too");

  assert.equal(emailGivenInRelay("917022032531"), "someone@example.com", "the email given earlier is remembered");
  assert.equal(emailGivenInRelay("919999999999"), undefined);

  resetHumanRelay();
});
