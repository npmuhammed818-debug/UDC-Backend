import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { shouldSpeakReply, speechTextAllowed, voiceRepliesEnabled } from "../src/akif/voiceReply.ts";

import { AI_FALLBACK_REPLY, HUMAN_HANDOFF_REPLY } from "../src/akif/conversationPolicy.ts";
test("default-deny: only exact allowlisted fixed sentences may be spoken", () => {
  assert.ok(speechTextAllowed(HUMAN_HANDOFF_REPLY));
  assert.ok(speechTextAllowed(AI_FALLBACK_REPLY));
  for (const t of ["Hello Rashid from Acme Traders in Kochi", "Sure, what product are you looking for?", HUMAN_HANDOFF_REPLY + " ", "", undefined, null]) assert.ok(!speechTextAllowed(t as string), String(t));
});
test("off by default; needs a voice note from the user", () => {
  assert.equal(voiceRepliesEnabled({}), false);
  assert.equal(voiceRepliesEnabled({ AKIF_VOICE_REPLIES: "on" }), true);
  const reply = AI_FALLBACK_REPLY;
  assert.equal(shouldSpeakReply({ userSentVoice: true, reply, enabled: false }), false);
  assert.equal(shouldSpeakReply({ userSentVoice: false, reply, enabled: true }), false);
  assert.equal(shouldSpeakReply({ userSentVoice: true, reply: "Hello Rashid from Acme", enabled: true }), false);
  assert.equal(shouldSpeakReply({ userSentVoice: true, reply, enabled: true }), true);
});
test("webhook speaks only the guidance reply path and always falls back to text", async () => {
  const w = await readFile(new URL("../src/routes/whatsappWebhook.ts", import.meta.url), "utf8");
  assert.equal((w.match(/trySpeakReply\(/g) || []).length, 1);
  assert.ok(w.includes("if (!spoken) await deliverWhatsAppReply(message.from, guidance)"));
});
