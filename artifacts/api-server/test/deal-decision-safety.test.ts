import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeModelDecision } from "../src/akif/dealDecisionSafety.ts";
const deal = {
  status: "negotiation",
  quantity: "50",
  unit: "MT",
  agreedPrice: "7000",
  currency: "USD",
};
const model = (overrides = {}) =>
  JSON.stringify({
    intent: "counteroffer",
    replyToSender: "I’ll check whether $5,900 works.",
    relay: true,
    relayToCounterparty: "Can you do $5,900 per MT?",
    newTradeIntake: false,
    ...overrides,
  });
function decide(message: string, content = model(), context?: string) {
  return normalizeModelDecision({
    content,
    incomingMessage: message,
    participantRole: "buyer",
    replyContextKind: context,
    deal,
  });
}
test("preserves LLM wording and selective relay instead of overwriting it", () => {
  const reply = "You already gave me Dubai. I just need the grade.";
  const decision = decide(
    "Dubai I already said that",
    model({ intent: "clarification", replyToSender: reply, relay: false }),
  );
  assert.equal(decision?.replyToSender, reply);
  assert.equal(decision?.relay, false);
  assert.equal(decision?.relayToCounterparty, null);
  assert.equal(
    decide("Can seller do $5,900?")?.relayToCounterparty,
    "Can you do $5,900 per MT?",
  );
});
test("price mentions and document words do not force relay", () => {
  for (const message of [
    "I said $5,900, remember?",
    "Keep my $6,000 maximum private",
    "Do you already have the FCO?",
  ]) {
    assert.equal(
      decide(message, model({ intent: "deal_question", relay: false }))?.relay,
      false,
    );
  }
});
test("greetings, education, status and unanchored short replies cannot forward", () => {
  for (const message of [
    "hi",
    "hello",
    "yes",
    "no",
    "okay",
    "proceed",
    "what is DLC?",
    "explain SGS",
  ]) {
    assert.equal(decide(message)?.relay, false, message);
  }
  assert.equal(
    decide("status?", model({ intent: "status_question" }))?.relay,
    false,
  );
  assert.equal(
    decide("yes", model(), "mediator_reply_document_request:id")?.intent,
    "document_request",
  );
});
test("exact offer reply preserves generated text without inventing a relay", () => {
  const context = "mediated_counteroffer:123e4567-e89b-42d3-a456-426614174000";
  assert.equal(
    decide("Yes", model({ intent: "acceptance" }), context)?.intent,
    "acceptance",
  );
  assert.equal(
    decide("No", model({ intent: "rejection" }), context)?.intent,
    "rejection",
  );
  assert.equal(decide("Yes", model({ relay: false }), context)?.relay, false);
});
test("a question about proceeding cannot become a confirmed acceptance", () => {
  const decision = decide("Can we proceed with the copper deal?", model({
    intent: "acceptance",
    replyToSender: "Yes, all terms are confirmed. Send the SPA.",
    relayToCounterparty: "All terms are confirmed. Send the SPA.",
  }));
  assert.equal(decision?.intent, "deal_question");
  assert.equal(decision?.replyToSender, "I'll check with the seller before we move ahead.");
  assert.equal(decision?.relayToCounterparty, "Are you ready to proceed with this deal?");
  assert.doesNotMatch(decision?.replyToSender ?? "", /confirmed|SPA/);
});
test("invalid or leaking model replies fail closed", () => {
  for (const content of [
    "Accepted.",
    "{bad json",
    "null",
    model({ replyToSender: true }),
    model({ replyToSender: "API key authentication failed" }),
    model({ replyToSender: "storage://private/file" }),
    model({ replyToSender: "https://hermes-agent.nousresearch.com/docs" }),
  ]) {
    assert.equal(decide("Can you do $5,900?", content), null);
  }
  const decision = decide(
    "send FCO",
    model({ relayToCounterparty: "storage://private/fco" }),
  );
  assert.equal(decision?.relay, false);
});
test("new intake requires model intent and incoming evidence, not a quantity keyword alone", () => {
  assert.equal(
    decide(
      "I need 100 MT copper to Dubai",
      model({ intent: "deal_question", relay: false }),
    )?.newTradeIntake,
    false,
  );
  assert.equal(
    decide(
      "I need 100 MT copper to Dubai",
      model({ intent: "new_trade_intake", newTradeIntake: true }),
    )?.newTradeIntake,
    true,
  );
  assert.equal(
    decide("hello", model({ newTradeIntake: true }))?.newTradeIntake,
    false,
  );
});
