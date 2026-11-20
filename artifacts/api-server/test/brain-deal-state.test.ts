import { test } from "node:test";
import assert from "node:assert/strict";
import { asksAboutCurrentDeal, DEAL_LOOKUP_FAILED_PROMPT_LINE, NO_DEAL_PROMPT_LINE } from "../src/akif/dealStatePrompt.ts";
import { collectBurst } from "../src/akif/humanRelay.ts";

test("separate webhook bubbles coalesce through the real burst aggregation into a deal-state ask", async () => {
  // 18 Nov incident shape: bubble 1 "What are my current deal", bubble 2
  // "Terms" - the newest bubble takes the turn with all texts combined.
  const [dropped, combined] = await Promise.all([
    collectBurst("+10000000001", "What are my current deal", 20),
    collectBurst("+10000000001", "Terms", 20),
  ]);
  assert.equal(dropped, null); // earlier bubble yields to the newest
  assert.equal(combined, "What are my current deal\nTerms");
  assert.equal(asksAboutCurrentDeal(combined!), true);
});

test("current, unspecified own-deal state asks match", () => {
  assert.equal(asksAboutCurrentDeal("What are my current deal terms"), true);
  assert.equal(asksAboutCurrentDeal("my deal status?"), true);
  assert.equal(asksAboutCurrentDeal("Any update on my deal"), true);
  assert.equal(asksAboutCurrentDeal("current deal details please"), true);
});

test("explicit deal IDs, historical asks and general terminology stay with the existing deal tools", () => {
  assert.equal(asksAboutCurrentDeal("what are the terms of deal UDC-AB12"), false); // explicit ID
  assert.equal(asksAboutCurrentDeal("terms for UDC-XK39 please"), false); // explicit ID
  assert.equal(asksAboutCurrentDeal("what were my previous deal's terms"), false); // historical
  assert.equal(asksAboutCurrentDeal("status of my last deal"), false); // historical
  assert.equal(asksAboutCurrentDeal("what are deal terms on UDC"), false); // general terminology, no own/current marker
  assert.equal(asksAboutCurrentDeal("how do deal terms usually work"), false); // general explanation
  assert.equal(asksAboutCurrentDeal("terms and conditions of the platform"), false);
});

test("non-deal messages and bare words stay out", () => {
  assert.equal(asksAboutCurrentDeal("I have sugar icumsa 45"), false);
  assert.equal(asksAboutCurrentDeal("5000mt"), false);
  assert.equal(asksAboutCurrentDeal("my deal"), false); // no state ask
});

test("no-deal line: plainly no active deal, never ask which deal, draft is not a deal", () => {
  assert.match(NO_DEAL_PROMPT_LINE, /NO deal on record/);
  assert.match(NO_DEAL_PROMPT_LINE, /no active deal yet/);
  assert.match(NO_DEAL_PROMPT_LINE, /never present an unsubmitted offer or requirement draft as a deal/i);
  assert.match(NO_DEAL_PROMPT_LINE, /Do not ask which deal/);
});

test("lookup-failure line: honest cannot-check, and never worded as no-deal", () => {
  assert.match(DEAL_LOOKUP_FAILED_PROMPT_LINE, /could not be checked just now/);
  assert.match(DEAL_LOOKUP_FAILED_PROMPT_LINE, /never guess a deal state/);
  assert.doesNotMatch(DEAL_LOOKUP_FAILED_PROMPT_LINE, /NO deal on record/);
});
