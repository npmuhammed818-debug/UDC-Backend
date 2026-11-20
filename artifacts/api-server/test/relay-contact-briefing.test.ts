import { test } from "node:test";
import assert from "node:assert/strict";
import {
  __setRelayPersistenceForTests,
  claimHumanRelay,
  enqueueHumanRelay,
  pendingHumanRelay,
  resetHumanRelay,
  setRelayContactBriefing,
} from "../src/akif/humanRelay.ts";

// Relay-owner briefings (10 Nov): a per-contact note from the relay owner to
// the reply workers, visible at read time on pending and claim payloads even
// for items already held. Never sent to customers, cleared on redeploy.
test("worker briefing reaches pending and claim payloads for already-held items", () => {
  __setRelayPersistenceForTests(null);
  resetHumanRelay();
  const phone = "910000000099";
  enqueueHumanRelay({ phone, kind: "text", text: "I didn't get any email", draft: null });

  // No briefing yet.
  assert.equal(pendingHumanRelay()[0].workerBriefing, undefined);

  // Briefing set after the item was held still shows at read time.
  setRelayContactBriefing(phone, "No email needed for now; registration is set; never promise an email.");
  assert.equal(pendingHumanRelay()[0].workerBriefing, "No email needed for now; registration is set; never promise an email.");

  const claimed = claimHumanRelay("worker-synthetic");
  assert.equal(claimed?.workerBriefing, "No email needed for now; registration is set; never promise an email.");

  // Clearing the briefing removes it.
  setRelayContactBriefing(phone, "");
  assert.equal(pendingHumanRelay()[0]?.workerBriefing, undefined);

  // Other contacts are unaffected.
  setRelayContactBriefing("910000000098", "unrelated");
  assert.equal(pendingHumanRelay()[0]?.workerBriefing, undefined);
  resetHumanRelay();
});
