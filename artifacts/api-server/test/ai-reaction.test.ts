import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseAiReaction, reactionDenied, parseAiEmoji, resetAiReactionCooldownForTest } from "../src/whatsapp/aiReaction.ts";

test("deny-list blocks money, legal, identity and sensitive text", () => {
  for (const t of ["price is USD 8400", "please confirm the LOI", "send payment to bank", "my password is x", "I want to withdraw consent", "my passport", "8450001234", "complaint about the deal", "$5", "NCNDA signed", "", "x".repeat(300)]) assert.ok(reactionDenied(t), t);
  for (const t of ["thank you", "hello", "ok got it", "will check and revert"]) assert.ok(!reactionDenied(t), t);
});
test("only allow-listed emoji are accepted", () => {
  assert.equal(parseAiEmoji("🙏"), "🙏"); assert.equal(parseAiEmoji("\"👍\""), "👍");
  for (const bad of ["❤️", "none", "😂", "🙏🙏", "thanks"]) assert.equal(parseAiEmoji(bad), null, bad);
});
test("off by default, denied text never reaches the AI, timeout falls back with cooldown", async () => {
  resetAiReactionCooldownForTest();
  let calls = 0; const ask = async () => { calls++; return "🙏"; };
  delete process.env.UDC_WHATSAPP_AI_REACTIONS;
  assert.equal(await chooseAiReaction("thank you", { ask }), null); assert.equal(calls, 0);
  process.env.UDC_WHATSAPP_AI_REACTIONS = "on";
  try {
    assert.equal(await chooseAiReaction("price is 5 usd", { ask }), null); assert.equal(calls, 0);
    assert.equal(await chooseAiReaction("thank you", { ask }), "🙏"); assert.equal(calls, 1);
    assert.equal(await chooseAiReaction("thank you", { ask: async () => "❤️" }), null);
    assert.equal(await chooseAiReaction("thank you", { ask: () => new Promise<string>(() => undefined), timeoutMs: 20, now: 1000 }), null);
    assert.equal(await chooseAiReaction("thank you", { ask, now: 2000 }), null, "cooldown after a slow AI");
    assert.equal(calls, 1);
  } finally { delete process.env.UDC_WHATSAPP_AI_REACTIONS; resetAiReactionCooldownForTest(); }
});
