import { test } from "node:test";
import assert from "node:assert/strict";
import { splitProseHyphens as f } from "../src/akif/proseHyphens.ts";

test("plain lowercase prose compounds lose the hyphen with no word list", () => {
  for (const [i, o] of [["trade-related", "trade related"], ["an end-to-end check", "an end to end check"], ["a buyer-seller-agent flow", "a buyer seller agent flow"], ["(sign-in)", "(sign in)"], ["well-known,", "well known,"], ["plain-new-wordsplit.", "plain new wordsplit."]] as const) assert.equal(f(i), o);
});
test("protected shapes are untouched", () => {
  for (const s of [
    "https://example.com/trade-related-page", "mail me at jean-luc@udc-test.invalid", "Jean-Luc Picard", "Al-Ahram", "UDC-2026-AB12",
    "range 10-20 MT", "dated 2026-11-16", "code ab-12", "invite abc-123-xyz", "file my-report.pdf", "path /a/b-c", "id=abc-def", "quoted \"trade-related\"", "`sign-in`",
    "+91-7994133604", "a-b-c-d-e", "COVID-19", "x86-64",
  ]) assert.equal(f(s), s, s);
});
test("idempotent and keeps surrounding punctuation", () => {
  const t = "Hello, it is trade-related; see https://a.b/c-d and Al-Ahram.";
  assert.equal(f(f(t)), f(t));
  assert.equal(f(t), "Hello, it is trade related; see https://a.b/c-d and Al-Ahram.");
});
