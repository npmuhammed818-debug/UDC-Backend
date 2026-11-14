import { test } from "node:test";
import assert from "node:assert/strict";
import { fixFormDumpReply, fixRelayFallbackReply, leaksModelIdentity } from "../src/akif/formDump.ts";

test("relay draft form-dump guard: multi-ask drafts become the one-thing floor", () => {
  const dump = "Sure, I've noted your email. Are you registering as a buyer, seller, or agent? I'll need your full name, company name and registration country (and registration number if you have one) to continue.";
  const fixed = fixFormDumpReply(dump, "Personal someone@example.com");
  assert.equal(fixed, "Hi! Happy to chat. What can I help you with today?");
  const fixedIntent = fixFormDumpReply(dump, "I want to register as a seller");
  assert.match(fixedIntent, /one step at a time/);
  const fine = "Got your email, thanks! Are you joining as a buyer, seller or agent?";
  assert.equal(fixFormDumpReply(fine, "Personal someone@example.com"), fine, "a single-question reply passes unchanged");
  const statement = "Happy to help with that.";
  assert.equal(fixFormDumpReply(statement, "hi"), statement);
});

test("relay draft identity guard: model/provider leaks and junk drafts are rejected", () => {
  const leak = "I’m Chat Generative Pre-trained Transformer (ChatGPT), the AI assistant developed by OpenAI.";
  assert.equal(fixRelayFallbackReply(leak, "Full name"), null, "the exact leak seen live is rejected");
  assert.equal(fixRelayFallbackReply("I am an AI developed by a research lab.", "who are you"), null);
  assert.equal(fixRelayFallbackReply("Sure! As a large language model I can help.", "help"), null);
  assert.equal(fixRelayFallbackReply("Agent", "Agent only"), null, "the one-word echo draft seen live is rejected");
  assert.equal(fixRelayFallbackReply("assistant.", "hi"), null);
  const akifIdentity = "I'm AKIF, UDC's AI assistant. How can I help?";
  assert.equal(fixRelayFallbackReply(akifIdentity, "who are you"), akifIdentity, "AKIF's own AI identity is allowed");
  const normal = "Got it. What's your full name?";
  assert.equal(fixRelayFallbackReply(normal, "ok"), normal);
  assert.equal(leaksModelIdentity("The buyer Claude confirmed the LOI."), false, "a person named Claude is fine");
  assert.equal(leaksModelIdentity("The vessel Gemini arrives Tuesday."), false, "a vessel named Gemini is fine");
});
