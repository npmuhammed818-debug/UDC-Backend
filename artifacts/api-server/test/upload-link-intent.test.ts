import assert from "node:assert/strict";
import { test } from "node:test";
import { asksForUploadLink, ADD_COMPANY_FIRST } from "../src/whatsapp/uploadLinkIntent.ts";
import { verificationAnswer, udcHandbook } from "../src/akif/udcHandbook.ts";

test("plain upload-link requests are detected, other text is not", () => {
  for (const t of ["Send me the link", "send me the link?", "How to submit docs", "how do I upload documents", "upload documents", "Where do I submit my docs?", "please send me the upload link", "send the document link"]) assert.equal(asksForUploadLink(t), true, t);
  for (const t of ["hello", "what is CIF", "Menu", "my passport is attached", "send me the price", "link to your website", "I will submit docs tomorrow after the deal is signed and the lawyer reviews the draft"]) assert.equal(asksForUploadLink(t), false, t);
});

test("approved wording, no app or Upload documents menu", () => {
  assert.match(verificationAnswer, /Send Menu, tap More options, then Documents, and I will send you a private, single-use upload link/);
  assert.doesNotMatch(udcHandbook, /Upload documents/);
  assert.equal(ADD_COMPANY_FIRST, "Add your company details first (send Menu, then My profile).");
});

import { readFileSync } from "node:fs";
test("first-contact notice return carries the approved Menu line outside the hashed notice", () => {
  const src = readFileSync(new URL("../src/privacy/whatsappPrivacyGate.ts", import.meta.url), "utf8");
  assert.match(src, /MENU_HINT = 'Send "Menu" anytime to see what I can do\.'/);
  assert.equal((src.match(/return consentNoticeWithHint;/g) ?? []).length, 2);
  assert.match(src, /noticeText: consentNotice/);
});
