import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { shouldSpeakReply, speechTextAllowed, voiceRepliesEnabled } from "../src/akif/voiceReply.ts";

test("only generic short text may be spoken", () => {
  assert.ok(speechTextAllowed("Happy to help. Tell me which product you want to buy and where it should be shipped."));
  for (const t of ["Price is 450 per MT", "see https://x.example", "write to a@b.co", "Total $5", "", "x".repeat(351), "Deal #12", undefined]) assert.ok(!speechTextAllowed(t as string), String(t));
});
test("off by default; needs a voice note from the user", () => {
  assert.equal(voiceRepliesEnabled({}), false);
  assert.equal(voiceRepliesEnabled({ AKIF_VOICE_REPLIES: "on" }), true);
  const reply = "Sure, what product are you looking for?";
  assert.equal(shouldSpeakReply({ userSentVoice: true, reply, enabled: false }), false);
  assert.equal(shouldSpeakReply({ userSentVoice: false, reply, enabled: true }), false);
  assert.equal(shouldSpeakReply({ userSentVoice: true, reply: "Your price is 5", enabled: true }), false);
  assert.equal(shouldSpeakReply({ userSentVoice: true, reply, enabled: true }), true);
});
test("webhook speaks only the guidance reply path and always falls back to text", async () => {
  const w = await readFile(new URL("../src/routes/whatsappWebhook.ts", import.meta.url), "utf8");
  assert.equal((w.match(/trySpeakReply\(/g) || []).length, 1);
  assert.ok(w.includes("if (!spoken) await deliverWhatsAppReply(message.from, guidance)"));
});
