import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_FALLBACK_REPLY, avoidRepeat, claimsUnverifiedFact, classifyTurn, groundedStatusReply, wantsHumanHelp } from "../src/akif/conversationPolicy.ts";

test("human handoff is detected without firing on trade talk", () => {
  for (const t of ["I want to talk to a human", "can I speak with someone from the team", "call me please", "I need to complain", "customer support please help"]) assert.ok(wantsHumanHelp(t), t);
  for (const t of ["I want copper cathode", "my agent in Dubai sent this", "what is a DLC?", "", undefined]) assert.ok(!wantsHumanHelp(t as any), String(t));
});

test("turns: questions and corrections are never taken as the pending answer", () => {
  assert.equal(classifyTurn("100", true), "answer");
  assert.equal(classifyTurn("Jebel Ali", true), "answer");
  assert.equal(classifyTurn("What is CIF?", true), "question");
  assert.equal(classifyTurn("how does DLC work", true), "question");
  assert.equal(classifyTurn("actually it is 200 MT", true), "correction");
  assert.equal(classifyTurn("no, Mombasa", true), "correction");
  assert.equal(classifyTurn("menu", true), "menu_request");
  assert.equal(classifyTurn("hold on", true), "pause");
  assert.equal(classifyTurn("continue", false), "resume");
});

test("a repeated question is rephrased once, a new one is untouched", () => {
  const q = "What is the destination port?";
  assert.equal(avoidRepeat(["Hi", q], "What is the destination port?"), "Just to make sure I have this right - what is the destination port?");
  assert.equal(avoidRepeat(["Hi"], q), q);
});

test("status replies contain only confirmed facts and admit gaps", () => {
  assert.match(groundedStatusReply(null), /won't guess/);
  const empty = groundedStatusReply({});
  assert.match(empty, /No deal status/); assert.match(empty, /no bank confirmation/); assert.match(empty, /no result on file/); assert.match(empty, /no tracking event/);
  const some = groundedStatusReply({ dealStatus: "under_review", latestTrackingEvent: { kind: "departed", at: "2026-11-02", source: "carrier_reported" } });
  assert.match(some, /under_review/); assert.match(some, /departed \(carrier_reported/); assert.match(some, /no bank confirmation/);
});

test("unverified payment, inspection, shipment and match claims are caught", () => {
  assert.ok(claimsUnverifiedFact("Good news, payment has been received.", {}));
  assert.ok(!claimsUnverifiedFact("Good news, payment has been received.", { payment: true }));
  assert.ok(claimsUnverifiedFact("The inspection passed.", { payment: true }));
  assert.ok(claimsUnverifiedFact("Your shipment has departed.", {}));
  assert.ok(claimsUnverifiedFact("I matched you with a seller.", {}));
  assert.ok(!claimsUnverifiedFact("I'm checking whether a seller is available.", {}));
  assert.match(AI_FALLBACK_REPLY, /talk to a person/);
});
