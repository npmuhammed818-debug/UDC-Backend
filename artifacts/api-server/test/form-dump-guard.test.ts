import { test } from "node:test";
import assert from "node:assert/strict";
import { formDumpFields, fixFormDumpReply, fixRelayFallbackReply, leaksModelIdentity } from "../src/akif/formDump.ts";

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
test("a single question that names two words is one ask, not a form dump", () => {
  assert.equal(formDumpFields("What is your company name?"), 1);
  assert.equal(formDumpFields("Which country is your company registered in?"), 1);
  assert.equal(formDumpFields("Which country is your business based in?"), 1);
});
test("real lists of details are still form dumps", () => {
  assert.ok(formDumpFields("Could you share your name, email and company?") >= 2);
  assert.ok(formDumpFields("Please also let me know your country and registration number.") >= 2);
  assert.ok(formDumpFields("1. Your name\n2. Your email") >= 2);
});
test("guard edge cases: independent asks without a list marker still count, one choice with 'or' does not", () => {
  assert.ok(formDumpFields("Tell me your name email company") >= 2, "imperative run of fields");
  assert.ok(formDumpFields("What are your name, email and company?") >= 2);
  assert.ok(formDumpFields("What is your name email?") >= 2, "email never collapses");
  assert.ok(formDumpFields("What is your name? What is your email?") >= 2, "two separate questions");
  assert.ok(formDumpFields("Which country is your company in? Also what is your registration number?") >= 2);
  assert.equal(formDumpFields("Are you registering as a buyer or seller?"), 0);
  assert.equal(formDumpFields("Which role would you like to register as, buyer or seller?"), 0);
  assert.equal(formDumpFields("What is your registration number?"), 1);
});

test("a greeting comma before one question is not a list (seen in a model run: 'Great, just one more detail - which country is your company registered in?')", () => {
  assert.equal(formDumpFields("Great, just one more detail \u2013 which country is your company registered in?"), 1);
  assert.equal(formDumpFields("Sure, which country is your company registered in?"), 1);
  assert.equal(formDumpFields("Thanks, what is your company name?"), 1);
});
test("a real list after a greeting comma still counts as a dump", () => {
  assert.ok(formDumpFields("Great, what is your company name, and your country?") >= 2);
  assert.ok(formDumpFields("Sure, please share your email, company and country.") >= 2);
  assert.ok(formDumpFields("Great, tell me your name, email and country?") >= 2);
});
