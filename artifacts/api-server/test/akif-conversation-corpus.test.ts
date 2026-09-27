import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeModelDecision, preflightDealDecision } from "../src/akif/dealDecisionSafety.ts";

const deal = {
  status: "negotiation",
  quantity: "50",
  unit: "MT",
  agreedPrice: "7000",
  currency: "USD",
};

function wrongModel(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    intent: "acceptance",
    replyToSender: "Model says something.",
    relay: true,
    relayToCounterparty: "Forward this blindly.",
    newTradeIntake: false,
    ...overrides,
  });
}

test("conversation corpus: greetings never become commercial actions", () => {
  const greetings = [
    "hi", "Hi", "hy", "hello", "Hello", "hey", "yo", "sup", "gm",
    "good morning", "good afternoon", "good evening", "hey.", "hello!",
  ];

  for (const message of greetings) {
    const decision = normalizeModelDecision({
      content: wrongModel(),
      participantRole: "buyer",
      incomingMessage: message,
      deal,
    });
    assert.ok(decision, message);
    assert.equal(decision.intent, "casual", message);
    assert.equal(decision.relay, false, message);
  }
});

test("conversation corpus: unanchored short replies never commit the deal", () => {
  const replies = [
    "yes", "Yes", "yep", "yeah", "yup", "ok", "okay", "sure", "fine",
    "no", "nope", "nah", "done", "go ahead", "proceed",
  ];

  for (const message of replies) {
    const decision = normalizeModelDecision({
      content: wrongModel(),
      participantRole: "seller",
      incomingMessage: message,
      deal,
    });
    assert.ok(decision, message);
    assert.equal(decision.intent, "casual", message);
    assert.equal(decision.relay, false, message);
  }
});

test("conversation corpus: exact counteroffer replies are anchored", () => {
  for (const message of ["yes", "Yes", "yep", "okay", "sure", "go ahead", "proceed"]) {
    const decision = normalizeModelDecision({
      content: wrongModel({ intent: "casual", relay: false, relayToCounterparty: null }),
      participantRole: "seller",
      incomingMessage: message,
      replyContextKind: "mediated_counteroffer:123e4567-e89b-42d3-a456-426614174000",
      deal,
    });
    assert.ok(decision, message);
    assert.equal(decision.intent, "acceptance", message);
    assert.equal(decision.relay, true, message);
  }

  for (const message of ["no", "No", "nope", "nah"]) {
    const decision = normalizeModelDecision({
      content: wrongModel({ intent: "casual", relay: false, relayToCounterparty: null }),
      participantRole: "seller",
      incomingMessage: message,
      replyContextKind: "mediated_counteroffer:123e4567-e89b-42d3-a456-426614174000",
      deal,
    });
    assert.ok(decision, message);
    assert.equal(decision.intent, "rejection", message);
    assert.equal(decision.relay, true, message);
  }
});

test("conversation corpus: obvious counteroffers override a confused model", () => {
  const messages = [
    "can he do $5,900?",
    "can seller do USD 5900 per MT?",
    "make it 5800 usd",
    "price is too high, 5700 USD",
    "counter offer AED 29",
    "can they do 100 MT at $5,900 with payment after SGS?",
    "lower the price to 5600 usd",
    "I can do $5,850 only",
    "buyer can do 5900 USD",
    "seller should make it 5,900 usd/mt",
  ];

  for (const message of messages) {
    const decision = normalizeModelDecision({
      content: wrongModel({ intent: "casual", relay: false, relayToCounterparty: null }),
      participantRole: "buyer",
      incomingMessage: message,
      deal,
    });
    assert.ok(decision, message);
    assert.equal(decision.intent, "counteroffer", message);
    assert.equal(decision.relay, true, message);
    assert.match(decision.relayToCounterparty ?? "", /revised commercial terms/i, message);
  }
});

test("conversation corpus: document requests override a confused model", () => {
  const messages = [
    "send the LOI",
    "share ICPO",
    "provide the FCO",
    "upload the SGS certificate",
    "where is the LOI",
    "whr is the document",
    "send bill of lading",
    "share COA",
    "need the certificate of origin",
    "send SPA please",
  ];

  for (const message of messages) {
    const decision = normalizeModelDecision({
      content: wrongModel({ intent: "casual", relay: false, relayToCounterparty: null }),
      participantRole: "buyer",
      incomingMessage: message,
      deal,
    });
    assert.ok(decision, message);
    assert.equal(decision.intent, "document_request", message);
    assert.equal(decision.relay, true, message);
  }
});

test("conversation corpus: meeting requests are mediated", () => {
  const messages = [
    "can we meet tomorrow?",
    "arrange a meeting",
    "set a video call",
    "can seller join zoom?",
    "book a teams call",
    "I need a call with buyer",
    "meeting at 4 pm?",
  ];

  for (const message of messages) {
    const decision = normalizeModelDecision({
      content: wrongModel({ intent: "casual", relay: false, relayToCounterparty: null }),
      participantRole: "buyer",
      incomingMessage: message,
      deal,
    });
    assert.ok(decision, message);
    assert.equal(decision.intent, "meeting_request", message);
    assert.equal(decision.relay, true, message);
  }
});

test("conversation corpus: explicit acceptance and rejection override a confused model", () => {
  for (const message of [
    "I accept the current terms",
    "we agree",
    "I confirm and want to proceed",
    "we want to move forward",
  ]) {
    const decision = normalizeModelDecision({
      content: wrongModel({ intent: "casual", relay: false, relayToCounterparty: null }),
      participantRole: "buyer",
      incomingMessage: message,
      deal,
    });
    assert.ok(decision, message);
    assert.equal(decision.intent, "acceptance", message);
    assert.equal(decision.relay, true, message);
  }

  for (const message of [
    "I reject the current terms",
    "we decline",
    "we do not accept",
    "not interested",
    "cancel the deal",
  ]) {
    const decision = normalizeModelDecision({
      content: wrongModel({ intent: "casual", relay: false, relayToCounterparty: null }),
      participantRole: "seller",
      incomingMessage: message,
      deal,
    });
    assert.ok(decision, message);
    assert.equal(decision.intent, "rejection", message);
    assert.equal(decision.relay, true, message);
  }
});

test("conversation corpus: general trade education never bothers counterparty", () => {
  const questions = [
    "what is DLC?",
    "wht is sgs?",
    "what is CIF?",
    "what is FOB?",
    "what is ICPO?",
    "what is LOI?",
    "what is FCO?",
    "what is SPA?",
    "what is NCNDA?",
    "what is BCL?",
    "what is POF?",
    "what is POP?",
    "what is MT103?",
    "what does performance bond mean?",
    "explain bill of lading",
  ];

  for (const message of questions) {
    const decision = normalizeModelDecision({
      content: wrongModel({
        intent: "counterparty_question",
        replyToSender: "Here is the explanation.",
        relay: true,
        relayToCounterparty: "User asked a general trade question.",
      }),
      participantRole: "buyer",
      incomingMessage: message,
      deal,
    });
    assert.ok(decision, message);
    assert.equal(decision.relay, false, message);
  }
});

test("conversation corpus: real new requirements override active-deal confusion", () => {
  const requirements = [
    "I need 100 MT copper scrap delivered to Dubai",
    "want 500 MT copper cathode to India",
    "buy 3 tons goat meat to Dubai",
    "need 10 containers apples to Oman",
    "we want 250 MT sugar delivered to Fujairah",
    "I need 200 MT aluminium to Mumbai",
  ];

  for (const message of requirements) {
    const decision = normalizeModelDecision({
      content: wrongModel({ intent: "casual", relay: true }),
      participantRole: "buyer",
      incomingMessage: message,
      deal,
    });
    assert.ok(decision, message);
    assert.equal(decision.newTradeIntake, true, message);
    assert.equal(decision.relay, false, message);
  }
});

test("conversation corpus: model cannot invent a new requirement from normal chat", () => {
  const ordinary = [
    "what is the status?",
    "send me the loi",
    "yes",
    "hello",
    "what is dlc?",
    "can we meet tomorrow?",
    "why is this taking time?",
    "tell me the current price",
  ];

  for (const message of ordinary) {
    const decision = normalizeModelDecision({
      content: wrongModel({
        intent: "new_trade_intake",
        replyToSender: "",
        relay: false,
        relayToCounterparty: null,
        newTradeIntake: true,
      }),
      participantRole: "buyer",
      incomingMessage: message,
      deal,
    });
    assert.ok(decision, message);
    assert.equal(decision.newTradeIntake, false, message);
    assert.notEqual(decision.intent, "new_trade_intake", message);
    assert.notEqual(decision.replyToSender, "", message);
  }
});

test("full scripted buyer-seller conversation keeps roles and relay boundaries", () => {
  const buyerOffer = normalizeModelDecision({
    content: wrongModel({ intent: "casual", relay: false, relayToCounterparty: null }),
    participantRole: "buyer",
    incomingMessage: "Can seller do 100 MT at $5,900/MT with payment after SGS?",
    deal,
  });
  assert.ok(buyerOffer);
  assert.equal(buyerOffer.intent, "counteroffer");
  assert.equal(buyerOffer.relay, true);
  assert.match(buyerOffer.relayToCounterparty ?? "", /can you work/i);
  assert.doesNotMatch(buyerOffer.relayToCounterparty ?? "", /^\s*the\s+(?:buyer|seller)\b/i);

  const sellerAccepts = normalizeModelDecision({
    content: wrongModel({ intent: "casual", relay: false, relayToCounterparty: null }),
    participantRole: "seller",
    incomingMessage: "Yes",
    replyContextKind: "mediated_counteroffer:123e4567-e89b-42d3-a456-426614174000",
    deal,
  });
  assert.ok(sellerAccepts);
  assert.equal(sellerAccepts.intent, "acceptance");
  assert.equal(sellerAccepts.relay, true);
  assert.match(sellerAccepts.relayToCounterparty ?? "", /counteroffer has been accepted/i);
  assert.doesNotMatch(sellerAccepts.relayToCounterparty ?? "", /^\s*the\s+(?:buyer|seller)\b/i);

  const buyerAsksDlc = normalizeModelDecision({
    content: wrongModel({
      intent: "counterparty_question",
      replyToSender: "DLC means Documentary Letter of Credit.",
      relay: true,
      relayToCounterparty: "Ask seller what DLC means.",
    }),
    participantRole: "buyer",
    incomingMessage: "wht is dlc?",
    deal,
  });
  assert.ok(buyerAsksDlc);
  assert.equal(buyerAsksDlc.relay, false);

  const sellerRequestsLoi = normalizeModelDecision({
    content: wrongModel({ intent: "casual", relay: false, relayToCounterparty: null }),
    participantRole: "seller",
    incomingMessage: "send the LOI",
    deal,
  });
  assert.ok(sellerRequestsLoi);
  assert.equal(sellerRequestsLoi.intent, "document_request");
  assert.equal(sellerRequestsLoi.relay, true);

  const buyerMeeting = normalizeModelDecision({
    content: wrongModel({ intent: "casual", relay: false, relayToCounterparty: null }),
    participantRole: "buyer",
    incomingMessage: "Can we arrange a video call tomorrow?",
    deal,
  });
  assert.ok(buyerMeeting);
  assert.equal(buyerMeeting.intent, "meeting_request");
  assert.equal(buyerMeeting.relay, true);
});

test("conversation corpus: internal/provider output never reaches either party", () => {
  const dangerousReplies = [
    "storage://udc-documents/private/loi.pdf",
    "Rate limit exceeded for provider openrouter",
    "API key authentication failed",
    "/opt/render/project/src/private",
    "https://abc.supabase.co/storage/private/file.pdf",
  ];

  for (const bad of dangerousReplies) {
    const decision = normalizeModelDecision({
      content: JSON.stringify({
        intent: "status_question",
        replyToSender: bad,
        relay: true,
        relayToCounterparty: bad,
        newTradeIntake: false,
      }),
      participantRole: "buyer",
      incomingMessage: "status?",
      deal,
    });
    assert.ok(decision, bad);
    assert.doesNotMatch(decision.replyToSender, /storage:\/\/|rate limit|api key|\/opt\/render|supabase\.co\/storage/i, bad);
    assert.equal(decision.relay, false, bad);
    assert.equal(decision.relayToCounterparty, null, bad);
  }
});


test("fast path handles clear trade actions without waiting for a model", () => {
  const cases = [
    ["buyer", "can seller do $5,900?", undefined, "counteroffer", true],
    ["seller", "send the LOI", undefined, "document_request", true],
    ["buyer", "can we arrange a meeting tomorrow?", undefined, "meeting_request", true],
    ["buyer", "I accept the current terms", undefined, "acceptance", true],
    ["seller", "I reject the current terms", undefined, "rejection", true],
    ["seller", "Yes", "mediated_counteroffer:123e4567-e89b-42d3-a456-426614174000", "acceptance", true],
    ["seller", "No", "mediated_counteroffer:123e4567-e89b-42d3-a456-426614174000", "rejection", true],
    ["buyer", "ok", undefined, "casual", false],
  ] as const;

  for (const [participantRole, incomingMessage, replyContextKind, intent, relay] of cases) {
    const decision = preflightDealDecision({
      participantRole,
      incomingMessage,
      replyContextKind,
    });
    assert.ok(decision, incomingMessage);
    assert.equal(decision.intent, intent, incomingMessage);
    assert.equal(decision.relay, relay, incomingMessage);
  }
});

test("active-deal quantity revision is not automatically treated as a new deal", () => {
  const revision = preflightDealDecision({
    participantRole: "buyer",
    incomingMessage: "I want 100 MT at $5,900",
  });
  assert.ok(revision);
  assert.equal(revision.intent, "counteroffer");
  assert.equal(revision.newTradeIntake, false);
});

test("explicit product requirement can become a new trade intake", () => {
  const requirement = preflightDealDecision({
    participantRole: "buyer",
    incomingMessage: "I need 100 MT copper scrap delivered to Dubai",
  });
  assert.ok(requirement);
  assert.equal(requirement.intent, "new_trade_intake");
  assert.equal(requirement.newTradeIntake, true);
});


test("UDC intermediary voice does not narrate buyer or seller handoffs", () => {
  const cases = [
    ["buyer", "can seller do $5,900?", "counteroffer"],
    ["seller", "I accept the current terms", "acceptance"],
    ["buyer", "I reject the current terms", "rejection"],
    ["buyer", "can we arrange a video call tomorrow?", "meeting_request"],
  ] as const;

  for (const [participantRole, incomingMessage, expectedIntent] of cases) {
    const decision = preflightDealDecision({ participantRole, incomingMessage });
    assert.ok(decision, incomingMessage);
    assert.equal(decision.intent, expectedIntent, incomingMessage);
    assert.equal(decision.relay, true, incomingMessage);
    assert.doesNotMatch(decision.relayToCounterparty ?? "", /^\s*the\s+(?:buyer|seller)\b/i, incomingMessage);
    assert.doesNotMatch(decision.relayToCounterparty ?? "", /\b(?:buyer|seller)\s+(?:said|says|asked|requested|wants|confirmed|accepted|rejected|proposed)\b/i, incomingMessage);
  }
});
