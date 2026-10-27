import { test } from "node:test";
import assert from "node:assert/strict";
import { askedAboutPausingDeal, requestedDealPause, dealPauseHowTo } from "../src/deals/dealPauseText.ts";

test("questions about pausing get the how-to, commands do not", () => {
  for (const q of ["should we pause the deal?", "Can I pause this deal", "how do I pause the deal", "can we put the deal on hold?"]) assert.equal(askedAboutPausingDeal(q), true, q);
  for (const c of ["pause deal", "please pause the deal", "CONFIRM PAUSE DEAL", "what is CIF price", "hello", "is the deal done?"]) assert.equal(askedAboutPausingDeal(c), false, c);
  assert.equal(requestedDealPause("pause deal")?.kind, "pause");
  assert.match(dealPauseHowTo, /have not paused/);
});
