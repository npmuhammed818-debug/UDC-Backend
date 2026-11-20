import { test } from "node:test";
import assert from "node:assert/strict";
import {
  __clearRelayMemoryForTests,
  __setRelayPersistenceForTests,
  answerClaimedHumanRelayItem,
  claimHumanRelayWithWait,
  enqueueHumanRelay,
  markHumanRelayAnswered,
  pendingHumanRelay,
} from "../src/akif/humanRelay.ts";

const PHONE = "917994133604";

function setup() {
  __setRelayPersistenceForTests(null);
  __clearRelayMemoryForTests();
}

// 16 Nov incident: answering one held message closed older open messages with
// nothing sent. One answer must close exactly one message.
test("answering a claimed item leaves older open items open", async () => {
  setup();
  enqueueHumanRelay({ phone: PHONE, kind: "text", text: "For docs" });
  enqueueHumanRelay({ phone: PHONE, kind: "text", text: "Dlc payment" });
  const claim = await claimHumanRelayWithWait("worker-a", 0);
  assert.ok(claim, "expected a claimable item");
  const answered = answerClaimedHumanRelayItem(claim.id, "worker-a", "DLC is a Letter of Credit.");
  assert.ok(answered, "claimed item must answer");
  const pending = pendingHumanRelay();
  assert.equal(pending.length, 1, "the sibling message must stay open for its own reply");
  assert.equal(pending[0].answeredAt, null);
});

// 16 Nov incident: a phone-level reply must close only the message it answers
// (the newest open item), never the whole backlog.
test("phone-level answer closes only the newest open item", () => {
  setup();
  enqueueHumanRelay({ phone: PHONE, kind: "text", text: "first" });
  enqueueHumanRelay({ phone: PHONE, kind: "text", text: "second" });
  enqueueHumanRelay({ phone: PHONE, kind: "text", text: "third" });
  assert.equal(markHumanRelayAnswered(PHONE, "answer to third"), 1);
  const pending = pendingHumanRelay();
  assert.equal(pending.length, 2);
  assert.deepEqual(pending.map((i) => i.text), ["first", "second"]);
  assert.equal(markHumanRelayAnswered(PHONE, "answer to second"), 1);
  assert.equal(markHumanRelayAnswered(PHONE, "answer to first"), 1);
  assert.equal(pendingHumanRelay().length, 0);
});
