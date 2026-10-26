import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildConsentNotice, consentVersion, isExplicitAgree, isWithdrawConsent, noticeHash, TERMS_URL, WITHDRAWN_REPLY } from "../src/privacy/consentNotice.ts";
import { decideWhatsAppConsent } from "../src/privacy/whatsappConsent.ts";

const V = consentVersion("2026-10-21");
test("notice is itemised, businesses-only, links Terms, states no Aadhaar and withdrawal", () => {
  const n = buildConsentNotice("help@example.com");
  for (const needle of ["businesses only", "What we collect, and why", "never collect Aadhaar", "Raw vault documents never go to the AI", TERMS_URL, '"I agree"', "withdraw consent", "complaint"]) assert.ok(n.includes(needle), needle);
  assert.ok(!n.includes("\\n"));
  assert.notEqual(noticeHash(n), noticeHash(n + " "));
});
test("explicit agree only, withdraw recognised", () => {
  for (const t of ["agree", "I agree", " I AGREE. ", "i  agree!"]) assert.ok(isExplicitAgree(t), t);
  for (const t of ["yes", "ok", "I do not agree", "agree to nothing", "", undefined]) assert.ok(!isExplicitAgree(t), String(t));
  for (const t of ["withdraw consent", "Withdraw my consent.", "WITHDRAW"]) assert.ok(isWithdrawConsent(t), t);
  assert.ok(!isWithdrawConsent("I want to withdraw 500 USD"));
});
test("consent decisions: agree only after notice for the current version; withdrawn and old versions re-prompt", () => {
  assert.equal(decideWhatsAppConsent({ text: "I agree", state: "none" }, V), "notice");
  assert.equal(decideWhatsAppConsent({ text: "I agree", state: "notice_sent", version: V }, V), "accept");
  assert.equal(decideWhatsAppConsent({ text: "hello", state: "accepted", version: V }, V), "continue");
  assert.equal(decideWhatsAppConsent({ text: "hello", state: "accepted", version: "2026-10-21" }, V), "notice");
  assert.equal(decideWhatsAppConsent({ text: "hello", state: "withdrawn", version: V }, V), "notice");
  assert.equal(decideWhatsAppConsent({ text: "I agree", state: "withdrawn", version: V }, V), "notice");
});
test("gate logs shown wording hash, reply and withdrawal", async () => {
  const g = await readFile(new URL("../src/privacy/whatsappPrivacyGate.ts", import.meta.url), "utf8");
  for (const s of ["noticeHash", "noticeText", "replyText", "whatsapp_consent_withdrawn", "status: \"withdrawn\""]) assert.ok(g.includes(s), s);
});
test("withdrawal reply says processing stops, notifications off, data kept until deletion request", () => {
  for (const s of ["I will not process your messages, documents or voice notes until you agree to the notice again", "Optional notifications and reminders are off", "kept until you ask for deletion", '"delete my data"', 'send "hi" and agree']) assert.ok(WITHDRAWN_REPLY.includes(s), s);
});
