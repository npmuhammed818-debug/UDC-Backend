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
test("webhook speaks only the guidance path and falls back only for known failure", async () => {
  const w = await readFile(new URL("../src/routes/whatsappWebhook.ts", import.meta.url), "utf8");
  assert.equal((w.match(/trySpeakReply\(/g) || []).length, 1);
  assert.ok(w.includes("if (spoken===false) await deliverWhatsAppReply(message.from, guidance)"));
});

test("API allowlist and worker allowlist are identical (cross-language parity)", async () => {
  const { SPEAKABLE_STATIC_REPLIES } = await import("../src/akif/voiceReply.ts");
  const worker = JSON.parse(await readFile(new URL("../../../services/akif-worker/app/speakable_replies.json", import.meta.url), "utf8")) as string[];
  assert.deepEqual([...SPEAKABLE_STATIC_REPLIES].sort(), [...worker].sort());
});
