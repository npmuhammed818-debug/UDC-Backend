import { test } from "node:test";
import assert from "node:assert/strict";
import {
  __setRelayPersistenceForTests,
  claimHumanRelay,
  enqueueHumanRelay,
  knownFactsForContact,
  markHumanRelayAnswered,
  pendingHumanRelay,
  RELAY_REPLY_STYLE_NOTE,
  replyAsksKnownDetail,
  resetHumanRelay,
} from "../src/akif/humanRelay.ts";

// Owner verification request (10 Nov): prove with a synthetic multi-turn
// thread that whoever answers sees the full history and the known facts
// (role, name, email, company) before replying, and that a reply asking for
// something already answered is blocked.
test("multi-turn thread: facts are remembered, context is complete, re-asks are blocked", () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const phone = "917028815509";

  // Turn 1: email + personal preference.
  enqueueHumanRelay({ phone, kind: "text", text: "Personal trinitysandra2512@gmail.com" });
  markHumanRelayAnswered(phone);
  // Turn 2: role.
  enqueueHumanRelay({ phone, kind: "text", text: "Agent only" });
  markHumanRelayAnswered(phone);
  // Turn 3: name.
  enqueueHumanRelay({ phone, kind: "text", text: "My full name is Ms.Sandra Victor" });
  markHumanRelayAnswered(phone);
  // Turn 4: company.
  enqueueHumanRelay({ phone, kind: "text", text: "My company name is Trinity General Trading FZC" });
  markHumanRelayAnswered(phone);
  // Turn 5: a fresh message that needs an answer.
  enqueueHumanRelay({ phone, kind: "text", text: "What happens after registration?" });

  // Known facts are assembled from the thread.
  const facts = knownFactsForContact(phone);
  assert.equal(facts.email, "trinitysandra2512@gmail.com");
  assert.equal(facts.name, "Ms.Sandra Victor");
  assert.equal(facts.company, "Trinity General Trading FZC");
  assert.equal(facts.role, "agent");

  // The claiming worker sees every earlier turn, with answered markers.
  const claimed = claimHumanRelay("worker-test");
  assert.equal(claimed?.text, "What happens after registration?");
  const seen = (claimed?.context ?? []).map((c) => c.text);
  assert.deepEqual(seen, [
    "Personal trinitysandra2512@gmail.com",
    "Agent only",
    "My full name is Ms.Sandra Victor",
    "My company name is Trinity General Trading FZC",
  ]);
  assert.ok((claimed?.context ?? []).every((c) => c.answered), "earlier turns show as answered");
  assert.equal(claimed?.replyStyle, RELAY_REPLY_STYLE_NOTE, "the style note rides the claim");

  // Pending view carries the same context and style note.
  const open = pendingHumanRelay().find((i) => i.text === "What happens after registration?");
  assert.equal(open?.context?.length, 4);
  assert.equal(open?.replyStyle, RELAY_REPLY_STYLE_NOTE);

  // The guard blocks re-asking every known fact, and allows real questions.
  assert.equal(replyAsksKnownDetail("Sure! What's your email id?", facts), "email");
  assert.equal(replyAsksKnownDetail("Can you share your full name?", facts), "full name");
  assert.equal(replyAsksKnownDetail("And your company name?", facts), "company name");
  assert.equal(replyAsksKnownDetail("Are you joining as a buyer, seller or agent?", facts), "role");
  assert.equal(replyAsksKnownDetail("Tell me your email", facts), "email");
  assert.equal(replyAsksKnownDetail("Which port should the shipment go to?", facts), null);
  assert.equal(replyAsksKnownDetail("Welcome aboard, Sandra! Your invite code is on the way.", facts), null);
});

test("uncertain threads stay askable: no facts, no blocks", () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const phone = "919999999999";
  enqueueHumanRelay({ phone, kind: "text", text: "hi, I need help" });
  const facts = knownFactsForContact(phone);
  assert.deepEqual(facts, {});
  assert.equal(replyAsksKnownDetail("Happy to help! What's your email id?", facts), null);
  assert.equal(replyAsksKnownDetail("Are you joining as a buyer, seller or agent?", facts), null);
});

test("registered state in the customer note counts as known", () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const phone = "917028815509";
  enqueueHumanRelay({ phone, kind: "text", text: "OK thanks", customerNote: "registered agent, account pending, email not confirmed, invite code UDC-X" });
  const facts = knownFactsForContact(phone);
  assert.equal(facts.role, "agent");
  assert.equal(replyAsksKnownDetail("Are you joining as a buyer, seller or agent?", facts), "role");
});
