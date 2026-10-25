import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseReaction, type ReactionMemory } from "../src/whatsapp/reactionPolicy.ts";

test("one reaction per inbound message, spaced per phone, valid ids only", () => {
  const m: ReactionMemory = new Map();
  const t = 1_000_000;
  assert.equal(chooseReaction("ack", "wamid.A", "9170", m, t), "\u{1F440}");
  assert.equal(chooseReaction("complete", "wamid.A", "9170", m, t + 1), null);
  assert.equal(chooseReaction("ack", "wamid.B", "9170", m, t + 5_000), null);
  assert.equal(chooseReaction("complete", "wamid.C", "9170", m, t + 30_000), "\u2705");
  assert.equal(chooseReaction("milestone", "wamid.D", "9170", m, t + 30_001), "\u{1F389}");
  assert.equal(chooseReaction("ack", "wamid.E", "9171", m, t), "\u{1F440}");
  for (const bad of [null, undefined, "", "abc"]) assert.equal(chooseReaction("ack", bad as never, "9172", m, t), null);
  assert.equal(chooseReaction("ack", "wamid.F", "", m, t), null);
});
