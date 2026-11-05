import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { containsAadhaarNumber, mentionsAadhaarDocument, scrubAadhaar } from "../src/privacy/aadhaar.ts";

// 234123412346 passes the Verhoeff check (public UIDAI test pattern); 234123412345 does not.
test("detects Aadhaar-valid numbers only", () => {
  assert.ok(containsAadhaarNumber("my number 2341 2341 2346"));
  assert.ok(containsAadhaarNumber("234123412346"));
  assert.ok(containsAadhaarNumber("2341-2341-2346"));
  assert.ok(!containsAadhaarNumber("234123412345"));
  assert.ok(!containsAadhaarNumber("order 1000 MT price 450"));
  assert.ok(!containsAadhaarNumber("+91 70220 32531"));
  assert.ok(!containsAadhaarNumber(undefined));
});
test("document mentions and scrubbing", () => {
  for (const t of ["aadhaar card", "AADHAR.pdf", "uidai letter"]) assert.ok(mentionsAadhaarDocument(t), t);
  assert.ok(!mentionsAadhaarDocument("passport copy"));
  assert.equal(scrubAadhaar("id 2341 2341 2346 ok"), "id [aadhaar removed] ok");
  assert.equal(scrubAadhaar("qty 234123412345"), "qty 234123412345");
});
test("webhook refuses Aadhaar before any other processing; vault has no Aadhaar type", async () => {
  const wh = await readFile(new URL("../src/routes/whatsappWebhook.ts", import.meta.url), "utf8");
  const loop = wh.indexOf("for (const message of value?.messages");
  const aadhaar = wh.indexOf("containsAadhaarNumber", loop);
  assert.ok(aadhaar > loop && aadhaar < wh.indexOf("whatsappPrivacyGate(message.from", loop), "Aadhaar refusal must precede consent and trade processing");
  assert.ok(wh.indexOf("whatsappPrivacyGate(message.from") > loop + 400);
  const link = await readFile(new URL("../src/vault/uploadLink.ts", import.meta.url), "utf8");
  assert.ok(!/aadhaar|aadhar/i.test(link.slice(0, link.indexOf("CONFIDENTIAL_WORDS"))));
});

test("checksum coincidences in exact UUID record identifiers are not Aadhaar",()=>{
 const id='aaaaaaaa-bbbb-4ccc-8ddd-234123412346';
 assert.equal(containsAadhaarNumber('review photo quote '+id),false);
 assert.equal(containsAadhaarNumber('record '+id+' and ID 2341 2341 2346'),true);
 assert.equal(containsAadhaarNumber('not-a-uuid-234123412346'),true);
});
