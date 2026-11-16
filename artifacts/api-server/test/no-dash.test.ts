import test from "node:test";
import assert from "node:assert/strict";
import { stripDashBreaks, sanitizeRelayReplyText } from "../src/akif/humanRelay.ts";
test("customer text has no dashes between words", () => {
  assert.equal(stripDashBreaks("a trade\u2011related question"), "a trade related question");
  assert.equal(stripDashBreaks("a trade-related question"), "a trade related question");
  assert.equal(stripDashBreaks("import\u2013export rules"), "import, export rules");
  assert.equal(sanitizeRelayReplyText("Yes - sure, single-use"), "Yes, sure, single use");
});
test("codes, emails, links, numbers keep their hyphens", () => {
  assert.equal(stripDashBreaks("code UDC-30B6DC9B8409"), "code UDC-30B6DC9B8409");
  assert.equal(stripDashBreaks("a-b@x.com"), "a-b@x.com");
  assert.equal(stripDashBreaks("https://wa.me/1?text=JOIN+UDC-AB-1"), "https://wa.me/1?text=JOIN+UDC-AB-1");
  assert.equal(stripDashBreaks("in 5-10 days"), "in 5-10 days");
});
