import { test } from "node:test";
import assert from "node:assert/strict";
import { fixFormDumpReply } from "../src/akif/formDump.ts";

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
