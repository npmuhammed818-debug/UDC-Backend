import test from "node:test";
import assert from "node:assert/strict";
import { stripDashBreaks } from "../src/akif/humanRelay.ts";
test("the cleaner never rewrites data: names, codes, links and ranges keep hyphens", () => {
  for (const v of ["Al-Rashid Trading", "al-rashid traders", "Coca-Cola", "code UDC-30B6DC9B8409", "a-b@x.com", "https://wa.me/1?text=JOIN+UDC-AB-1", "in 5-10 days", "-5 degrees"]) assert.equal(stripDashBreaks(v), v);
});
test("sentence break dashes still become commas", () => {
  assert.equal(stripDashBreaks("Sure \u2013 here you go"), "Sure, here you go");
});
test("brain prompt tells the model not to hyphenate its own words but to copy data exactly", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/akif/brainOrchestrator.ts", import.meta.url), "utf8");
  assert.ok(src.includes("never write a dash or hyphen inside words you compose yourself"));
  assert.ok(src.includes("copy people's names, company names, codes, links, emails, numbers and quoted customer data exactly as given"));
});
test("scope redirect gives hyphen free example wording", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/akif/brainOrchestrator.ts", import.meta.url), "utf8");
  assert.ok(src.includes("Example wording, without any hyphen"));
  assert.ok(src.includes("do not copy that wording; write it fresh with no hyphen"));
});
test("ordinary compound words lose the hyphen but data stays intact", () => {
  assert.equal(stripDashBreaks("any trade-related question"), "any trade related question");
  assert.equal(stripDashBreaks("a single-use link and 6-digit code."), "a single use link and 6 digit code.");
  assert.equal(stripDashBreaks("It is well-known, sign-in works"), "It is well known, sign in works");
  for (const v of ["al-rashid traders", "see https://x.com/trade-related", "mail trade-related@x.com", "id 30b6dc9b-8409-4b43", "2026-11-16", "10-15 kg", "UDC-AB-1", "Trade-Related"]) assert.equal(stripDashBreaks(v), v);
});
