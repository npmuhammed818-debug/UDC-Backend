import { test } from "node:test";
import assert from "node:assert/strict";
import {
  __setRelayPersistenceForTests,
  claimHumanRelay,
  isEmailRelayContact,
  humanRelayActiveFor,
  markHumanRelayAnswered,
  relayContactKey,
  resetHumanRelay,
} from "../src/akif/humanRelay.ts";
import {
  emailRelayContact,
  emailRelayTarget,
  receiveSyntheticEmailRelay,
} from "../src/channels/emailRelayChannel.ts";
import type { EmailEvidence } from "../src/channels/emailPilot.ts";

const ENV = {
  UDC_APP_ENV: "staging",
  UDC_EMAIL_PILOT_MODE: "synthetic",
  AKIF_WHATSAPP_REPLY_SINK: "store",
} as NodeJS.ProcessEnv;

function event(overrides: Partial<EmailEvidence> = {}): EmailEvidence {
  return {
    eventId: "e1",
    messageId: "m1",
    threadId: "t1",
    from: "sandra@trinity.example",
    to: ["udc@updowncircle.site"],
    cc: [],
    subject: "Registration",
    text: "Hello, I want to register as an agent.",
    autoSubmitted: false,
    bulk: false,
    attachments: [],
    ...overrides,
  };
}

const noAccount = { resolveAccount: async () => null };

test("email contact keys keep the address and never get digit-stripped", () => {
  assert.equal(relayContactKey("email:Sandra@Trinity.example"), "email:sandra@trinity.example");
  assert.equal(relayContactKey("+91 70220 32531"), "917022032531");
  assert.ok(isEmailRelayContact("email:sandra@trinity.example"));
  assert.ok(!isEmailRelayContact("917022032531"));
  assert.equal(emailRelayTarget("email:sandra@trinity.example"), "sandra@trinity.example");
  assert.equal(emailRelayTarget("917022032531"), null);
});

test("a synthetic email to the udc mailbox is held in the same relay queue with the rule note", async () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const status = await receiveSyntheticEmailRelay(event(), noAccount, ENV);
  assert.equal(status, "held_for_human_relay");

  const claimed = claimHumanRelay("worker-test");
  assert.equal(claimed?.phone, "email:sandra@trinity.example");
  assert.match(claimed?.text ?? "", /Subject: Registration/);
  assert.match(claimed?.text ?? "", /register as an agent/);
  assert.match(claimed?.customerNote ?? "", /channel email/);
  assert.match(claimed?.customerNote ?? "", /agents may use any email/, "the owner rule rides every email note");
});

test("a registered sender's note carries account state, never a re-ask", async () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const ports = { resolveAccount: async () => ({ role: "agent", status: "pending", verified: false }) };
  const status = await receiveSyntheticEmailRelay(event(), ports, ENV);
  assert.equal(status, "held_for_human_relay");
  const claimed = claimHumanRelay("worker-test");
  assert.match(claimed?.customerNote ?? "", /registered agent, account pending, email not confirmed/);
});

test("gate, audience, loops and attachments fail closed", async () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  assert.equal(await receiveSyntheticEmailRelay(event(), noAccount, { ...ENV, UDC_APP_ENV: "production" }), "disabled");
  assert.equal(await receiveSyntheticEmailRelay(event({ to: ["other@updowncircle.site"] }), noAccount, ENV), "audience_review_required");
  assert.equal(await receiveSyntheticEmailRelay(event({ bulk: true }), noAccount, ENV), "loop_or_bulk_ignored");
  assert.equal(await receiveSyntheticEmailRelay(event({ autoSubmitted: true }), noAccount, ENV), "loop_or_bulk_ignored");
  assert.equal(await receiveSyntheticEmailRelay(event({ attachments: [{ id: "a1", name: "loi.pdf", type: "application/pdf", bytes: 1024 }] }), noAccount, ENV), "private_attachment_review_required");
  assert.equal(await receiveSyntheticEmailRelay(event({ attachments: [{ id: "a1", name: "x.exe", type: "application/x-msdownload", bytes: 1024 }] }), noAccount, ENV), "unsafe_attachment");
  assert.equal(claimHumanRelay("worker-test"), null, "none of the rejected events entered the queue");
});

test("email items keep per-contact ordering and answer marking works by contact", async () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  await receiveSyntheticEmailRelay(event({ messageId: "m1", text: "first question" }), noAccount, ENV);
  await receiveSyntheticEmailRelay(event({ messageId: "m2", text: "second question" }), noAccount, ENV);

  const first = claimHumanRelay("worker-a");
  assert.match(first?.text ?? "", /first question/);
  const blocked = claimHumanRelay("worker-b");
  assert.equal(blocked, null, "the second email from the same sender waits on the active claim");

  const marked = markHumanRelayAnswered("email:sandra@trinity.example");
  assert.equal(marked, 2);
});

test("the relay allowlist admits email contacts only under the synthetic gate", () => {
  assert.equal(humanRelayActiveFor("email:sandra@trinity.example", { ...ENV, AKIF_HUMAN_RELAY_ENABLED: "true" }), true);
  assert.equal(humanRelayActiveFor("email:sandra@trinity.example", { ...ENV, AKIF_HUMAN_RELAY_ENABLED: "true", AKIF_WHATSAPP_REPLY_SINK: "send" }), false);
});

test("emailRelayContact builds the key form", () => {
  assert.equal(emailRelayContact("Sandra@Trinity.example"), "email:sandra@trinity.example");
});
