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
  assert.equal(shouldSpeakReply({ userSentVoice: true, reply: "Open https://udc.example/vault/x", enabled: true }), false);
  assert.equal(shouldSpeakReply({ userSentVoice: true, reply, enabled: true }), true);
});
test("webhook speaks through one helper and falls back to text only for a known failure", async () => {
  const w = await readFile(new URL("../src/routes/whatsappWebhook.ts", import.meta.url), "utf8");
  assert.equal((w.match(/speakReply\(/g) || []).length, 1);
  assert.ok(w.includes("if (spoken.status === false) return deliverWhatsAppReply(to, reply);"));
  assert.ok(w.includes('if (spoken.status === "uncertain")'));
  assert.ok(w.includes("deliverAnswer(message.from, guidance, true)"));
});

test("API allowlist and worker allowlist are identical (cross-language parity)", async () => {
  const { SPEAKABLE_STATIC_REPLIES } = await import("../src/akif/voiceReply.ts");
  const worker = JSON.parse(await readFile(new URL("../../../services/akif-worker/app/speakable_replies.json", import.meta.url), "utf8")) as string[];
  assert.deepEqual([...SPEAKABLE_STATIC_REPLIES].sort(), [...worker].sort());
});

import { conversationalSpeechAllowed, speechKind, MAX_SPOKEN_CHARS } from "../src/akif/voiceReply.ts";
import { reserveSpeech, reserveTranscription, resetVoiceLimitsForTests } from "../src/akif/voiceLimits.ts";

test("conversational replies in many languages may be spoken; sensitive ones stay text", () => {
  for (const ok of ["Sure. FOB means the seller loads the goods on the ship.", "The price is 450 USD per metric ton, minimum 25 tons.", "नमस्ते, मैं आपकी मदद कर सकता हूँ।", "Gracias, con gusto le ayudo con el arroz."]) assert.ok(conversationalSpeechAllowed(ok), ok);
  for (const bad of ["Open https://udc.example/vault/x", "Write to buyer@acme.com", "Call +91 98765 43210", "Your OTP is 482913", "Bank account number is on file", "Reply YES to approve the deal", "Please confirm in text", "x ".repeat(MAX_SPOKEN_CHARS), "", undefined]) assert.ok(!conversationalSpeechAllowed(bad as string), String(bad));
});

test("kill switches: master off, conversational off", () => {
  const reply = "Sure. FOB means the seller loads the goods on the ship.";
  assert.equal(speechKind(reply, {}), "none");
  assert.equal(speechKind(reply, { AKIF_VOICE_REPLIES: "on" }), "conversational");
  assert.equal(speechKind(reply, { AKIF_VOICE_REPLIES: "on", AKIF_VOICE_CONVERSATIONAL: "off" }), "none");
  assert.equal(speechKind(AI_FALLBACK_REPLY, { AKIF_VOICE_REPLIES: "on", AKIF_VOICE_CONVERSATIONAL: "off" }), "static");
  assert.equal(shouldSpeakReply({ userSentVoice: false, reply, env: { AKIF_VOICE_REPLIES: "on" } }), false);
});

test("per-user daily voice limits, reset next day, hashed keys", () => {
  resetVoiceLimitsForTests();
  const env = { AKIF_VOICE_TTS_PER_USER_DAILY: "2", AKIF_VOICE_TTS_CHARS_PER_USER_DAILY: "100", AKIF_VOICE_STT_PER_USER_DAILY: "1" };
  const day1 = new Date("2026-10-26T05:00:00Z"), day2 = new Date("2026-10-27T05:00:00Z");
  assert.ok(reserveSpeech("+911", 40, env, day1)); assert.ok(reserveSpeech("+911", 40, env, day1));
  assert.ok(!reserveSpeech("+911", 10, env, day1));
  assert.ok(reserveSpeech("+912", 90, env, day1));
  assert.ok(!reserveSpeech("+912", 20, env, day1));
  assert.ok(reserveSpeech("+911", 40, env, day2));
  assert.ok(reserveTranscription("+911", env, day1)); assert.ok(!reserveTranscription("+911", env, day1));
});

test("voice path never logs audio or transcripts and keys stay out of the API", async () => {
  const files = ["../src/whatsapp/voiceSend.ts", "../src/akif/voiceLimits.ts", "../src/akif/voiceReply.ts"];
  for (const f of files) {
    const src = await readFile(new URL(f, import.meta.url), "utf8");
    assert.ok(!/console\.|logger\.|\.log\(/.test(src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), f);
    assert.ok(!/ELEVENLABS_API_KEY/.test(src), f);
  }
});

import { parseVoiceCommand, VOICE_NOTICE, TEXT_ONLY_CONFIRMATION } from "../src/akif/voiceConsent.ts";
test("'text only' and 'voice on' commands are exact, notice stays plain and mentions the opt-out", () => {
  for (const t of ["text only", "Text only.", "stop voice", "No voice replies", "TEXT ONLY please", "\"text only\""]) assert.equal(parseVoiceCommand(t), "text_only", t);
  for (const t of ["voice on", "Turn on voice replies"]) assert.equal(parseVoiceCommand(t), "voice_on", t);
  for (const t of ["what does text only mean for FOB", "I want the text only version of the contract", "voice note about rice", "", undefined]) assert.equal(parseVoiceCommand(t as string), null, String(t));
  assert.ok(VOICE_NOTICE.includes("ElevenLabs") && VOICE_NOTICE.includes("text only") && VOICE_NOTICE.length < 320);
  assert.ok(TEXT_ONLY_CONFIRMATION.includes("text only"));
});

import { classifyReply } from "../src/akif/voiceReply.ts";
import { VOICE_TEXT_OFFER, parseVoiceRequest, isOfferYes } from "../src/akif/voiceConsent.ts";
import { armExplicitVoice, consumeExplicitVoice, resetVoiceSessionForTests, setVoiceOffer, takeVoiceOffer, textOfferSeconds } from "../src/akif/voiceSession.ts";

test("three reply classes: warm and mixed may be spoken, critical and unsure stay text", () => {
  assert.equal(classifyReply("Happy to help. FOB means the seller loads the goods on the ship."), "warm");
  assert.equal(classifyReply("Good news, your request is with the UDC team and I'll update you tomorrow."), "warm");
  assert.equal(classifyReply("The shipment left on day 3 and should arrive soon."), "mixed");
  for (const t of ["The price is 450 USD per metric ton.", "Payment terms are 30 days after delivery.", "Your invoice total is 12,500.", "Open https://udc.example/x", "Your OTP is 123456", "Bank account details are in the contract.", "Reply YES to approve", "- rice\n- wheat\n- sugar\n- tea", "", undefined]) assert.equal(classifyReply(t as string), "critical", String(t));
  assert.equal(classifyReply("x".repeat(700)), "critical");
});

test("explicit voice request, offer yes and once-only offers", () => {
  for (const t of ["send voice", "Reply in voice please", "voice please", "Send me a voice note!"]) assert.ok(parseVoiceRequest(t), t);
  for (const t of ["what is a voice note", "I sent a voice note earlier", "voice", ""]) assert.ok(!parseVoiceRequest(t), t);
  for (const t of ["yes", "Yes please", "sure", "ok"]) assert.ok(isOfferYes(t), t);
  for (const t of ["yes the price is 40", "no", "maybe later"]) assert.ok(!isOfferYes(t), t);
  assert.equal(VOICE_TEXT_OFFER, "Want this in text? Reply yes.");
  resetVoiceSessionForTests();
  const t0 = 1_000_000;
  setVoiceOffer("+911", "full details", t0);
  assert.equal(takeVoiceOffer("+911", t0 + 60_000), "full details");
  assert.equal(takeVoiceOffer("+911", t0 + 61_000), null); // any next message clears it
  setVoiceOffer("+911", "late", t0);
  assert.equal(takeVoiceOffer("+911", t0 + 11 * 60_000), null); // expires after 10 minutes
  armExplicitVoice("+912", t0);
  assert.equal(consumeExplicitVoice("+912", t0 + 1000), true);
  assert.equal(consumeExplicitVoice("+912", t0 + 2000), false);
  assert.equal(textOfferSeconds({}), 30);
  assert.equal(textOfferSeconds({ AKIF_VOICE_TEXT_OFFER_SECONDS: "20" }), 20);
});
