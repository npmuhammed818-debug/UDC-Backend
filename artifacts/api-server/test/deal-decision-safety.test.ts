import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeModelDecision } from "../src/akif/dealDecisionSafety.ts";

const deal = {
  status: "negotiating",
  quantity: "50",
  unit: "MT",
  agreedPrice: "7000",
  currency: "USD",
};

test("never leaks internal JSON when replyToSender has wrong type", () => {
  const decision = normalizeModelDecision({
    content: ````json
{"intent":"status_question","replyToSender":true,"relay":false,"relayToCounterparty":null,"newTradeIntake":false}
````,
    participantRole: "buyer",
    incomingMessage: "what is the status?",
    deal,
  });

  assert.ok(decision);
  assert.equal(decision.intent, "status_question");
  assert.equal(typeof decision.replyToSender, "string");
  assert.doesNotMatch(decision.replyToSender, /"intent"|replyToSender|newTradeIntake/);
  assert.equal(decision.relay, false);
});

test("malformed JSON becomes a safe human reply instead of raw control text", () => {
  const decision = normalizeModelDecision({
    content: `{"intent":"status_question","replyToSender":true,`,
    participantRole: "buyer",
    incomingMessage: "status?",
    deal,
  });

  assert.ok(decision);
  assert.equal(decision.relay, false);
  assert.doesNotMatch(decision.replyToSender, /\{|replyToSender/);
});

test("internal storage paths are never exposed to WhatsApp", () => {
  const decision = normalizeModelDecision({
    content: JSON.stringify({
      intent: "document_request",
      replyToSender: "Your LOI is at storage://udc-documents/deals/8209ec6b-7aa5-4c58-b780-67139249eb9b/loi.pdf",
      relay: false,
      relayToCounterparty: null,
      newTradeIntake: false,
    }),
    participantRole: "seller",
    incomingMessage: "where is the loi",
    deal,
  });

  assert.ok(decision);
  assert.doesNotMatch(decision.replyToSender, /storage:\/\//i);
  assert.doesNotMatch(decision.replyToSender, /[0-9a-f]{8}-[0-9a-f]{4}-/i);
});

test("plain provider errors do not become WhatsApp replies", () => {
  const decision = normalizeModelDecision({
    content: "Rate limit exceeded for provider",
    participantRole: "buyer",
    incomingMessage: "hello",
    deal,
  });

  assert.equal(decision, null);
});

test("normal greetings are never relayed to the counterparty", () => {
  for (const message of ["hi", "Hy", "hello", "hey", "yo", "gm"]) {
    const decision = normalizeModelDecision({
      content: "Hey, I’m here. What do you need?",
      participantRole: "buyer",
      incomingMessage: message,
      deal,
    });
    assert.ok(decision);
    assert.equal(decision.intent, "casual");
    assert.equal(decision.relay, false);
  }
});

test("bare yes without reply context is not treated as commercial acceptance", () => {
  const decision = normalizeModelDecision({
    content: "Got it.",
    participantRole: "seller",
    incomingMessage: "Yes",
    deal,
  });

  assert.ok(decision);
  assert.equal(decision.intent, "casual");
  assert.equal(decision.relay, false);
});

test("bare yes to the exact mediated counteroffer is treated as acceptance", () => {
  const decision = normalizeModelDecision({
    content: "Accepted.",
    participantRole: "seller",
    incomingMessage: "Yes",
    replyContextKind: "mediated_counteroffer:123e4567-e89b-42d3-a456-426614174000",
    deal,
  });

  assert.ok(decision);
  assert.equal(decision.intent, "acceptance");
  assert.equal(decision.relay, true);
});

test("bare no to the exact mediated counteroffer is treated as rejection", () => {
  const decision = normalizeModelDecision({
    content: "Understood.",
    participantRole: "seller",
    incomingMessage: "No",
    replyContextKind: "mediated_counteroffer:123e4567-e89b-42d3-a456-426614174000",
    deal,
  });

  assert.ok(decision);
  assert.equal(decision.intent, "rejection");
  assert.equal(decision.relay, true);
});

test("yes in a document context can never become a price acceptance", () => {
  const decision = normalizeModelDecision({
    content: "Sure.",
    participantRole: "buyer",
    incomingMessage: "Yes",
    replyContextKind: "mediator_reply_document_request:123e4567-e89b-42d3-a456-426614174000",
    deal,
  });

  assert.ok(decision);
  assert.equal(decision.intent, "document_request");
  assert.equal(decision.relay, false);
});

test("natural USD counteroffer is recognized without command phrasing", () => {
  const decision = normalizeModelDecision({
    content: "I’ll check that with the seller.",
    participantRole: "buyer",
    incomingMessage: "can he do $5,900 with payment after SGS?",
    deal,
  });

  assert.ok(decision);
  assert.equal(decision.intent, "counteroffer");
  assert.equal(decision.relay, true);
  assert.match(decision.relayToCounterparty ?? "", /5,900/);
});

test("typo-style questions remain questions and are not blindly forwarded", () => {
  for (const message of ["wht is dlc?", "whr is the doc?", "how much for 100mt?", "can he send it?"]) {
    const decision = normalizeModelDecision({
      content: "I can help with that.",
      participantRole: "buyer",
      incomingMessage: message,
      deal,
    });
    assert.ok(decision);
    assert.notEqual(decision.intent, "acceptance");
  }
});

test("new buyer requirement becomes new trade intake", () => {
  const decision = normalizeModelDecision({
    content: "I can open that requirement.",
    participantRole: "buyer",
    incomingMessage: "I need 100 MT copper scrap delivered to Dubai",
    deal,
  });

  assert.ok(decision);
  assert.equal(decision.newTradeIntake, true);
  assert.equal(decision.relay, false);
});

test("meeting requests are mediated rather than raw-forwarded", () => {
  const decision = normalizeModelDecision({
    content: "I’ll coordinate a meeting.",
    participantRole: "buyer",
    incomingMessage: "Can we arrange a video call tomorrow?",
    deal,
  });

  assert.ok(decision);
  assert.equal(decision.intent, "meeting_request");
  assert.equal(decision.relay, true);
  assert.doesNotMatch(decision.relayToCounterparty ?? "", /^Can we arrange/i);
});

test("structured relay with an internal path is blocked", () => {
  const decision = normalizeModelDecision({
    content: JSON.stringify({
      intent: "document_request",
      replyToSender: "I found the document.",
      relay: true,
      relayToCounterparty: "Open storage://udc-documents/private/file.pdf",
      newTradeIntake: false,
    }),
    participantRole: "buyer",
    incomingMessage: "send the LOI",
    deal,
  });

  assert.ok(decision);
  assert.equal(decision.relay, false);
  assert.equal(decision.relayToCounterparty, null);
});
